/**
 * Print Agent WebSocket Server
 * Manages connections from local print agents running on Windows machines.
 * Agents connect outbound (no firewall issues) and receive print jobs.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import crypto from "crypto";
import { db } from "./db";
import { printAgents } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { log } from "./log";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentPrinter {
  name: string;
  isDefault: boolean;
}

interface ConnectedAgent {
  ws: WebSocket;
  agentId: string;
  companyId: number;
  machineId: string;
  name: string;
  printers: AgentPrinter[];
  connectedAt: Date;
  lastPing: Date;
}

interface AgentMessage {
  type: string;
  [key: string]: unknown;
}

interface PrintJobResult {
  resolve: (result: { success: boolean; error?: string }) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

// ─── In-memory registry ────────────────────────────────────────────────────────

const agents = new Map<string, ConnectedAgent>();
const pendingJobs = new Map<string, PrintJobResult>();

/** Derive a stable token hash (SHA-256) */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ─── Exported helpers ─────────────────────────────────────────────────────────

/** Returns all printers available across all connected agents for a company.
 *  Format: `MACHINEID\\PRINTERNAME` (backslash-separated) */
export function getAgentPrinters(companyId: number): Array<{ name: string; isDefault: boolean; agentName: string; machineId: string }> {
  const result: Array<{ name: string; isDefault: boolean; agentName: string; machineId: string }> = [];
  for (const agent of agents.values()) {
    if (agent.companyId !== companyId) continue;
    for (const p of agent.printers) {
      result.push({
        name: `${agent.machineId}\\${p.name}`,
        isDefault: false,
        agentName: agent.name,
        machineId: agent.machineId,
      });
    }
  }
  return result;
}

/** Check if a printer name is an agent printer (contains backslash) */
export function isAgentPrinter(printerName: string): boolean {
  return printerName.includes("\\");
}

/** Parse an agent printer name into machineId and local printer name */
export function parseAgentPrinter(printerName: string): { machineId: string; printer: string } | null {
  const idx = printerName.indexOf("\\");
  if (idx < 0) return null;
  return {
    machineId: printerName.slice(0, idx),
    printer: printerName.slice(idx + 1),
  };
}

/** Send an HTML print job to an agent. Returns result or error — never throws. */
export async function printViaAgent(
  companyId: number,
  machineId: string,
  printer: string,
  html: string,
  copies: number,
  user: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find connected agent
    const agent = [...agents.values()].find(
      a => a.companyId === companyId && a.machineId.toLowerCase() === machineId.toLowerCase()
    );

    if (!agent) {
      return { success: false, error: `Agente da máquina "${machineId}" não está conectado.` };
    }

    if (agent.ws.readyState !== WebSocket.OPEN) {
      return { success: false, error: `Conexão com agente "${machineId}" não está disponível.` };
    }

    const jobId = crypto.randomUUID().slice(0, 8);
    log(`[agent] Job #${jobId} → ${machineId}\\${printer} x${copies} (${user})`, "print");

    return await new Promise<{ success: boolean; error?: string }>((resolve) => {
      // Timeout: 60s for the agent to respond
      const timeoutId = setTimeout(() => {
        pendingJobs.delete(jobId);
        log(`[agent] Job #${jobId} TIMEOUT (${machineId}\\${printer})`, "print");
        resolve({ success: false, error: "Timeout: agente não respondeu em 60s." });
      }, 60_000);

      pendingJobs.set(jobId, { resolve, timeoutId });

      try {
        agent.ws.send(JSON.stringify({
          type: "print",
          jobId,
          printer,
          html,
          copies: Math.max(1, Math.min(copies, 99)),
          user,
        }));
      } catch (sendErr: any) {
        clearTimeout(timeoutId);
        pendingJobs.delete(jobId);
        resolve({ success: false, error: `Erro ao enviar job: ${sendErr.message}` });
      }
    });
  } catch (err: any) {
    // Never propagate to main server
    log(`[agent] printViaAgent erro inesperado: ${err.message}`, "print");
    return { success: false, error: `Erro interno no agente: ${err.message}` };
  }
}

/** Get list of connected agents (for admin UI) */
export function getConnectedAgents(companyId?: number): Array<{
  agentId: string;
  machineId: string;
  name: string;
  companyId: number;
  printers: AgentPrinter[];
  connectedAt: string;
  lastPing: string;
}> {
  const result = [];
  for (const agent of agents.values()) {
    if (companyId !== undefined && agent.companyId !== companyId) continue;
    result.push({
      agentId: agent.agentId,
      machineId: agent.machineId,
      name: agent.name,
      companyId: agent.companyId,
      printers: agent.printers,
      connectedAt: agent.connectedAt.toISOString(),
      lastPing: agent.lastPing.toISOString(),
    });
  }
  return result;
}

// ─── WebSocket Server Setup ────────────────────────────────────────────────────

export function setupPrintAgentWS(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  // ── Guarda de erros no servidor WSS ───────────────────────────────────────────
  // Sem este handler, qualquer erro emitido pelo WSS seria uma exceção não capturada
  // e derrubaria o processo principal do Node.js.
  wss.on("error", (err) => {
    log(`[agent] WebSocket server erro (não-fatal): ${err.message}`, "print");
  });

  // ── Upgrade HTTP → WebSocket (apenas no path correto) ─────────────────────────
  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws/print-agent") return;
    // Guarda de erro no socket bruto — evita crash por ECONNRESET/EPIPE
    socket.on("error", (err: Error) => {
      log(`[agent] Socket upgrade erro: ${err.message}`, "print");
    });
    wss.handleUpgrade(request, socket as any, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  // ── Conexão de um agente ──────────────────────────────────────────────────────
  wss.on("connection", (ws: WebSocket) => {
    let registeredAgentId: string | null = null;

    // Timeout de autenticação: o agente deve se registrar em 10s
    const authTimeout = setTimeout(() => {
      if (!registeredAgentId) {
        log("[agent] Conexão sem autenticação — fechando", "print");
        try { ws.close(4001, "authentication timeout"); } catch {}
      }
    }, 10_000);

    // ── Mensagens recebidas do agente ─────────────────────────────────────────
    // O try/catch externo garante que nenhuma rejeição não capturada
    // vaze para o processo principal, independente do que aconteça.
    ws.on("message", async (data: Buffer) => {
      try {
        let msg: AgentMessage;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          try { ws.send(JSON.stringify({ type: "error", message: "JSON inválido" })); } catch {}
          return;
        }

        // ── Register ────────────────────────────────────────────────────────
        if (msg.type === "register") {
          try {
            clearTimeout(authTimeout);

            const token = String(msg.token ?? "");
            const machineId = String(msg.machineId ?? "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 64);
            const printers: AgentPrinter[] = Array.isArray(msg.printers)
              ? (msg.printers as any[]).map(p => ({
                  name: String(p.name ?? p).trim(),
                  isDefault: Boolean(p.isDefault),
                })).filter(p => p.name)
              : [];

            if (!token || !machineId) {
              try { ws.send(JSON.stringify({ type: "register_error", message: "token e machineId obrigatórios" })); } catch {}
              try { ws.close(4002, "missing fields"); } catch {}
              return;
            }

            const tokenHash = hashToken(token);

            const [agentRecord] = await db
              .select()
              .from(printAgents)
              .where(eq(printAgents.tokenHash, tokenHash))
              .limit(1);

            if (!agentRecord || !agentRecord.active) {
              log(`[agent] Token inválido de ${machineId}`, "print");
              try { ws.send(JSON.stringify({ type: "register_error", message: "Token inválido ou agente desativado" })); } catch {}
              try { ws.close(4003, "invalid token"); } catch {}
              return;
            }

            // Desconecta conexão anterior do mesmo agente (reconexão)
            const existing = agents.get(agentRecord.id);
            if (existing && existing.ws.readyState === WebSocket.OPEN) {
              try { existing.ws.close(4004, "nova conexão para mesmo agente"); } catch {}
            }

            registeredAgentId = agentRecord.id;

            agents.set(agentRecord.id, {
              ws,
              agentId: agentRecord.id,
              companyId: agentRecord.companyId,
              machineId,
              name: agentRecord.name,
              printers,
              connectedAt: new Date(),
              lastPing: new Date(),
            });

            // Atualiza last_seen_at no banco de forma não-bloqueante
            db.update(printAgents)
              .set({ lastSeenAt: new Date().toISOString(), machineId })
              .where(eq(printAgents.id, agentRecord.id))
              .catch(() => {});

            log(`[agent] "${agentRecord.name}" (${machineId}) conectado — ${printers.length} impressora(s)`, "print");

            try {
              ws.send(JSON.stringify({
                type: "registered",
                agentId: agentRecord.id,
                name: agentRecord.name,
                machineId,
              }));
            } catch {}
          } catch (err: any) {
            log(`[agent] Erro no registro: ${err.message}`, "print");
            try { ws.send(JSON.stringify({ type: "register_error", message: "Erro interno no servidor" })); } catch {}
            try { ws.close(4005, "server error"); } catch {}
          }
          return;
        }

        // Mensagens abaixo exigem autenticação prévia
        if (!registeredAgentId) {
          try { ws.send(JSON.stringify({ type: "error", message: "não autenticado" })); } catch {}
          return;
        }

        const agent = agents.get(registeredAgentId);
        if (!agent) return;

        // ── Ping / Pong ─────────────────────────────────────────────────────
        if (msg.type === "ping") {
          agent.lastPing = new Date();
          try { ws.send(JSON.stringify({ type: "pong", ts: Date.now() })); } catch {}
          return;
        }

        // ── Atualização da lista de impressoras ──────────────────────────────
        if (msg.type === "printers_update") {
          const printers: AgentPrinter[] = Array.isArray(msg.printers)
            ? (msg.printers as any[]).map(p => ({
                name: String(p.name ?? p).trim(),
                isDefault: Boolean(p.isDefault),
              })).filter(p => p.name)
            : [];
          agent.printers = printers;
          log(`[agent] "${agent.name}" atualizou impressoras: ${printers.map(p => p.name).join(", ")}`, "print");
          return;
        }

        // ── Resultado de job de impressão ────────────────────────────────────
        if (msg.type === "print_result") {
          const jobId = String(msg.jobId ?? "");
          const pending = pendingJobs.get(jobId);
          if (pending) {
            clearTimeout(pending.timeoutId);
            pendingJobs.delete(jobId);
            const success = Boolean(msg.success);
            const error = msg.error ? String(msg.error) : undefined;
            log(`[agent] Job #${jobId} ${success ? "✓" : "ERRO: " + error} ${agent.machineId}`, "print");
            pending.resolve({ success, error });
          }
          return;
        }

      } catch (err: any) {
        // Guarda final — nunca propaga para o processo
        log(`[agent] Erro inesperado no handler de mensagem: ${err.message}`, "print");
      }
    });

    // ── Desconexão do agente ───────────────────────────────────────────────────
    ws.on("close", () => {
      clearTimeout(authTimeout);
      if (registeredAgentId) {
        const agent = agents.get(registeredAgentId);
        if (agent) {
          log(`[agent] "${agent.name}" (${agent.machineId}) desconectado`, "print");
          agents.delete(registeredAgentId);
        }
      }
    });

    // ── Erros de socket do agente ─────────────────────────────────────────────
    // Sem este handler, um ECONNRESET ou EPIPE ao fechar o agente derrubaria
    // o servidor principal (exceção não capturada no EventEmitter).
    ws.on("error", (err) => {
      log(`[agent] WebSocket erro (não-fatal): ${err.message}`, "print");
    });
  });

  log("[agent] WebSocket server iniciado em /ws/print-agent", "print");
}
