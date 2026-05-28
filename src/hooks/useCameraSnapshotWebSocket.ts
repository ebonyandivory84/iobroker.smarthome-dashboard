import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

const CAMERA_SNAPSHOT_WS_PATH = "/smarthome-dashboard/ws-camera-snapshot";
const WS_RECONNECT_BASE_DELAY_MS = 900;
const WS_RECONNECT_MAX_DELAY_MS = 9000;

type UseCameraSnapshotWebSocketInput = {
  enabled: boolean;
  snapshotUrl: string | null;
  refreshMs: number;
};

export function useCameraSnapshotWebSocket({ enabled, snapshotUrl, refreshMs }: UseCameraSnapshotWebSocketInput) {
  const [connected, setConnected] = useState(false);
  const [snapshotDataUrl, setSnapshotDataUrl] = useState<string | null>(null);
  const wsUrl = useMemo(() => buildCameraSnapshotWebSocketUrl(), []);

  useEffect(() => {
    if (!enabled || !snapshotUrl || !wsUrl) {
      setConnected(false);
      setSnapshotDataUrl(null);
      return;
    }

    let active = true;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;

    const clearReconnectTimer = () => {
      if (!reconnectTimer) {
        return;
      }
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const scheduleReconnect = () => {
      if (!active) {
        return;
      }
      clearReconnectTimer();
      const delay = Math.min(WS_RECONNECT_MAX_DELAY_MS, WS_RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt);
      reconnectAttempt = Math.min(reconnectAttempt + 1, 8);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const sendStart = () => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      const payload = {
        type: "start",
        url: snapshotUrl,
        refreshMs: Math.max(400, Math.round(refreshMs || 2000)),
      };
      socket.send(JSON.stringify(payload));
    };

    const connect = () => {
      if (!active) {
        return;
      }

      try {
        socket = new WebSocket(wsUrl);
      } catch {
        setConnected(false);
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        if (!active || !socket) {
          return;
        }
        reconnectAttempt = 0;
        setConnected(true);
        sendStart();
      };

      socket.onmessage = (event) => {
        if (!active) {
          return;
        }
        try {
          const payload = JSON.parse(String(event.data ?? ""));
          if (payload?.type !== "snapshot" || typeof payload?.dataUrl !== "string") {
            return;
          }
          setSnapshotDataUrl(payload.dataUrl);
        } catch {
          // Ignore malformed websocket payloads.
        }
      };

      socket.onclose = () => {
        if (!active) {
          return;
        }
        setConnected(false);
        scheduleReconnect();
      };

      socket.onerror = () => {
        if (!active) {
          return;
        }
        setConnected(false);
      };
    };

    connect();

    return () => {
      active = false;
      setConnected(false);
      clearReconnectTimer();
      if (socket) {
        try {
          socket.close();
        } catch {
          // Ignore best-effort socket close failures.
        }
      }
    };
  }, [enabled, refreshMs, snapshotUrl, wsUrl]);

  return {
    connected,
    snapshotDataUrl,
  };
}

function buildCameraSnapshotWebSocketUrl() {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return "";
  }

  try {
    const baseUrl = window.location.origin || "";
    if (!baseUrl) {
      return "";
    }

    const url = new URL(baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = CAMERA_SNAPSHOT_WS_PATH;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}
