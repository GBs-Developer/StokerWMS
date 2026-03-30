"""
Stoker WMS — Print Agent
Connects to the main server via WebSocket and handles local print jobs.

Requirements: websocket-client, xhtml2pdf
Optional: pywin32 (for win32print printer listing)
Python 3.8+

Install: pip install websocket-client xhtml2pdf
"""

import sys
import os
import json
import time
import logging
import threading
import tempfile
import subprocess
import configparser
import traceback
import socket

# ── Logging ────────────────────────────────────────────────────────────────────
from logging.handlers import RotatingFileHandler

_fmt = logging.Formatter("%(asctime)s %(message)s")
_file_handler = RotatingFileHandler(
    "agent.log", maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
)
_file_handler.setFormatter(_fmt)
_console_handler = logging.StreamHandler(sys.stdout)
_console_handler.setFormatter(_fmt)

logging.basicConfig(level=logging.INFO, handlers=[_console_handler, _file_handler])
log = logging.getLogger("print-agent")

# ── Config ─────────────────────────────────────────────────────────────────────
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.ini")

def load_config():
    cfg = configparser.ConfigParser()
    if not os.path.exists(CONFIG_FILE):
        log.error(f"Arquivo de configuração não encontrado: {CONFIG_FILE}")
        sys.exit(1)
    cfg.read(CONFIG_FILE, encoding="utf-8")
    return cfg

cfg = load_config()
TOKEN       = cfg.get("agent", "token").strip()
MACHINE_ID  = cfg.get("agent", "machine_id", fallback="").strip().upper() or socket.gethostname().upper()
RECONNECT_S = cfg.getint("agent", "reconnect_seconds", fallback=5)
PING_INTERVAL = cfg.getint("agent", "ping_interval", fallback=20)
VERIFY_SSL = cfg.getboolean("agent", "verify_ssl", fallback=True)

try:
    from urllib.parse import urlparse as _urlparse
    _raw = cfg.get("agent", "server_url").strip().rstrip("/")
    _parsed = _urlparse(_raw)
    if not _parsed.scheme:
        _parsed = _urlparse("http://" + _raw)
    SERVER_BASE = f"{_parsed.scheme}://{_parsed.netloc}"
except Exception:
    SERVER_BASE = cfg.get("agent", "server_url").strip().rstrip("/")

WS_URL = SERVER_BASE.replace("https://", "wss://").replace("http://", "ws://") + "/ws/print-agent"


# ── Validação de dependências na inicialização ────────────────────────────────

def _check_dependencies():
    """Verifica se todas as dependências estão instaladas antes de iniciar."""
    missing = []
    try:
        import websocket  # noqa: F401
    except ImportError:
        missing.append("websocket-client")
    try:
        from xhtml2pdf import pisa  # noqa: F401
    except ImportError:
        missing.append("xhtml2pdf")
    if missing:
        log.error(f"Dependências faltando: {', '.join(missing)}")
        log.error(f"Execute: pip install {' '.join(missing)}")
        sys.exit(1)

_check_dependencies()


# ── Printer detection (Windows) ────────────────────────────────────────────────

def get_printers():
    """Returns list of installed printers on this Windows machine."""
    printers = []
    try:
        import win32print
        default = win32print.GetDefaultPrinter()
        flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        for p in win32print.EnumPrinters(flags, None, 4):
            name = p.get("pPrinterName", "")
            if name:
                printers.append({"name": name, "isDefault": name == default})
    except ImportError:
        try:
            result = subprocess.run(
                ["powershell", "-Command",
                 "Get-Printer | Select-Object -ExpandProperty Name"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                names = [n.strip() for n in result.stdout.strip().splitlines() if n.strip()]
                printers = [{"name": n, "isDefault": False} for n in names]
        except Exception:
            pass
    except Exception as e:
        log.warning(f"Erro ao listar impressoras: {e}")
    return printers

# ── HTML → PDF via xhtml2pdf (sem Chrome, sem navegador) ──────────────────────

def find_sumatra():
    """Finds SumatraPDF executable."""
    candidates = [
        r"C:\Program Files\SumatraPDF\SumatraPDF.exe",
        r"C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe",
        os.path.join(os.path.dirname(__file__), "SumatraPDF.exe"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

_pdf_lock = threading.Lock()

def _strip_external_fonts(html: str) -> str:
    """Remove @font-face rules and Google Fonts imports that xhtml2pdf can't handle."""
    import re
    html = re.sub(r'@font-face\s*\{[^}]*\}', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'@import\s+url\([^)]*fonts[^)]*\)\s*;?', '', html, flags=re.IGNORECASE)
    html = re.sub(r'<link[^>]*fonts\.googleapis\.com[^>]*/?\s*>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'<link[^>]*fonts\.gstatic\.com[^>]*/?\s*>', '', html, flags=re.IGNORECASE)
    return html

_PDF_TIMEOUT = 30

def _generate_pdf_worker(html_content: str, pdf_path: str) -> str:
    """Worker que roda em thread separada para poder ter timeout."""
    import logging as _logging
    _logging.getLogger("xhtml2pdf").setLevel(_logging.CRITICAL)
    _logging.getLogger("reportlab").setLevel(_logging.CRITICAL)
    _logging.getLogger("html5lib").setLevel(_logging.CRITICAL)

    from xhtml2pdf import pisa

    with open(pdf_path, "wb") as pdf_file:
        status = pisa.CreatePDF(html_content, dest=pdf_file)

    if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 100:
        return "ok"

    return f"xhtml2pdf falhou (err={getattr(status, 'err', '?')})"

def generate_pdf(html_content: str, pdf_path: str, job_id: str) -> bool:
    """
    Gera PDF a partir de HTML usando xhtml2pdf com timeout.
    Sem Chrome, sem navegador, sem porta de debug, sem WebSocket.
    """
    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

    html_content = _strip_external_fonts(html_content)

    with _pdf_lock:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_generate_pdf_worker, html_content, pdf_path)
            try:
                result = future.result(timeout=_PDF_TIMEOUT)
            except FuturesTimeout:
                raise RuntimeError(f"xhtml2pdf timeout ({_PDF_TIMEOUT}s)")

        if result == "ok":
            return True

        raise RuntimeError(result)


# ── Limpeza de arquivos temporários antigos na inicialização ──────────────────

def _cleanup_stale_temp_files():
    """Remove arquivos stoker_* com mais de 1 hora no temp."""
    tmp = tempfile.gettempdir()
    cutoff = time.time() - 3600
    try:
        for f in os.listdir(tmp):
            if f.startswith("stoker_"):
                full = os.path.join(tmp, f)
                try:
                    if os.path.getmtime(full) < cutoff:
                        if os.path.isdir(full):
                            import shutil
                            shutil.rmtree(full, ignore_errors=True)
                        else:
                            os.remove(full)
                except Exception:
                    pass
    except Exception:
        pass

_cleanup_stale_temp_files()


# ── Impressão ─────────────────────────────────────────────────────────────────

MAX_RETRIES = 2

def print_html(html: str, printer: str, copies: int) -> dict:
    """Converts HTML to PDF via xhtml2pdf (pure Python), then sends to printer."""
    tmp = tempfile.gettempdir()
    job_id = os.urandom(4).hex()
    pdf_path = os.path.join(tmp, f"stoker_{job_id}.pdf")

    try:
        t_start = time.time()

        last_error = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                if os.path.exists(pdf_path):
                    os.remove(pdf_path)
                generate_pdf(html, pdf_path, job_id)
                last_error = None
                break
            except Exception as e:
                last_error = e
                if attempt < MAX_RETRIES:
                    time.sleep(0.5)

        if last_error:
            log.error(f"[{job_id}] ✗ PDF falhou após {MAX_RETRIES} tentativas: {last_error}")
            return {"success": False, "error": f"Falha ao gerar PDF: {last_error}"}

        sumatra = find_sumatra()
        if not sumatra:
            try:
                import win32api
                for _ in range(max(1, min(copies, 99))):
                    win32api.ShellExecute(0, "print", pdf_path, f'"{printer}"', ".", 0)
                    time.sleep(0.3)
                t_total = time.time() - t_start
                log.info(f"[{job_id}] ✓ '{printer}' x{copies} ({t_total:.1f}s)")
                return {"success": True}
            except ImportError:
                return {"success": False, "error": "SumatraPDF não encontrado. Baixe em https://www.sumatrapdfreader.org/"}

        for i in range(max(1, min(copies, 99))):
            sumatra_cmd = [
                sumatra,
                "-print-to", printer,
                "-print-settings", "noscale",
                "-silent",
                pdf_path,
            ]
            r = subprocess.run(sumatra_cmd, timeout=30, capture_output=True)
            if r.returncode != 0:
                stderr_msg = (r.stderr or b"").decode("utf-8", errors="replace").strip()
                detail = f" ({stderr_msg[:200]})" if stderr_msg else ""
                log.error(f"[{job_id}] ✗ Falha na impressão cópia {i+1}{detail}")
                return {"success": False, "error": f"SumatraPDF retornou erro na cópia {i+1}.{detail}"}
            if copies > 1:
                time.sleep(0.2)

        t_total = time.time() - t_start
        log.info(f"[{job_id}] ✓ '{printer}' x{copies} ({t_total:.1f}s)")
        return {"success": True}

    except subprocess.TimeoutExpired:
        log.error(f"[{job_id}] ✗ Timeout (>30s)")
        return {"success": False, "error": "Timeout ao imprimir (>30s)."}
    except Exception as e:
        log.error(f"[{job_id}] ✗ {e}")
        return {"success": False, "error": str(e)}
    finally:
        try:
            if os.path.exists(pdf_path):
                os.remove(pdf_path)
        except Exception:
            pass

# ── WebSocket Agent ────────────────────────────────────────────────────────────

import websocket
from concurrent.futures import ThreadPoolExecutor

_print_pool = ThreadPoolExecutor(max_workers=3, thread_name_prefix="print")

class PrintAgent:
    def __init__(self):
        self._ws = None
        self._running = True
        self._registered = False
        self._ping_thread = None
        self._send_lock = threading.Lock()

    def send(self, msg: dict):
        """Thread-safe JSON send. Silently ignores if not connected."""
        with self._send_lock:
            try:
                ws = self._ws
                if ws and ws.sock and ws.sock.connected:
                    ws.send(json.dumps(msg))
            except Exception:
                pass

    def on_open(self, ws):
        self._registered = False
        printers = get_printers()
        self.send({
            "type": "register",
            "token": TOKEN,
            "machineId": MACHINE_ID,
            "printers": printers,
        })

    def on_message(self, ws, data):
        try:
            msg = json.loads(data)
        except Exception:
            return

        msg_type = msg.get("type", "")

        if msg_type == "registered":
            self._registered = True
            name = msg.get("name", "?")
            log.info(f"✓ Conectado como '{name}'")

            if self._ping_thread is None or not self._ping_thread.is_alive():
                self._ping_thread = threading.Thread(target=self._ping_loop, daemon=True)
                self._ping_thread.start()

        elif msg_type == "register_error":
            log.error(f"✗ Registro falhou: {msg.get('message', '?')}")
            self._registered = False

        elif msg_type == "print":
            _print_pool.submit(self._handle_print, msg)

        elif msg_type == "pong":
            pass

        elif msg_type == "error":
            log.warning(f"Servidor: {msg.get('message', '?')}")

    def _handle_print(self, msg: dict):
        job_id  = msg.get("jobId", "?")
        printer = msg.get("printer", "")
        html    = msg.get("html", "")
        user    = msg.get("user", "?")

        try:
            copies = max(1, min(int(float(msg.get("copies", 1))), 99))
        except (TypeError, ValueError):
            copies = 1

        short_printer = printer.split(" ")[0] if len(printer) > 20 else printer
        log.info(f"[{job_id}] → {short_printer} x{copies} (user={user})")

        try:
            if not printer or not html:
                self.send({"type": "print_result", "jobId": job_id, "success": False, "error": "Dados incompletos no job."})
                return

            if len(html) > 5 * 1024 * 1024:
                self.send({"type": "print_result", "jobId": job_id, "success": False, "error": "HTML do job excede 5 MB."})
                return

            result = print_html(html, printer, copies)
            self.send({"type": "print_result", "jobId": job_id, **result})

        except Exception as e:
            log.error(f"[{job_id}] ✗ Erro inesperado: {e}")
            try:
                self.send({"type": "print_result", "jobId": job_id, "success": False, "error": f"Erro inesperado: {e}"})
            except Exception:
                pass

    def _ping_loop(self):
        while self._running and self._registered:
            time.sleep(PING_INTERVAL)
            if self._registered:
                self.send({"type": "ping"})

    def on_error(self, ws, error):
        err_msg = str(error)
        if "Connection refused" in err_msg or "timed out" in err_msg:
            pass
        else:
            log.warning(f"WS: {err_msg[:100]}")

    def on_close(self, ws, code, reason):
        self._registered = False
        if code and code != 1000:
            log.info(f"Desconectado (código={code})")

    def run_forever(self):
        while self._running:
            try:
                self._ws = websocket.WebSocketApp(
                    WS_URL,
                    on_open=self.on_open,
                    on_message=self.on_message,
                    on_error=self.on_error,
                    on_close=self.on_close,
                )
                ssl_opt = {}
                if WS_URL.startswith("wss://") and not VERIFY_SSL:
                    import ssl as _ssl
                    ssl_opt = {"cert_reqs": _ssl.CERT_NONE, "check_hostname": False}
                self._ws.run_forever(
                    ping_interval=0,
                    reconnect=0,
                    sslopt=ssl_opt,
                )
            except KeyboardInterrupt:
                log.info("Encerrando...")
                self._running = False
                break
            except Exception as e:
                log.error(f"Erro: {e}")

            if self._running:
                time.sleep(RECONNECT_S)

if __name__ == "__main__":
    printers = get_printers()
    printer_names = [p["name"] for p in printers]
    log.info(f"Stoker WMS Print Agent | {MACHINE_ID} | {len(printers)} impressora(s)")
    if printer_names:
        log.info(f"  Impressoras: {', '.join(printer_names)}")
    log.info(f"  Servidor: {WS_URL}")
    agent = PrintAgent()
    try:
        agent.run_forever()
    except KeyboardInterrupt:
        log.info("Agente encerrado.")
