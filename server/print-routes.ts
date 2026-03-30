import type { Express, Request, Response } from "express";
import { isAuthenticated, requireRole, getTokenFromRequest, getUserFromToken } from "./auth";
import { storage } from "./storage";
import { exec } from "child_process";
import os from "os";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { log } from "./log";
// pdf-to-printer: usa SumatraPDF no Windows — impressão silenciosa sem abrir janela
import pdfToPrinter from "pdf-to-printer";

const IS_WIN = process.platform === "win32";

interface PrinterInfo {
  name: string;
  isDefault: boolean;
  status: string;
}

/** Cache de impressoras em memória — atualizado na inicialização e a cada sync */
let printerCache: PrinterInfo[] | null = null;

/** Busca impressoras do sistema operacional e atualiza o cache */
export async function refreshPrinterCache(): Promise<void> {
  try {
    const [rawPrinters, rawDefault] = await Promise.all([
      pdfToPrinter.getPrinters(),
      pdfToPrinter.getDefaultPrinter().catch(() => null),
    ]);
    const extractName = (p: any): string =>
      typeof p === "string" ? p.trim() : String(p?.name ?? p?.deviceId ?? "").trim();
    const defName = extractName(rawDefault);
    printerCache = (rawPrinters as any[])
      .map((p) => ({ name: extractName(p), isDefault: extractName(p) === defName, status: "ready" }))
      .filter((p) => p.name);
    if (printerCache.length > 0) {
      const def = printerCache.find((p) => p.isDefault)?.name ?? printerCache[0].name;
      log(`${printerCache.length} impressora(s) carregada(s) | padrão: "${def}"`, "print");
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e) ?? "erro desconhecido";
    log(`AVISO: não foi possível listar impressoras — ${msg}`, "print");
    if (!printerCache) printerCache = [];
  }
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

    log(`#${jobId} "${printerName}" x${copies} (${user})`, "print");

    try {
      fs.writeFileSync(htmlPath, html, "utf-8");
    } catch (e: any) {
      resolve({ success: false, error: `Não foi possível criar arquivo temporário: ${e.message}` });
      return;
    }

    const browser = findBrowserExe();
    if (!browser) {
      cleanup(htmlPath);
      resolve({ success: false, error: "Chrome ou Edge não encontrado nesta máquina." });
      return;
    }

    const fileUrl = IS_WIN
      ? `file:///${htmlPath.replace(/\\/g, "/")}`
      : `file://${htmlPath}`;

    const chromeCmd = `"${browser}" --headless --disable-gpu --no-sandbox --print-to-pdf="${pdfPath}" --print-to-pdf-no-header --no-pdf-header-footer "${fileUrl}"`;
    exec(chromeCmd, { timeout: 45000 }, (err1) => {
      if (err1 || !fs.existsSync(pdfPath)) {
        cleanup(htmlPath, pdfPath);
        resolve({ success: false, error: "Falha ao gerar PDF. Verifique se Chrome ou Edge está atualizado." });
        return;
      }

      const sendCopies = async () => {
        for (let i = 0; i < copies; i++) {
          await pdfToPrinter.print(pdfPath, { printer: printerName, scale: "noscale" });
        }
      };

      sendCopies()
        .then(() => {
          setTimeout(() => cleanup(htmlPath, pdfPath), 10_000);
          log(`#${jobId} ✓ "${printerName}"`, "print");
          resolve({ success: true });
        })
        .catch((err2: Error) => {
          setTimeout(() => cleanup(htmlPath, pdfPath), 10_000);
          log(`#${jobId} ERRO: ${err2.message}`, "print");
          resolve({ success: false, error: `Erro ao enviar para impressora: ${err2.message}` });
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
  app.get("/api/print/printers", isAuthenticated, async (_req: Request, res: Response) => {
    // Se o cache ainda não foi carregado, tenta carregar agora (primeira vez)
    if (!printerCache) await refreshPrinterCache();
    const printers = printerCache ?? [];
    const defaultPrinter = printers.find((p) => p.isDefault)?.name ?? printers[0]?.name ?? null;
    res.json({ success: true, default_printer: defaultPrinter, printers });
  });

  /** Envia trabalho de impressão direto para a impressora.
   *  Responde imediatamente (202) e executa o Chrome em background
   *  para evitar timeout no cliente quando a fila está longa. */
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

    // Responde imediatamente — o cliente não fica esperando o Chrome gerar o PDF
    res.status(202).json({ success: true, queued: true });

    const username = await resolveUsername(req);
    // Executa em background sem bloquear a resposta HTTP
    printHtmlToPrinter(
      html,
      printer,
      Math.max(1, Math.min(copies, 99)),
      username
    ).catch((err: Error) => {
      console.error("[print] Erro em background:", err.message);
    });
  });

  /** Retorna a config de impressoras do usuário logado */
  app.get("/api/print/config", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req as any).user?.id as string;
    const user = await storage.getUser(userId);
    const printConfig = (user?.settings as any)?.printConfig ?? {};
    res.json({ success: true, printConfig });
  });

  /** Retorna a config de impressoras de um usuário específico (admin) */
  app.get("/api/print/config/:userId", isAuthenticated, requireRole("administrador"), async (req: Request, res: Response) => {
    const user = await storage.getUser(req.params.userId);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    const printConfig = (user.settings as any)?.printConfig ?? {};
    res.json({ success: true, printConfig });
  });

  /** Salva a config de impressoras de um usuário específico (admin) */
  app.put("/api/print/config/:userId", isAuthenticated, requireRole("administrador"), async (req: Request, res: Response) => {
    const { printConfig } = req.body as { printConfig: Record<string, { printer: string; copies: number }> };
    if (!printConfig || typeof printConfig !== "object") {
      return res.status(400).json({ error: "printConfig inválido" });
    }
    const user = await storage.getUser(req.params.userId);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    const currentSettings = (user.settings as any) ?? {};
    await storage.updateUser(req.params.userId, {
      settings: { ...currentSettings, printConfig },
    } as any);
    res.json({ success: true });
  });
}
