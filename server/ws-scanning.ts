import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import { IncomingMessage } from "http";
import { log } from "./log";
import { getUserFromToken } from "./auth";
import { storage } from "./storage";
import { broadcastSSE } from "./sse";
import { parse as parseCookie } from "cookie";

interface ScanningClient {
  ws: WebSocket;
  userId: string;
  companyId: number | undefined;
  userRole: string;
  userName: string;
  userSections: string[];
}

const clients = new Map<WebSocket, ScanningClient>();

const processedMsgIds = new Map<string, { timestamp: number; response: object }>();
const MSG_DEDUP_TTL = 5 * 60 * 1000;

function cleanupProcessedMsgIds() {
  const now = Date.now();
  for (const [id, entry] of processedMsgIds) {
    if (now - entry.timestamp > MSG_DEDUP_TTL) {
      processedMsgIds.delete(id);
    }
  }
}

setInterval(cleanupProcessedMsgIds, 60_000);

function sendMsg(ws: WebSocket, msg: object) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  } catch {}
}

function sendAndCache(ws: WebSocket, msg: any) {
  sendMsg(ws, msg);
  if (msg.msgId) {
    processedMsgIds.set(msg.msgId, { timestamp: Date.now(), response: msg });
  }
}

async function authenticateWS(request: IncomingMessage): Promise<{ userId: string; companyId?: number; role: string; name: string; sections: string[] } | null> {
  let token: string | null = null;

  const url = new URL(request.url || "/", "http://localhost");
  token = url.searchParams.get("token");

  if (!token && request.headers.cookie) {
    const cookies = parseCookie(request.headers.cookie);
    token = cookies.authToken || null;
  }

  if (!token) return null;

  const result = await getUserFromToken(token);
  if (!result) return null;

  return {
    userId: result.user.id,
    companyId: result.companyId ?? undefined,
    role: result.user.role || "separacao",
    name: result.user.name || result.user.username,
    sections: (result.user as any).sections || [],
  };
}

function authorizeWorkUnitWS(wu: { companyId: number; section: string | null }, client: ScanningClient): { allowed: boolean; reason?: string } {
  if (client.companyId && wu.companyId !== client.companyId) {
    return { allowed: false, reason: "Acesso negado: empresa diferente" };
  }
  if (client.userRole === "separacao") {
    if (client.userSections.length === 0) {
      return { allowed: false, reason: "Acesso negado: sem seções atribuídas" };
    }
    if (wu.section && !client.userSections.includes(wu.section)) {
      return { allowed: false, reason: "Acesso negado: seção não permitida" };
    }
  }
  return { allowed: true };
}

function assertLockOwnershipWS(wu: { lockedBy: string | null; lockExpiresAt: string | null }, client: ScanningClient): { allowed: boolean; reason?: string } {
  if (client.userRole === "supervisor" || client.userRole === "administrador") {
    return { allowed: true };
  }
  if (!wu.lockedBy) {
    return { allowed: false, reason: "Unidade não está bloqueada" };
  }
  if (wu.lockedBy !== client.userId) {
    return { allowed: false, reason: "Unidade bloqueada por outro operador" };
  }
  if (wu.lockExpiresAt && new Date(wu.lockExpiresAt) < new Date()) {
    return { allowed: false, reason: "Lock expirado. Bloqueie novamente." };
  }
  return { allowed: true };
}

async function handleScanItem(client: ScanningClient, msg: any) {
  const { msgId, workUnitId, barcode, quantity } = msg;

  if (msgId) {
    const cached = processedMsgIds.get(msgId);
    if (cached) {
      sendMsg(client.ws, cached.response);
      return;
    }
  }

  try {
    const workUnit = await storage.getWorkUnitById(workUnitId);
    if (!workUnit) {
      return sendMsg(client.ws, { type: "scan_ack", msgId, status: "error", message: "Unidade não encontrada" });
    }

    const authCheck = authorizeWorkUnitWS(workUnit, client);
    if (!authCheck.allowed) {
      return sendMsg(client.ws, { type: "scan_ack", msgId, status: "error", message: authCheck.reason });
    }
    const lockCheck = assertLockOwnershipWS(workUnit, client);
    if (!lockCheck.allowed) {
      return sendMsg(client.ws, { type: "scan_ack", msgId, status: "error", message: lockCheck.reason });
    }

    const product = await storage.getProductByBarcode(barcode);
    if (!product) {
      return sendMsg(client.ws, { type: "scan_ack", msgId, status: "not_found", message: "Produto não encontrado" });
    }

    const matchingItems = workUnit.items.filter(i => i.productId === product.id);
    if (matchingItems.length === 0) {
      return sendMsg(client.ws, { type: "scan_ack", msgId, status: "not_found", message: "Produto não pertence a esta unidade" });
    }

    const item = matchingItems.length === 1
      ? matchingItems[0]
      : matchingItems.find(i => {
          const sep = Number(i.separatedQty);
          const tgt = Number(i.quantity) - Number(i.exceptionQty || 0);
          return sep < tgt;
        }) || matchingItems[0];

    const exceptionQty = Number(item.exceptionQty || 0);
    const adjustedTarget = Number(item.quantity) - exceptionQty;

    let multiplier = 1;
    if (product.barcode !== barcode && product.boxBarcodes && Array.isArray(product.boxBarcodes)) {
      const bx = (product.boxBarcodes as any[]).find((b: any) => b.code === barcode);
      if (bx && bx.qty) multiplier = bx.qty;
    }

    const rawQty = quantity !== undefined && quantity !== null ? Number(quantity) : 1;
    const requestedQty = rawQty === 1 ? multiplier : rawQty;

    const scanResult = await storage.atomicScanSeparatedQty(
      item.id, requestedQty, adjustedTarget, workUnitId, workUnit.orderId
    );

    if (scanResult.result === "over_limit" || scanResult.result === "partial_over") {
      const resetWorkUnit = await storage.getWorkUnitById(workUnitId);
      const msgText = exceptionQty > 0
        ? `Item com ${exceptionQty} exceção(ões). Máx: ${scanResult.adjustedTarget}. Separação reiniciada.`
        : `Quantidade excedida (${scanResult.adjustedTarget}). Separação reiniciada.`;
      return sendAndCache(client.ws, {
        type: "scan_ack",
        msgId,
        status: exceptionQty > 0 ? "over_quantity_with_exception" : "over_quantity",
        message: msgText,
        quantity: requestedQty,
        exceptionQty,
        workUnit: resetWorkUnit,
        product,
      });
    }

    broadcastSSE("item_picked", { workUnitId, orderId: workUnit.orderId, productId: product.id, userId: client.userId }, client.companyId);
    await storage.checkAndCompleteWorkUnit(workUnitId, false);
    const finalWorkUnit = await storage.getWorkUnitById(workUnitId);

    sendAndCache(client.ws, {
      type: "scan_ack",
      msgId,
      status: "success",
      product,
      quantity: requestedQty,
      workUnit: finalWorkUnit,
    });
  } catch (error: any) {
    const pgCode = error?.code;
    const detail = pgCode === "23505" ? "Conflito de dados. Atualize a tela."
      : pgCode === "55P03" ? "Outro operador está bipando este item."
      : "Erro interno ao processar leitura.";
    sendMsg(client.ws, { type: "scan_ack", msgId, status: "error", message: detail });
  }
}

async function handleCheckItem(client: ScanningClient, msg: any) {
  const { msgId, workUnitId, barcode, quantity } = msg;

  if (msgId) {
    const cached = processedMsgIds.get(msgId);
    if (cached) {
      sendMsg(client.ws, cached.response);
      return;
    }
  }

  try {
    const workUnit = await storage.getWorkUnitById(workUnitId);
    if (!workUnit) {
      return sendMsg(client.ws, { type: "check_ack", msgId, status: "error", message: "Unidade não encontrada" });
    }

    const authCheck = authorizeWorkUnitWS(workUnit, client);
    if (!authCheck.allowed) {
      return sendMsg(client.ws, { type: "check_ack", msgId, status: "error", message: authCheck.reason });
    }
    const lockCheck = assertLockOwnershipWS(workUnit, client);
    if (!lockCheck.allowed) {
      return sendMsg(client.ws, { type: "check_ack", msgId, status: "error", message: lockCheck.reason });
    }

    const product = await storage.getProductByBarcode(barcode);
    if (!product) {
      return sendMsg(client.ws, { type: "check_ack", msgId, status: "not_found", message: "Produto não encontrado" });
    }

    const matchingItems = workUnit.items.filter(i => i.productId === product.id);
    if (matchingItems.length === 0) {
      return sendMsg(client.ws, { type: "check_ack", msgId, status: "not_found", message: "Produto não pertence a esta unidade" });
    }

    const item = matchingItems.length === 1
      ? matchingItems[0]
      : matchingItems.find(i => {
          const chk = Number(i.checkedQty);
          const tgt = Number(i.quantity) - Number(i.exceptionQty || 0);
          return chk < tgt;
        }) || matchingItems[0];

    const currentQty = Number(item.checkedQty);
    const itemExcQty = Number(item.exceptionQty || 0);
    const targetQty = Number(item.quantity) - itemExcQty;

    if (targetQty <= 0) {
      return sendMsg(client.ws, { type: "check_ack", msgId, status: "not_found", message: "Item totalmente em exceção" });
    }

    let multiplier = 1;
    if (product.barcode !== barcode && product.boxBarcodes && Array.isArray(product.boxBarcodes)) {
      const bx = (product.boxBarcodes as any[]).find((b: any) => b.code === barcode);
      if (bx && bx.qty) multiplier = bx.qty;
    }

    const requestedQty = Number(quantity || 1) * multiplier;

    if (currentQty >= targetQty) {
      return sendMsg(client.ws, {
        type: "check_ack",
        msgId,
        status: "over_quantity",
        product,
        quantity: requestedQty,
        workUnit,
        message: `Item já totalmente conferido (${targetQty}/${targetQty}). O extra foi recusado.`,
      });
    }

    const availableQty = targetQty - currentQty;
    if (requestedQty > availableQty) {
      const statusLabel = itemExcQty > 0 ? "over_quantity_with_exception" : "over_quantity";
      const msgText = itemExcQty > 0
        ? `Excede o disponível (${availableQty}). ${itemExcQty} exceções. Conferido (${currentQty}) mantido.`
        : `Excede o disponível (${availableQty}). Quantidade (${currentQty}) mantida.`;
      return sendMsg(client.ws, {
        type: "check_ack",
        msgId,
        status: statusLabel,
        product,
        quantity: requestedQty,
        workUnit,
        exceptionQty: itemExcQty,
        message: msgText,
      });
    }

    const newQty = currentQty + requestedQty;
    const newStatus = newQty >= targetQty ? "conferido" : "separado";
    await storage.atomicIncrementCheckedQty(item.id, requestedQty, newStatus);

    const finalWorkUnit = await storage.getWorkUnitById(workUnitId);

    sendAndCache(client.ws, {
      type: "check_ack",
      msgId,
      status: "success",
      product,
      quantity: requestedQty,
      workUnit: finalWorkUnit,
    });
  } catch (error: any) {
    const pgCode = error?.code;
    const detail = pgCode === "55P03" ? "Outro operador está conferindo este item."
      : "Erro interno ao processar conferência.";
    sendMsg(client.ws, { type: "check_ack", msgId, status: "error", message: detail });
  }
}

export function setupScanningWS(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("error", (err) => {
    log(`[scanning-ws] Server error (não-fatal): ${err.message}`, "express");
  });

  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url?.startsWith("/ws/scanning")) {
      socket.on("error", (err: NodeJS.ErrnoException) => {
        const normal = ["ECONNRESET", "EPIPE", "ECONNABORTED"];
        if (!normal.includes(err.code ?? "")) {
          log(`[scanning-ws] Socket upgrade error: ${err.message}`, "express");
        }
      });
      wss.handleUpgrade(request, socket as any, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", async (ws: WebSocket, request: IncomingMessage) => {
    const authResult = await authenticateWS(request);
    if (!authResult) {
      sendMsg(ws, { type: "auth_error", message: "Não autenticado" });
      ws.close(4001, "authentication failed");
      return;
    }

    const client: ScanningClient = {
      ws,
      userId: authResult.userId,
      companyId: authResult.companyId,
      userRole: authResult.role,
      userName: authResult.name,
      userSections: authResult.sections,
    };
    clients.set(ws, client);

    sendMsg(ws, { type: "auth_ok", userId: authResult.userId });
    log(`[scanning-ws] ${authResult.name} conectado`, "express");

    ws.on("message", async (data: Buffer) => {
      try {
        if (data.length > 64 * 1024) return;

        let msg: any;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          sendMsg(ws, { type: "error", message: "JSON inválido" });
          return;
        }

        switch (msg.type) {
          case "ping":
            sendMsg(ws, { type: "pong" });
            break;
          case "scan":
            await handleScanItem(client, msg);
            break;
          case "check":
            await handleCheckItem(client, msg);
            break;
          default:
            sendMsg(ws, { type: "error", message: `Tipo desconhecido: ${msg.type}` });
        }
      } catch (err: any) {
        log(`[scanning-ws] Message handler error: ${err.message}`, "express");
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      log(`[scanning-ws] ${authResult.name} desconectado`, "express");
    });

    ws.on("error", () => {
      clients.delete(ws);
    });
  });

  log("[scanning-ws] WebSocket scanning server iniciado em /ws/scanning", "express");
}
