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
import socket
import http.server

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

def _find_free_port() -> int:
    """Finds a free TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


# ── Servidor HTTP persistente (inicia uma vez, roda até o agente fechar) ──────

class _PersistentHTTPServer:
    """Serves temp directory via HTTP on localhost. Starts once, reused by all jobs."""

    def __init__(self):
        self._httpd = None
        self._port = None
        self._lock = threading.Lock()

    def ensure_running(self, directory: str) -> int:
        with self._lock:
            if self._httpd is not None:
                return self._port

            def _make_handler(base_dir):
                class _H(http.server.SimpleHTTPRequestHandler):
                    def __init__(self, *a, **kw):
                        super().__init__(*a, directory=base_dir, **kw)
                    def log_message(self, *a):
                        pass
                return _H

            self._port = _find_free_port()
            self._httpd = http.server.HTTPServer(("127.0.0.1", self._port), _make_handler(directory))
            t = threading.Thread(target=self._httpd.serve_forever, daemon=True)
            t.start()
            log.info(f"Servidor HTTP local iniciado em 127.0.0.1:{self._port}")
            return self._port


_http_server = _PersistentHTTPServer()


# ── Pool persistente do Chrome (inicia uma vez, reutiliza entre jobs) ─────────

class _ChromePool:
    """
    Mantém uma instância headless do Chrome rodando entre jobs.
    O primeiro job leva ~2-3s (startup do Chrome).
    Jobs seguintes levam <1s (só navegação + printToPDF via CDP).
    Se o Chrome morrer, é reiniciado automaticamente no próximo job.
    """

    def __init__(self):
        self._proc = None
        self._debug_port = None
        self._profile_dir = os.path.join(tempfile.gettempdir(), "stoker_chrome_pool")
        self._lock = threading.Lock()
        self._msg_id = 0

    def _next_id(self) -> int:
        self._msg_id += 1
        return self._msg_id

    def _is_alive(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def _start_chrome(self):
        """Inicia o Chrome headless com porta de debug."""
        import urllib.request

        browser = find_browser()
        if not browser:
            raise RuntimeError("Chrome ou Edge não encontrado nesta máquina.")

        self._debug_port = _find_free_port()

        self._proc = subprocess.Popen(
            [
                browser,
                "--headless=old",
                "--disable-gpu",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-extensions",
                "--remote-allow-origins=*",
                f"--remote-debugging-port={self._debug_port}",
                f"--user-data-dir={self._profile_dir}",
                "about:blank",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        for _ in range(40):
            try:
                with urllib.request.urlopen(
                    f"http://127.0.0.1:{self._debug_port}/json/version", timeout=1
                ) as r:
                    if r.status == 200:
                        log.info(f"Chrome pool iniciado (pid={self._proc.pid}, porta={self._debug_port})")
                        return
            except Exception:
                pass
            time.sleep(0.25)

        raise RuntimeError("Chrome não respondeu na porta de debug em 10s")

    def _ensure_running(self):
        if not self._is_alive():
            self._kill()
            self._start_chrome()

    def _kill(self):
        if self._proc is not None:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=5)
            except Exception:
                try:
                    self._proc.kill()
                except Exception:
                    pass
            self._proc = None

    def generate_pdf(self, html_url: str, job_id: str) -> bytes:
        """
        Navega para html_url, aguarda carregamento, e retorna o PDF como bytes.
        Thread-safe: usa lock para serializar acesso ao Chrome.
        """
        import base64
        import urllib.request
        import websocket as _ws

        with self._lock:
            self._ensure_running()

            # Busca a aba existente (about:blank) para navegar
            with urllib.request.urlopen(
                f"http://127.0.0.1:{self._debug_port}/json/list", timeout=5
            ) as r:
                targets = json.loads(r.read())
            ws_url = None
            for t in targets:
                if t.get("type") == "page":
                    ws_url = t["webSocketDebuggerUrl"]
                    break
            if not ws_url:
                raise RuntimeError("Nenhuma aba encontrada no Chrome")

            conn = _ws.create_connection(ws_url, timeout=30)
            try:
                # Habilita Page events
                enable_id = self._next_id()
                conn.send(json.dumps({"id": enable_id, "method": "Page.enable"}))

                # Navega para a URL do HTML
                nav_id = self._next_id()
                conn.send(json.dumps({
                    "id": nav_id,
                    "method": "Page.navigate",
                    "params": {"url": html_url},
                }))

                # Aguarda Page.loadEventFired (até 8s)
                deadline = time.time() + 8
                while time.time() < deadline:
                    try:
                        conn.settimeout(max(0.1, deadline - time.time()))
                        msg = json.loads(conn.recv())
                        if msg.get("method") == "Page.loadEventFired":
                            break
                    except Exception:
                        break

                # Solicita o PDF via CDP
                pdf_id = self._next_id()
                conn.send(json.dumps({
                    "id": pdf_id,
                    "method": "Page.printToPDF",
                    "params": {
                        "printBackground": True,
                        "preferCSSPageSize": True,
                    },
                }))

                # Aguarda resposta (até 15s)
                deadline2 = time.time() + 15
                while time.time() < deadline2:
                    try:
                        conn.settimeout(max(0.1, deadline2 - time.time()))
                        msg = json.loads(conn.recv())
                        if msg.get("id") == pdf_id:
                            err = msg.get("error")
                            if err:
                                raise RuntimeError(f"printToPDF erro: {err.get('message', err)}")
                            data_b64 = msg.get("result", {}).get("data", "")
                            if not data_b64:
                                raise RuntimeError("printToPDF retornou vazio")
                            return base64.b64decode(data_b64)
                    except RuntimeError:
                        raise
                    except Exception:
                        break

                raise RuntimeError("Timeout aguardando printToPDF")

            finally:
                try:
                    conn.close()
                except Exception:
                    pass

    def shutdown(self):
        """Encerra o Chrome pool (chamado na saída do agente)."""
        self._kill()
        import shutil
        try:
            if os.path.exists(self._profile_dir):
                shutil.rmtree(self._profile_dir, ignore_errors=True)
        except Exception:
            pass


_chrome_pool = _ChromePool()

import atexit
atexit.register(_chrome_pool.shutdown)


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
    """Converts HTML to PDF via persistent Chrome (CDP), then sends to printer via SumatraPDF."""
    tmp = tempfile.gettempdir()
    job_id = os.urandom(4).hex()
    html_filename = f"stoker_{job_id}.html"
    html_path     = os.path.join(tmp, html_filename)
    pdf_path      = os.path.join(tmp, f"stoker_{job_id}.pdf")

    try:
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)

        # Servidor HTTP persistente — inicia uma vez, reutiliza entre jobs
        port = _http_server.ensure_running(tmp)
        html_url = f"http://127.0.0.1:{port}/{html_filename}"

        log.info(f"[{job_id}] Gerando PDF via CDP para impressora '{printer}' x{copies}")

        t_start = time.time()
        try:
            pdf_bytes = _chrome_pool.generate_pdf(html_url, job_id)
        except Exception as e:
            log.error(f"[{job_id}] CDP falhou: {e}")
            return {"success": False, "error": f"Falha ao gerar PDF: {e}"}

        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)
        t_pdf = time.time() - t_start
        log.info(f"[{job_id}] PDF gerado ({len(pdf_bytes)} bytes, {t_pdf:.1f}s)")

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
