"""
Stoker WMS — Print Agent
Connects to the main server via WebSocket and handles local print jobs.

Requirements: websocket-client, requests
Python 3.8+
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
import hashlib

# ── Logging ────────────────────────────────────────────────────────────────────
from logging.handlers import RotatingFileHandler

_fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
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

# Extrai apenas scheme + host:porta (ignora qualquer caminho digitado por engano)
try:
    from urllib.parse import urlparse as _urlparse
    _raw = cfg.get("agent", "server_url").strip().rstrip("/")
    _parsed = _urlparse(_raw)
    # Se não tem scheme, tenta adicionar http:// para parsear
    if not _parsed.scheme:
        _parsed = _urlparse("http://" + _raw)
    SERVER_BASE = f"{_parsed.scheme}://{_parsed.netloc}"
except Exception:
    SERVER_BASE = cfg.get("agent", "server_url").strip().rstrip("/")

# Converte http(s):// → ws(s)://
WS_URL = SERVER_BASE.replace("https://", "wss://").replace("http://", "ws://") + "/ws/print-agent"

log.info(f"Máquina: {MACHINE_ID}")
log.info(f"Servidor: {WS_URL}")

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
        log.info(f"{len(printers)} impressora(s) encontrada(s)")
    except ImportError:
        log.warning("win32print não disponível — listando sem módulo Windows")
        # Fallback: PowerShell
        try:
            result = subprocess.run(
                ["powershell", "-Command",
                 "Get-Printer | Select-Object -ExpandProperty Name"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                names = [n.strip() for n in result.stdout.strip().splitlines() if n.strip()]
                printers = [{"name": n, "isDefault": False} for n in names]
        except Exception as e:
            log.warning(f"Fallback PowerShell falhou: {e}")
    except Exception as e:
        log.warning(f"Erro ao listar impressoras: {e}")
    return printers

# ── HTML → PDF → Printer ───────────────────────────────────────────────────────

def find_browser():
    """Finds Chrome or Edge executable on Windows."""
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

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

# ── Geração de PDF via Chrome --print-to-pdf (sem CDP, sem porta de debug) ────

_pdf_lock = threading.Lock()
_profile_counter = 0

def generate_pdf_via_chrome(html_path: str, pdf_path: str, job_id: str) -> bool:
    """
    Gera PDF usando Chrome headless via --print-to-pdf com URL file://.
    Sem CDP, sem porta de debug, sem WebSocket, sem servidor HTTP.
    Chrome lê o arquivo direto do disco e gera o PDF.
    """
    global _profile_counter

    browser = find_browser()
    if not browser:
        raise RuntimeError("Chrome ou Edge não encontrado nesta máquina.")

    with _pdf_lock:
        _profile_counter += 1
        counter = _profile_counter

    profile_dir = os.path.join(tempfile.gettempdir(), f"stoker_chrome_{counter}")

    file_url = "file:///" + html_path.replace("\\", "/")

    try:
        cmd = [
            browser,
            "--headless=old",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-default-apps",
            "--disable-sync",
            "--disable-translate",
            "--no-first-run",
            "--run-all-compositor-stages-before-draw",
            "--print-to-pdf-no-header",
            f"--print-to-pdf={pdf_path}",
            f"--user-data-dir={profile_dir}",
            file_url,
        ]

        log.info(f"[{job_id}] Executando Chrome: --print-to-pdf (file://)")

        result = subprocess.run(
            cmd,
            timeout=45,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        stderr_text = (result.stderr or b"").decode("utf-8", errors="replace").strip()
        stdout_text = (result.stdout or b"").decode("utf-8", errors="replace").strip()

        if result.returncode != 0:
            log.warning(f"[{job_id}] Chrome retornou código {result.returncode}")
            if stderr_text:
                log.warning(f"[{job_id}] Chrome stderr: {stderr_text[:500]}")
            if stdout_text:
                log.warning(f"[{job_id}] Chrome stdout: {stdout_text[:500]}")

        if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
            log.info(f"[{job_id}] PDF gerado com sucesso ({os.path.getsize(pdf_path)} bytes)")
            return True

        detail = f" stderr={stderr_text[:200]}" if stderr_text else ""
        detail += f" stdout={stdout_text[:200]}" if stdout_text else ""
        raise RuntimeError(f"Chrome não gerou o PDF (rc={result.returncode}).{detail}")

    finally:
        import shutil
        try:
            if os.path.exists(profile_dir):
                shutil.rmtree(profile_dir, ignore_errors=True)
        except Exception:
            pass


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

def print_html(html: str, printer: str, copies: int) -> dict:
    """Converts HTML to PDF via Chrome CLI (--print-to-pdf), then sends to printer via SumatraPDF."""
    tmp = tempfile.gettempdir()
    job_id = os.urandom(4).hex()
    html_filename = f"stoker_{job_id}.html"
    html_path     = os.path.join(tmp, html_filename)
    pdf_path      = os.path.join(tmp, f"stoker_{job_id}.pdf")

    try:
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)

        log.info(f"[{job_id}] Gerando PDF via Chrome CLI para impressora '{printer}' x{copies}")

        t_start = time.time()
        try:
            generate_pdf_via_chrome(html_path, pdf_path, job_id)
        except Exception as e:
            log.error(f"[{job_id}] Falha ao gerar PDF: {e}")
            return {"success": False, "error": f"Falha ao gerar PDF: {e}"}

        pdf_size = os.path.getsize(pdf_path)
        t_pdf = time.time() - t_start
        log.info(f"[{job_id}] PDF gerado ({pdf_size} bytes, {t_pdf:.1f}s)")

        sumatra = find_sumatra()
        if not sumatra:
            try:
                import win32api
                for _ in range(max(1, min(copies, 99))):
                    win32api.ShellExecute(0, "print", pdf_path, f'"{printer}"', ".", 0)
                    time.sleep(0.3)
                log.info(f"[{job_id}] ✓ Impresso via ShellExecute em '{printer}'")
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
                log.error(f"[{job_id}] SumatraPDF falhou na cópia {i+1} (rc={r.returncode}){detail}")
                return {"success": False, "error": f"SumatraPDF retornou erro na cópia {i+1}.{detail}"}
            if copies > 1:
                time.sleep(0.2)

        t_total = time.time() - t_start
        log.info(f"[{job_id}] ✓ Impresso em '{printer}' x{copies} ({t_total:.1f}s total)")
        return {"success": True}

    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Timeout ao gerar/enviar impressão (>45s)."}
    except Exception as e:
        log.error(f"[{job_id}] Erro ao imprimir: {e}\n{traceback.format_exc()}")
        return {"success": False, "error": str(e)}
    finally:
        for p in [html_path, pdf_path]:
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass

# ── WebSocket Agent ────────────────────────────────────────────────────────────

try:
    import websocket
except ImportError:
    log.error("Módulo 'websocket-client' não instalado. Execute: pip install websocket-client")
    sys.exit(1)

class PrintAgent:
    def __init__(self):
        self._ws = None
        self._running = True
        self._registered = False
        self._ping_thread = None

    def send(self, msg: dict):
        """Sends a JSON message. Silently ignores if not connected."""
        try:
            if self._ws:
                self._ws.send(json.dumps(msg))
        except Exception as e:
            log.warning(f"Erro ao enviar mensagem: {e}")

    def on_open(self, ws):
        log.info("Conectado ao servidor. Registrando agente...")
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
            log.warning("Mensagem inválida recebida do servidor")
            return

        msg_type = msg.get("type", "")

        if msg_type == "registered":
            self._registered = True
            name = msg.get("name", "?")
            machine = msg.get("machineId", "?")
            log.info(f"✓ Registrado como '{name}' (MACHINE_ID={machine})")
            # Start ping thread
            if self._ping_thread is None or not self._ping_thread.is_alive():
                self._ping_thread = threading.Thread(target=self._ping_loop, daemon=True)
                self._ping_thread.start()

        elif msg_type == "register_error":
            log.error(f"Erro no registro: {msg.get('message', '?')}. Verifique o token no config.ini.")
            self._registered = False

        elif msg_type == "print":
            # Run print job in a separate thread so we don't block the WS
            threading.Thread(
                target=self._handle_print,
                args=(msg,),
                daemon=True,
            ).start()

        elif msg_type == "pong":
            pass  # Heartbeat OK

        elif msg_type == "error":
            log.warning(f"Servidor retornou erro: {msg.get('message', '?')}")

    def _handle_print(self, msg: dict):
        job_id  = msg.get("jobId", "?")
        printer = msg.get("printer", "")
        html    = msg.get("html", "")
        user    = msg.get("user", "?")

        # Proteção contra copies inválido (float, string, None)
        try:
            copies = max(1, min(int(float(msg.get("copies", 1))), 99))
        except (TypeError, ValueError):
            copies = 1

        log.info(f"Job #{job_id} recebido: impressora='{printer}' copies={copies} user='{user}'")

        if not printer or not html:
            self.send({"type": "print_result", "jobId": job_id, "success": False, "error": "Dados incompletos no job."})
            return

        if len(html) > 5 * 1024 * 1024:  # 5 MB
            self.send({"type": "print_result", "jobId": job_id, "success": False, "error": "HTML do job excede 5 MB."})
            return

        result = print_html(html, printer, copies)
        self.send({"type": "print_result", "jobId": job_id, **result})

    def _ping_loop(self):
        while self._running and self._registered:
            time.sleep(PING_INTERVAL)
            if self._registered:
                self.send({"type": "ping"})

    def on_error(self, ws, error):
        log.warning(f"Erro WebSocket: {error}")

    def on_close(self, ws, code, reason):
        self._registered = False
        log.info(f"Desconectado do servidor (código={code}, motivo={reason or '—'})")

    def run_forever(self):
        while self._running:
            try:
                log.info(f"Conectando a {WS_URL} ...")
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
                    ping_interval=0,  # manual ping
                    reconnect=0,      # manual reconnect
                    sslopt=ssl_opt,
                )
            except KeyboardInterrupt:
                log.info("Encerrando agente (Ctrl+C)")
                self._running = False
                break
            except Exception as e:
                log.error(f"Erro inesperado: {e}\n{traceback.format_exc()}")

            if self._running:
                log.info(f"Reconectando em {RECONNECT_S}s...")
                time.sleep(RECONNECT_S)

if __name__ == "__main__":
    log.info("=" * 60)
    log.info("  Stoker WMS — Print Agent")
    log.info(f"  Máquina: {MACHINE_ID}")
    log.info(f"  Servidor: {WS_URL}")
    log.info("=" * 60)
    agent = PrintAgent()
    try:
        agent.run_forever()
    except KeyboardInterrupt:
        log.info("Agente encerrado.")
