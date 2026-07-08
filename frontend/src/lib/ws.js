import { useEffect, useRef, useState, useCallback } from "react";

const WS_URL = `${process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws")}/api/ws`;

export function useLiveEvents(onEvent) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => { setConnected(true); retryRef.current = 0; };
      ws.onmessage = (e) => {
        try { handlerRef.current?.(JSON.parse(e.data)); } catch { /* ignore */ }
      };
      ws.onclose = () => {
        setConnected(false);
        const delay = Math.min(30000, 1000 * 2 ** retryRef.current) + Math.random() * 500;
        retryRef.current += 1;
        setTimeout(() => { if (wsRef.current === ws) connect(); }, delay);
      };
      ws.onerror = () => ws.close();
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => { const ws = wsRef.current; wsRef.current = null; ws?.close(); };
  }, [connect]);

  return connected;
}
