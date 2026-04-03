import { useEffect, useRef, useCallback, useState } from "react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export type ScanAckHandler = (ack: any) => void;

interface PendingMessage {
  id: string;
  data: string;
  timestamp: number;
}

export function generateMsgId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const LS_KEY = "ws_scan_pending_queue";

function loadPendingQueue(): PendingMessage[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingQueue(queue: PendingMessage[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(queue));
  } catch {}
}

function clearPendingQueue() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}

export function useScanWebSocket(
  enabled: boolean,
  onAck?: ScanAckHandler,
) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const enabledRef = useRef(enabled);
  const onAckRef = useRef(onAck);
  const pendingQueueRef = useRef<PendingMessage[]>(loadPendingQueue());
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  enabledRef.current = enabled;
  onAckRef.current = onAck;

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
  }, []);

  const flushPendingQueue = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const queue = [...pendingQueueRef.current];
    if (queue.length === 0) return;

    const now = Date.now();
    const maxAge = 5 * 60 * 1000;
    const valid = queue.filter(m => now - m.timestamp < maxAge);

    for (const msg of valid) {
      try {
        ws.send(msg.data);
      } catch {}
    }

    pendingQueueRef.current = [];
    clearPendingQueue();
  }, []);

  const connect = useCallback(() => {
    if (!enabledRef.current || !mountedRef.current) return;
    cleanup();

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/scanning`;

    setStatus("connecting");

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      reconnectAttemptRef.current = 0;
      setStatus("connected");

      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: "ping" })); } catch {}
        }
      }, 30_000);

      flushPendingQueue();
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "pong" || msg.type === "auth_ok") return;

        if (msg.type === "auth_error") {
          console.warn("[ws-scanning] Auth failed:", msg.message);
          cleanup();
          setStatus("disconnected");
          return;
        }

        if (msg.type === "scan_ack" || msg.type === "check_ack") {
          if (msg.msgId) {
            pendingQueueRef.current = pendingQueueRef.current.filter(m => {
              try {
                const parsed = JSON.parse(m.data);
                return parsed.msgId !== msg.msgId;
              } catch { return true; }
            });
            savePendingQueue(pendingQueueRef.current);
          }
          onAckRef.current?.(msg);
        }
      } catch {}
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      wsRef.current = null;

      if (enabledRef.current) {
        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(1000 * Math.pow(1.5, attempt), 10_000);
        reconnectAttemptRef.current = attempt + 1;
        setStatus("reconnecting");
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current && enabledRef.current) connect();
        }, delay);
      } else {
        setStatus("disconnected");
      }
    };

    ws.onerror = () => {};
  }, [cleanup, flushPendingQueue]);

  const sendScan = useCallback((workUnitId: string, barcode: string, quantity?: number, externalMsgId?: string) => {
    const msgId = externalMsgId || generateMsgId();
    const payload = JSON.stringify({
      type: "scan",
      msgId,
      workUnitId,
      barcode,
      quantity: quantity ?? undefined,
    });

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
        pendingQueueRef.current.push({ id: msgId, data: payload, timestamp: Date.now() });
        savePendingQueue(pendingQueueRef.current);
        return msgId;
      } catch {}
    }

    pendingQueueRef.current.push({ id: msgId, data: payload, timestamp: Date.now() });
    savePendingQueue(pendingQueueRef.current);
    return msgId;
  }, []);

  const sendCheck = useCallback((workUnitId: string, barcode: string, quantity?: number, externalMsgId?: string) => {
    const msgId = externalMsgId || generateMsgId();
    const payload = JSON.stringify({
      type: "check",
      msgId,
      workUnitId,
      barcode,
      quantity: quantity ?? undefined,
    });

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
        pendingQueueRef.current.push({ id: msgId, data: payload, timestamp: Date.now() });
        savePendingQueue(pendingQueueRef.current);
        return msgId;
      } catch {}
    }

    pendingQueueRef.current.push({ id: msgId, data: payload, timestamp: Date.now() });
    savePendingQueue(pendingQueueRef.current);
    return msgId;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      connect();
    } else {
      cleanup();
      setStatus("disconnected");
    }
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, connect, cleanup]);

  return {
    status,
    sendScan,
    sendCheck,
    isConnected: status === "connected",
  };
}
