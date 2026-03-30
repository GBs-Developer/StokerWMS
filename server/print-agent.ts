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

  // Upgrade only on /ws/print-agent path
  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url !== "/ws/print-agent") return;
    wss.handleUpgrade(request, socket as any, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    let registeredAgentId: string | null = null;

    // Authentication timeout: agent must register within 10s
    const authTimeout = setTimeout(() => {
      if (!registeredAgentId) {
        log("[agent] Conexão sem autenticação — fechando", "print");
        ws.close(4001, "authentication timeout");
      }
    }, 10_000);

    ws.on("message", async (data: Buffer) => {
      let msg: AgentMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "JSON inválido" }));
        return;
      }

      // ── Register ──────────────────────────────────────────────────────────
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
            ws.send(JSON.stringify({ type: "register_error", message: "token e machineId obrigatórios" }));
            ws.close(4002, "missing fields");
            return;
          }

          const tokenHash = hashToken(token);

          // Lookup agent in DB by token hash
          const [agentRecord] = await db
            .select()
            .from(printAgents)
            .where(eq(printAgents.tokenHash, tokenHash))
            .limit(1);

          if (!agentRecord || !agentRecord.active) {
            log(`[agent] Token inválido de ${machineId}`, "print");
            ws.send(JSON.stringify({ type: "register_error", message: "Token inválido ou agente desativado" }));
            ws.close(4003, "invalid token");
            return;
          }

          // Disconnect any existing connection for this agent
          const existing = agents.get(agentRecord.id);
          if (existing && existing.ws.readyState === WebSocket.OPEN) {
            existing.ws.close(4004, "nova conexão para mesmo agente");
          }

          registeredAgentId = agentRecord.id;

          const connected: ConnectedAgent = {
            ws,
            agentId: agentRecord.id,
            companyId: agentRecord.companyId,
            machineId,
            name: agentRecord.name,
            printers,
            connectedAt: new Date(),
            lastPing: new Date(),
          };

          agents.set(agentRecord.id, connected);

          // Update last_seen_at in DB (non-blocking)
          db.update(printAgents)
            .set({ lastSeenAt: new Date().toISOString(), machineId })
            .where(eq(printAgents.id, agentRecord.id))
            .catch(() => {});

          log(`[agent] "${agentRecord.name}" (${machineId}) conectado — ${printers.length} impressora(s)`, "print");

          ws.send(JSON.stringify({
            type: "registered",
            agentId: agentRecord.id,
            name: agentRecord.name,
            machineId,
          }));
        } catch (err: any) {
          log(`[agent] Erro no registro: ${err.message}`, "print");
          ws.send(JSON.stringify({ type: "register_error", message: "Erro interno no servidor" }));
          ws.close(4005, "server error");
        }
        return;
      }

      // All messages below require authentication
      if (!registeredAgentId) {
        ws.send(JSON.stringify({ type: "error", message: "não autenticado" }));
        return;
      }

      const agent = agents.get(registeredAgentId);
      if (!agent) return;

      // ── Ping / Pong ───────────────────────────────────────────────────────
      if (msg.type === "ping") {
        agent.lastPing = new Date();
        ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        return;
      }

      // ── Printer list update ───────────────────────────────────────────────
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

      // ── Print result ──────────────────────────────────────────────────────
      if (msg.type === "print_result") {
        const jobId = String(msg.jobId ?? "");
        const pending = pendingJobs.get(jobId);
        if (pending) {
          clearTimeout(pending.timeoutId);
          pendingJobs.delete(jobId);
          const success = Boolean(msg.success);
          const error = msg.error ? String(msg.error) : undefined;
          if (success) {
            log(`[agent] Job #${jobId} ✓ ${agent.machineId}`, "print");
          } else {
            log(`[agent] Job #${jobId} ERRO: ${error}`, "print");
          }
          pending.resolve({ success, error });
        }
        return;
      }
    });

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

    ws.on("error", (err) => {
      // Never propagate WS errors to main server
      log(`[agent] WebSocket erro: ${err.message}`, "print");
    });
  });

  log("[agent] WebSocket server iniciado em /ws/print-agent", "print");
}
