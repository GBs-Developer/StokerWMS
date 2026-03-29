import type { Express, Request, Response } from "express";
import { isAuthenticated, getTokenFromRequest, getUserFromToken } from "./auth";
import { exec } from "child_process";
import os from "os";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { log } from "./log";

const IS_WIN = process.platform === "win32";

interface PrinterInfo {
  name: string;
  isDefault: boolean;
  status: string;
}

/** Lista impressoras instaladas na máquina do servidor */
async function getInstalledPrinters(): Promise<PrinterInfo[]> {
  return new Promise((resolve) => {
    if (IS_WIN) {
      const cmd = `powershell -Command "Get-Printer | Select-Object Name,Default | ConvertTo-Json -Depth 1"`;
      exec(cmd, { timeout: 8000 }, (err, stdout) => {
        if (err) { resolve([]); return; }
        try {
          let raw = JSON.parse(stdout.trim());
          if (!Array.isArray(raw)) raw = [raw];
          resolve(
            raw
              .map((p: any) => ({
                name: String(p.Name ?? p.name ?? "").trim(),
                isDefault: !!p.Default,
                status: "ready",
              }))
              .filter((p) => p.name)
          );
        } catch { resolve([]); }
      });
    } else {
      exec("lpstat -a 2>/dev/null | awk '{print $1}'", { timeout: 5000 }, (err, stdout) => {
        if (err) { resolve([]); return; }
        const names = stdout.trim().split("\n").filter(Boolean);
        exec("lpstat -d 2>/dev/null", { timeout: 3000 }, (_, defOut) => {
          const m = defOut?.match(/system default destination:\s+(.+)/);
          const def = m?.[1]?.trim() ?? "";
          resolve(names.map((name) => ({ name, isDefault: name === def, status: "ready" })));
        });
      });
    }
  });
}

/** Localiza executável do Chrome ou Edge */
function findBrowserExe(): string | null {
  const candidates = IS_WIN
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      ]
    : [
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        "/snap/bin/chromium",
      ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function cleanup(...files: string[]) {
  for (const f of files) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  }
}

/** Imprime HTML em uma impressora específica via headless Chrome/Edge */
async function printHtmlToPrinter(
  html: string,
  printerName: string,
  copies: number,
  user: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const tmpDir = os.tmpdir();
    const jobId = crypto.randomUUID().slice(0, 8);
    const htmlPath = path.join(tmpDir, `stoker_${jobId}.html`);
    const pdfPath  = path.join(tmpDir, `stoker_${jobId}.pdf`);

    log(`[print] Novo trabalho #${jobId} | usuário: ${user} | impressora: "${printerName}" | cópias: ${copies}`, "print");

    try {
      fs.writeFileSync(htmlPath, html, "utf-8");
      log(`[print] #${jobId} HTML salvo em ${htmlPath} (${html.length} bytes)`, "print");
    } catch (e: any) {
      log(`[print] #${jobId} ERRO ao criar arquivo temporário: ${e.message}`, "print");
      resolve({ success: false, error: `Não foi possível criar arquivo temporário: ${e.message}` });
      return;
    }

    const browser = findBrowserExe();
    if (!browser) {
      log(`[print] #${jobId} ERRO: Chrome/Edge não encontrado na máquina do servidor`, "print");
      cleanup(htmlPath);
      resolve({
        success: false,
        error: "Chrome ou Edge não encontrado nesta máquina. Use a opção 'Abrir no navegador'.",
      });
      return;
    }

    log(`[print] #${jobId} Usando navegador: ${browser}`, "print");

    const fileUrl = IS_WIN
      ? `file:///${htmlPath.replace(/\\/g, "/")}`
      : `file://${htmlPath}`;

    // Etapa 1: HTML → PDF
    log(`[print] #${jobId} Etapa 1/2: gerando PDF...`, "print");
    const chromeCmd = `"${browser}" --headless --disable-gpu --no-sandbox --print-to-pdf="${pdfPath}" --print-to-pdf-no-header --no-pdf-header-footer "${fileUrl}"`;
    exec(chromeCmd, { timeout: 20000 }, (err1) => {
      if (err1 || !fs.existsSync(pdfPath)) {
        const msg = err1?.message ?? "PDF não gerado";
        log(`[print] #${jobId} ERRO ao gerar PDF: ${msg}`, "print");
        cleanup(htmlPath, pdfPath);
        resolve({ success: false, error: "Falha ao gerar PDF. Verifique se Chrome ou Edge está atualizado." });
        return;
      }

      const pdfSize = fs.statSync(pdfPath).size;
      log(`[print] #${jobId} PDF gerado (${pdfSize} bytes) — Etapa 2/2: enviando para "${printerName}"...`, "print");

      // Etapa 2: PDF → Impressora
      let printCmd: string;
      if (IS_WIN) {
        const safe = printerName.replace(/'/g, "''");
        printCmd = `powershell -Command "for($i=0;$i -lt ${copies};$i++){ Start-Process -FilePath '${pdfPath}' -Verb PrintTo -ArgumentList '\\"${safe}\\"' -Wait -WindowStyle Hidden }"`;
      } else {
        printCmd = `lpr -P "${printerName}" -# ${copies} "${pdfPath}"`;
      }

      exec(printCmd, { timeout: 60000 }, (err2) => {
        setTimeout(() => cleanup(htmlPath, pdfPath), 10_000);
        if (err2) {
          log(`[print] #${jobId} ERRO ao enviar para impressora: ${err2.message}`, "print");
          resolve({ success: false, error: `Erro ao enviar para impressora: ${err2.message}` });
        } else {
          log(`[print] #${jobId} ✓ Impresso com sucesso em "${printerName}" (${copies} cópia(s))`, "print");
          resolve({ success: true });
        }
      });
    });
  });
}

async function resolveUsername(req: Request): Promise<string> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return "desconhecido";
    const result = await getUserFromToken(token);
    return result?.username ?? "desconhecido";
  } catch {
    return "desconhecido";
  }
}

export function registerPrintRoutes(app: Express) {
  /** Lista impressoras disponíveis no servidor */
  app.get("/api/print/printers", isAuthenticated, async (req: Request, res: Response) => {
    try {
      log(`[print] Listando impressoras — solicitado por ${req.ip ?? "?"}`, "print");
      const printers = await getInstalledPrinters();
      const defaultPrinter = printers.find((p) => p.isDefault)?.name ?? printers[0]?.name ?? null;
      log(`[print] ${printers.length} impressora(s) encontrada(s)${defaultPrinter ? ` | padrão: "${defaultPrinter}"` : ""}`, "print");
      res.json({ success: true, default_printer: defaultPrinter, printers });
    } catch (e: any) {
      log(`[print] ERRO ao listar impressoras: ${e.message}`, "print");
      res.json({ success: false, error: e.message, printers: [] });
    }
  });

  /** Envia trabalho de impressão direto para a impressora */
  app.post("/api/print/job", isAuthenticated, async (req: Request, res: Response) => {
    const { html, printer, copies = 1 } = req.body as {
      html: string;
      printer: string;
      copies?: number;
    };

    if (!html || !printer) {
      res.status(400).json({ success: false, error: "Campos obrigatórios: html, printer" });
      return;
    }

    const username = await resolveUsername(req);
    const result = await printHtmlToPrinter(
      html,
      printer,
      Math.max(1, Math.min(copies, 99)),
      username
    );
    res.json(result);
  });
}
