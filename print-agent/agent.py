"""
Stoker WMS — Print Agent
Connects to the main server via WebSocket and handles local print jobs.

PDF generation via ReportLab (native, no browser needed).
Fallback to xhtml2pdf for legacy HTML jobs.

Requirements: websocket-client, reportlab
Optional: xhtml2pdf (for legacy HTML), pywin32 (for printer listing)
Python 3.8+

Install: pip install websocket-client reportlab xhtml2pdf
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
    missing = []
    try:
        import websocket  # noqa: F401
    except ImportError:
        missing.append("websocket-client")
    try:
        from reportlab.lib.pagesizes import A4  # noqa: F401
    except ImportError:
        missing.append("reportlab")
    if missing:
        log.error(f"Dependências faltando: {', '.join(missing)}")
        log.error(f"Execute: pip install {' '.join(missing)}")
        sys.exit(1)

_check_dependencies()


# ── Printer detection (Windows) ────────────────────────────────────────────────

def get_printers():
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


# ── ReportLab Templates ───────────────────────────────────────────────────────

def _render_volume_label(data: dict, pdf_path: str) -> bool:
    """Renderiza etiquetas de volume usando ReportLab (nativo, sem browser)."""
    from reportlab.lib.pagesizes import landscape
    from reportlab.lib.units import cm, mm
    from reportlab.lib.colors import HexColor, black, white
    from reportlab.pdfgen import canvas
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.graphics.barcode import code128

    PAGE_W = 10 * cm
    PAGE_H = 15 * cm

    volumes = data.get("volumes", [])
    if not volumes:
        raise RuntimeError("Nenhum volume para imprimir")

    c = canvas.Canvas(pdf_path, pagesize=(PAGE_W, PAGE_H))

    for vol in volumes:
        _draw_single_volume(c, vol, PAGE_W, PAGE_H, cm, mm, HexColor, black, white, code128)
        c.showPage()

    c.save()
    return True


def _draw_single_volume(c, vol, PAGE_W, PAGE_H, cm, mm, HexColor, black, white, code128):
    """Desenha uma etiqueta de volume em uma página."""
    erp_order = vol.get("erpOrderId", "—")
    vol_num = vol.get("volumeNumber", 1)
    vol_total = vol.get("totalVolumes", 1)
    route = vol.get("routeCode", "—")
    customer = vol.get("customerName", "—")
    address = vol.get("address", "")
    neighborhood = vol.get("neighborhood", "")
    city_state = vol.get("cityState", "")
    operator = vol.get("operator", "—")
    date_str = vol.get("date", "")
    time_str = vol.get("time", "")
    counts = vol.get("counts", {})
    barcode_text = vol.get("barcode", f"{erp_order}{str(vol_num).zfill(3)}")

    y = PAGE_H

    # ── Header (fundo escuro) ───────────────────────────────────────────
    header_h = 22 * mm
    c.setFillColor(HexColor("#111111"))
    c.rect(0, y - header_h, PAGE_W, header_h, fill=1, stroke=0)

    c.setFillColor(white)
    c.setFont("Helvetica", 7)
    c.drawString(3 * mm, y - 6 * mm, "PEDIDO")
    c.setFont("Helvetica-Bold", 16)
    c.drawString(3 * mm, y - 14 * mm, str(erp_order))

    c.setFont("Helvetica", 7)
    c.drawRightString(PAGE_W - 3 * mm, y - 6 * mm, "VOLUME")
    c.setFont("Helvetica-Bold", 26)
    vol_text = str(vol_num)
    total_text = f" / {vol_total}"
    vol_w = c.stringWidth(vol_text, "Helvetica-Bold", 26)
    c.drawRightString(PAGE_W - 3 * mm, y - 18 * mm, vol_text + total_text)

    y -= header_h

    # ── Rota / Pacote ───────────────────────────────────────────────────
    row_h = 12 * mm
    c.setStrokeColor(HexColor("#cccccc"))
    c.setLineWidth(0.5)
    c.line(0, y - row_h, PAGE_W, y - row_h)
    c.line(PAGE_W / 2, y, PAGE_W / 2, y - row_h)

    c.setFillColor(HexColor("#777777"))
    c.setFont("Helvetica", 6)
    c.drawString(3 * mm, y - 4 * mm, "ROTA ID")
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(3 * mm, y - 10 * mm, str(route) or "—")

    c.setFillColor(HexColor("#777777"))
    c.setFont("Helvetica", 6)
    c.drawRightString(PAGE_W - 3 * mm, y - 4 * mm, "PACOTE ID")
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(PAGE_W - 3 * mm, y - 10 * mm, str(vol_num))

    y -= row_h

    # ── Cliente ─────────────────────────────────────────────────────────
    c.setStrokeColor(HexColor("#cccccc"))
    c.setFillColor(HexColor("#f7faff"))
    client_h = 22 * mm
    c.rect(0, y - client_h, PAGE_W, client_h, fill=1, stroke=0)
    c.line(0, y - client_h, PAGE_W, y - client_h)

    c.setFillColor(HexColor("#777777"))
    c.setFont("Helvetica", 6)
    c.drawString(3 * mm, y - 4 * mm, "DESTINATÁRIO")

    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 11)
    name_text = customer[:40] if len(customer) > 40 else customer
    c.drawString(3 * mm, y - 10 * mm, name_text)

    c.setFont("Helvetica", 9)
    line_y = y - 15 * mm
    if address:
        c.drawString(3 * mm, line_y, address[:50])
        line_y -= 4 * mm
    if neighborhood:
        c.drawString(3 * mm, line_y, neighborhood[:40])
        line_y -= 4 * mm
    if city_state:
        c.setFont("Helvetica-Bold", 9)
        c.drawString(3 * mm, line_y, city_state[:40])

    y -= client_h

    # ── Contagem de embalagens ──────────────────────────────────────────
    pkg_h = 12 * mm
    pkg_types = [("SACOLA", counts.get("sacola", 0)), ("CAIXA", counts.get("caixa", 0)),
                 ("SACO", counts.get("saco", 0)), ("AVULSO", counts.get("avulso", 0))]
    col_w = PAGE_W / 4

    c.setFillColor(HexColor("#fafafa"))
    c.rect(0, y - pkg_h, PAGE_W, pkg_h, fill=1, stroke=0)

    for i, (label, val) in enumerate(pkg_types):
        cx = i * col_w + col_w / 2
        if i > 0:
            c.setStrokeColor(HexColor("#cccccc"))
            c.line(i * col_w, y, i * col_w, y - pkg_h)
        c.setFillColor(HexColor("#888888"))
        c.setFont("Helvetica", 5.5)
        c.drawCentredString(cx, y - 4 * mm, label)
        c.setFillColor(black)
        c.setFont("Helvetica-Bold", 13)
        c.drawCentredString(cx, y - 10 * mm, str(val))

    c.setStrokeColor(HexColor("#cccccc"))
    c.line(0, y - pkg_h, PAGE_W, y - pkg_h)
    y -= pkg_h

    # ── Volume central grande ───────────────────────────────────────────
    vol_center_h = 30 * mm
    c.setStrokeColor(HexColor("#cccccc"))
    c.line(0, y - vol_center_h, PAGE_W, y - vol_center_h)

    center_x = PAGE_W / 2
    c.setFillColor(HexColor("#777777"))
    c.setFont("Helvetica", 8)
    c.drawCentredString(center_x, y - 6 * mm, "VOLUME")

    c.setFillColor(HexColor("#111111"))
    c.setFont("Helvetica-Bold", 42)
    big_text = str(vol_num)
    c.drawCentredString(center_x - 8 * mm, y - 22 * mm, big_text)
    c.setFillColor(HexColor("#555555"))
    c.setFont("Helvetica", 22)
    c.drawString(center_x + 2 * mm, y - 22 * mm, f"/ {vol_total}")

    y -= vol_center_h

    # ── Footer (operador + data) ────────────────────────────────────────
    footer_h = 10 * mm
    c.setFillColor(HexColor("#f0f4f8"))
    c.rect(0, y - footer_h, PAGE_W, footer_h, fill=1, stroke=0)
    c.setStrokeColor(HexColor("#cccccc"))
    c.line(0, y - footer_h, PAGE_W, y - footer_h)

    c.setFillColor(HexColor("#888888"))
    c.setFont("Helvetica", 5.5)
    c.drawString(3 * mm, y - 4 * mm, "CONFERIDO POR")
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(3 * mm, y - 8.5 * mm, operator[:30])

    c.setFillColor(HexColor("#888888"))
    c.setFont("Helvetica", 5.5)
    c.drawRightString(PAGE_W - 3 * mm, y - 4 * mm, "DATA/HORA")
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(PAGE_W - 3 * mm, y - 8.5 * mm, f"{date_str} {time_str}")

    y -= footer_h

    # ── Código de barras ────────────────────────────────────────────────
    remaining_h = y
    barcode_y = remaining_h / 2 - 8 * mm

    try:
        bc = code128.Code128(barcode_text, barWidth=0.8 * mm, barHeight=14 * mm, humanReadable=True)
        bc_w = bc.width
        bc.drawOn(c, (PAGE_W - bc_w) / 2, barcode_y)
    except Exception:
        c.setFont("Courier-Bold", 14)
        c.drawCentredString(PAGE_W / 2, barcode_y + 5 * mm, barcode_text)


def _render_pallet_label(data: dict, pdf_path: str) -> bool:
    """Renderiza etiqueta de pallet usando ReportLab."""
    from reportlab.lib.units import cm, mm
    from reportlab.lib.colors import HexColor, black, white
    from reportlab.pdfgen import canvas

    PAGE_W = 10 * cm
    PAGE_H = 15 * cm

    c = canvas.Canvas(pdf_path, pagesize=(PAGE_W, PAGE_H))
    y = PAGE_H

    pallet_code = data.get("palletCode", "—")
    address = data.get("address", "—")
    created_at = data.get("createdAt", "")
    created_by = data.get("createdBy", "—")
    printed_by = data.get("printedBy", "—")
    items = data.get("items", [])
    nf_ids = data.get("nfIds", [])
    qr_data = data.get("qrData", "")

    # ── Header ──────────────────────────────────────────────────────────
    header_h = 24 * mm
    c.setFont("Helvetica-Bold", 22)
    c.setStrokeColor(black)
    c.setLineWidth(1.5)
    c.rect(3 * mm, y - header_h, PAGE_W - 6 * mm, 14 * mm, stroke=1, fill=0)
    c.drawCentredString(PAGE_W / 2, y - 13 * mm, pallet_code)

    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(PAGE_W / 2, y - 21 * mm, address)

    y -= header_h + 2 * mm

    # ── QR Code (se disponível) ─────────────────────────────────────────
    if qr_data:
        try:
            from reportlab.graphics.barcode.qr import QrCodeWidget
            from reportlab.graphics.shapes import Drawing
            from reportlab.graphics import renderPDF

            qr = QrCodeWidget(qr_data)
            qr.barWidth = 25 * mm
            qr.barHeight = 25 * mm
            d = Drawing(25 * mm, 25 * mm)
            d.add(qr)
            renderPDF.draw(d, c, (PAGE_W - 25 * mm) / 2, y - 27 * mm)
            y -= 28 * mm
        except Exception:
            pass

    # ── Meta ────────────────────────────────────────────────────────────
    c.setStrokeColor(HexColor("#dddddd"))
    c.line(3 * mm, y, PAGE_W - 3 * mm, y)
    y -= 4 * mm

    c.setFillColor(HexColor("#555555"))
    c.setFont("Helvetica", 8)
    meta = f"Criado: {created_at} | Por: {created_by} | Impresso: {printed_by}"
    c.drawString(3 * mm, y, meta[:60])
    y -= 6 * mm

    # ── Itens ───────────────────────────────────────────────────────────
    c.setStrokeColor(black)
    c.line(3 * mm, y, PAGE_W - 3 * mm, y)
    y -= 4 * mm

    for item in items[:20]:
        product = item.get("product", "")
        erp_code = item.get("erpCode", "")
        quantity = item.get("quantity", "")
        unit = item.get("unit", "")
        lot = item.get("lot", "")
        expiry = item.get("expiryDate", "")

        c.setFillColor(black)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(3 * mm, y, product[:45])
        y -= 4 * mm

        detail = f"{erp_code} | {quantity} {unit}"
        if lot:
            detail += f" | Lote: {lot}"
        if expiry:
            detail += f" | Val: {expiry}"
        c.setFont("Helvetica", 8)
        c.drawString(3 * mm, y, detail[:60])
        y -= 2 * mm

        c.setStrokeColor(HexColor("#cccccc"))
        c.setDash(2, 2)
        c.line(3 * mm, y, PAGE_W - 3 * mm, y)
        c.setDash()
        y -= 3 * mm

        if y < 10 * mm:
            break

    # ── NF ──────────────────────────────────────────────────────────────
    if nf_ids:
        y -= 2 * mm
        c.setFillColor(HexColor("#333333"))
        c.setFont("Helvetica", 8)
        c.drawString(3 * mm, y, f"NF: {', '.join(str(n) for n in nf_ids[:10])}")

    c.save()
    return True


# ── Geração de PDF (ReportLab nativo + fallback xhtml2pdf para HTML) ──────────

_pdf_lock = threading.Lock()
_PDF_TIMEOUT = 30

def generate_pdf_from_template(template: str, data: dict, pdf_path: str, job_id: str) -> bool:
    """Gera PDF usando ReportLab nativo (ultra-rápido, sem browser)."""
    renderers = {
        "volume_label": _render_volume_label,
        "pallet_label": _render_pallet_label,
    }

    renderer = renderers.get(template)
    if not renderer:
        raise RuntimeError(f"Template desconhecido: {template}")

    with _pdf_lock:
        renderer(data, pdf_path)

    if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 100:
        return True

    raise RuntimeError(f"ReportLab não gerou o PDF para template '{template}'")


def _strip_external_fonts(html: str) -> str:
    import re
    html = re.sub(r'@font-face\s*\{[^}]*\}', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'@import\s+url\([^)]*fonts[^)]*\)\s*;?', '', html, flags=re.IGNORECASE)
    html = re.sub(r'<link[^>]*fonts\.googleapis\.com[^>]*/?\s*>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'<link[^>]*fonts\.gstatic\.com[^>]*/?\s*>', '', html, flags=re.IGNORECASE)
    return html


def generate_pdf_from_html(html_content: str, pdf_path: str, job_id: str) -> bool:
    """Fallback: gera PDF via xhtml2pdf para jobs HTML legados."""
    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

    def _worker():
        import logging as _logging
        _logging.getLogger("xhtml2pdf").setLevel(_logging.CRITICAL)
        _logging.getLogger("reportlab").setLevel(_logging.CRITICAL)
        _logging.getLogger("html5lib").setLevel(_logging.CRITICAL)
        from xhtml2pdf import pisa
        with open(pdf_path, "wb") as f:
            pisa.CreatePDF(html_content, dest=f)
        return os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 100

    html_content = _strip_external_fonts(html_content)

    with _pdf_lock:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_worker)
            try:
                ok = future.result(timeout=_PDF_TIMEOUT)
            except FuturesTimeout:
                raise RuntimeError(f"xhtml2pdf timeout ({_PDF_TIMEOUT}s)")

    if ok:
        return True
    raise RuntimeError("xhtml2pdf não gerou o PDF")


# ── Impressão (SumatraPDF ou ShellExecute) ─────────────────────────────────

def find_sumatra():
    candidates = [
        r"C:\Program Files\SumatraPDF\SumatraPDF.exe",
        r"C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe",
        os.path.join(os.path.dirname(__file__), "SumatraPDF.exe"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def _send_to_printer(pdf_path: str, printer: str, copies: int, job_id: str) -> dict:
    """Envia PDF para a impressora via SumatraPDF ou ShellExecute."""
    sumatra = find_sumatra()
    if not sumatra:
        try:
            import win32api
            for _ in range(max(1, min(copies, 99))):
                win32api.ShellExecute(0, "print", pdf_path, f'"{printer}"', ".", 0)
                time.sleep(0.3)
            return {"success": True}
        except ImportError:
            return {"success": False, "error": "SumatraPDF não encontrado."}

    for i in range(max(1, min(copies, 99))):
        r = subprocess.run(
            [sumatra, "-print-to", printer, "-print-settings", "noscale", "-silent", pdf_path],
            timeout=30, capture_output=True
        )
        if r.returncode != 0:
            stderr_msg = (r.stderr or b"").decode("utf-8", errors="replace").strip()
            return {"success": False, "error": f"SumatraPDF erro cópia {i+1}: {stderr_msg[:200]}"}
        if copies > 1:
            time.sleep(0.2)

    return {"success": True}


def print_job(msg: dict) -> dict:
    """Processa um job de impressão — template nativo (ReportLab) ou HTML legado (xhtml2pdf)."""
    tmp = tempfile.gettempdir()
    job_id = os.urandom(4).hex()
    pdf_path = os.path.join(tmp, f"stoker_{job_id}.pdf")
    printer = msg.get("printer", "")
    copies = max(1, min(int(float(msg.get("copies", 1))), 99))

    try:
        t_start = time.time()

        template = msg.get("template")
        data = msg.get("data")
        html = msg.get("html")

        if template and data:
            generate_pdf_from_template(template, data, pdf_path, job_id)
            method = "ReportLab"
        elif html:
            generate_pdf_from_html(html, pdf_path, job_id)
            method = "xhtml2pdf"
        else:
            return {"success": False, "error": "Job sem 'template'+'data' nem 'html'."}

        result = _send_to_printer(pdf_path, printer, copies, job_id)
        t_total = time.time() - t_start

        if result["success"]:
            log.info(f"[{job_id}] ✓ '{printer}' x{copies} ({method}, {t_total:.1f}s)")
        else:
            log.error(f"[{job_id}] ✗ {result.get('error', '?')}")

        return result

    except Exception as e:
        log.error(f"[{job_id}] ✗ {e}")
        return {"success": False, "error": str(e)}
    finally:
        try:
            if os.path.exists(pdf_path):
                os.remove(pdf_path)
        except Exception:
            pass


# ── Limpeza de temporários ─────────────────────────────────────────────────────

def _cleanup_stale_temp_files():
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
        job_id = msg.get("jobId", "?")
        printer = msg.get("printer", "")
        user = msg.get("user", "?")
        template = msg.get("template", "")

        try:
            copies = max(1, min(int(float(msg.get("copies", 1))), 99))
        except (TypeError, ValueError):
            copies = 1

        label = template or "html"
        short_printer = printer.split(" ")[0] if len(printer) > 20 else printer
        log.info(f"[{job_id}] → {short_printer} x{copies} [{label}] (user={user})")

        try:
            if not printer:
                self.send({"type": "print_result", "jobId": job_id, "success": False, "error": "Impressora não especificada."})
                return

            result = print_job(msg)
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
        if "Connection refused" not in err_msg and "timed out" not in err_msg:
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
