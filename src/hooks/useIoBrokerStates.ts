import { useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { IoBrokerClient } from "../services/iobroker";
import { DashboardSettings, StateSnapshot, WidgetConfig } from "../types/dashboard";
import { resolveMobileWidget } from "../utils/mobileWidget";
import { useDocumentVisibility } from "./useDocumentVisibility";

export type StateWriteFeedback = {
  expectedValue: unknown;
  status: "pending" | "confirmed" | "error";
  updatedAt: number;
};

function inferRaspberryPercentStateId(stateId: string, key: "ramFree" | "diskFree") {
  const trimmed = stateId.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.toLowerCase().includes("percent")) {
    return trimmed;
  }

  const suffix = `.${key}`;
  if (trimmed.endsWith(suffix)) {
    return `${trimmed}Percent`;
  }

  return "";
}

const collectWidgetStateIds = (widget: WidgetConfig) => {
  if (widget.type === "state") {
    return [widget.stateId];
  }
  if (widget.type === "energy") {
    return [
      widget.pvStateId,
      widget.houseStateId,
      widget.batteryStateId || "",
      widget.gridStateId || "",
    ];
  }
  if (widget.type === "solar") {
    const prefix = widget.statePrefix;
    const withPrefix = (key?: string) => (key ? `${prefix}.${key}` : "");
    return [
      widget.wallboxCarStateId || "",
      widget.wallboxChargePowerStateId || "",
      widget.wallboxAmpereStateId || "",
      widget.wallboxPhaseModeStateId || "",
      widget.wallboxCarSocStateId || "",
      widget.wallboxCarRangeStateId || "",
      withPrefix(widget.keys.pvNow),
      withPrefix(widget.keys.homeNow),
      withPrefix(widget.keys.gridIn),
      withPrefix(widget.keys.gridOut),
      withPrefix(widget.keys.soc),
      withPrefix(widget.keys.battIn),
      withPrefix(widget.keys.battOut),
      withPrefix(widget.keys.dayConsumed),
      withPrefix(widget.keys.daySelf),
      withPrefix(widget.keys.pvTotal),
      withPrefix(widget.keys.battTemp),
      widget.stats?.first?.stateId || "",
      widget.stats?.second?.stateId || "",
      widget.stats?.third?.stateId || "",
    ];
  }
  if (widget.type === "raspberryPiStats") {
    return [
      widget.cpuTempStateId,
      widget.cpuLoadStateId,
      widget.ramFreeStateId,
      widget.diskFreeStateId,
      inferRaspberryPercentStateId(widget.ramFreeStateId, "ramFree"),
      inferRaspberryPercentStateId(widget.diskFreeStateId, "diskFree"),
      widget.onlineStateId,
    ];
  }
  if (widget.type === "coco") {
    return [
      widget.insideStateId,
      widget.lastDirectionStateId || "",
      widget.lastFlapStateId || "",
      widget.lastTimeStateId,
      widget.timesOutsideStateId || "",
      widget.timeSpentOutsideStateId || "",
      widget.flapBatteryStateId || "",
      widget.flapOnlineStateId || "",
      widget.hubOnlineStateId || "",
      widget.adapterConnectedStateId || "",
      widget.allDevicesOnlineStateId || "",
      widget.offlineDevicesStateId || "",
      widget.lockModeStateId || "",
      widget.lockWriteStateId || "",
    ];
  }
  return [];
};

const pickStateIds = (widgets: ReturnType<typeof useDashboardConfig>["config"]["widgets"]) =>
  widgets.flatMap((widget) => {
    const mobileVariant = resolveMobileWidget(widget);
    return [...collectWidgetStateIds(widget), ...collectWidgetStateIds(mobileVariant)];
  });

const normalizeStateIds = (stateIds: string[]) =>
  Array.from(new Set(stateIds.map((entry) => entry.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "de"));
const WS_RECONNECT_BASE_DELAY_MS = 850;
const WS_RECONNECT_MAX_DELAY_MS = 8000;

export function useIoBrokerStates() {
  const { config } = useDashboardConfig();
  const documentVisible = useDocumentVisibility();
  const [states, setStates] = useState<StateSnapshot>({});
  const [stateWrites, setStateWrites] = useState<Record<string, StateWriteFeedback>>({});
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const client = useMemo(
    () => new IoBrokerClient(config),
    [
      config.iobroker.adapterBasePath,
      config.iobroker.baseUrl,
      config.iobroker.password,
      config.iobroker.token,
      config.iobroker.username,
    ]
  );
  const watchedStateIds = useMemo(() => normalizeStateIds(pickStateIds(config.widgets)), [config.widgets]);
  const statePushWsUrl = useMemo(
    () => buildStatePushWebSocketUrl(config),
    [config.iobroker.adapterBasePath, config.iobroker.baseUrl]
  );
  const shouldUseStatePushWebSocket = Platform.OS === "web" && Boolean(statePushWsUrl);
  const watchRequestIdRef = useRef(0);

  useEffect(() => {
    if (!shouldUseStatePushWebSocket || !documentVisible || !statePushWsUrl) {
      setWsConnected(false);
      return;
    }

    let active = true;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;

    const applyIncomingStateBatch = (incoming: StateSnapshot) => {
      let nextSnapshot = incoming;
      setStates((current) => {
        const normalized = buildWatchedStateSnapshot(current, incoming, watchedStateIds);
        nextSnapshot = normalized;
        return areStateSnapshotsEqual(current, normalized, watchedStateIds) ? current : normalized;
      });
      setStateWrites((current) => resolveStateWriteFeedback(current, nextSnapshot));
      setError(null);
      setIsOnline(true);
    };

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

    const connect = () => {
      if (!active) {
        return;
      }

      try {
        socket = new WebSocket(statePushWsUrl);
      } catch (connectError) {
        setWsConnected(false);
        setError(connectError instanceof Error ? connectError.message : "State push websocket connection failed");
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        if (!active || !socket) {
          return;
        }
        reconnectAttempt = 0;
        setWsConnected(true);
        setIsOnline(true);
        setError(null);
        watchRequestIdRef.current += 1;
        const watchPayload = {
          type: "watch",
          requestId: `watch-${watchRequestIdRef.current}`,
          stateIds: watchedStateIds,
        };
        socket.send(JSON.stringify(watchPayload));
      };

      socket.onmessage = (event) => {
        if (!active) {
          return;
        }

        try {
          const payload = JSON.parse(String(event.data ?? ""));
          if (payload?.type !== "stateBatch") {
            return;
          }
          const rawStates = payload?.states;
          if (!rawStates || typeof rawStates !== "object" || Array.isArray(rawStates)) {
            return;
          }
          applyIncomingStateBatch(rawStates as StateSnapshot);
        } catch {
          // Ignore malformed websocket payloads; polling fallback stays active.
        }
      };

      socket.onclose = () => {
        if (!active) {
          return;
        }
        setWsConnected(false);
        scheduleReconnect();
      };

      socket.onerror = () => {
        if (!active) {
          return;
        }
        setWsConnected(false);
      };
    };

    connect();

    return () => {
      active = false;
      setWsConnected(false);
      clearReconnectTimer();
      if (socket) {
        try {
          socket.close();
        } catch {
          // Ignore best-effort socket close errors.
        }
      }
    };
  }, [documentVisible, shouldUseStatePushWebSocket, statePushWsUrl, watchedStateIds]);

  useEffect(() => {
    if (!documentVisible) {
      return;
    }
    if (shouldUseStatePushWebSocket && wsConnected) {
      return;
    }

    let active = true;
    let syncInFlight = false;
    let syncPending = false;

    const sync = async () => {
      if (syncInFlight) {
        syncPending = true;
        return;
      }
      syncInFlight = true;
      try {
        const next = await client.readStates(watchedStateIds);
        if (active) {
          let nextSnapshot = next;
          setStates((current) => {
            const normalized = buildWatchedStateSnapshot(current, next, watchedStateIds);
            nextSnapshot = normalized;
            return areStateSnapshotsEqual(current, normalized, watchedStateIds) ? current : normalized;
          });
          setStateWrites((current) => resolveStateWriteFeedback(current, nextSnapshot));
          setError(null);
          setIsOnline(true);
        }
      } catch (syncError) {
        if (active) {
          setError(syncError instanceof Error ? syncError.message : "State sync failed");
          setIsOnline(false);
        }
      } finally {
        syncInFlight = false;
        if (active && syncPending) {
          syncPending = false;
          void sync();
        }
      }
    };

    void sync();
    client.primeObjectCache();
    const timer = setInterval(() => {
      void sync();
    }, Math.max(250, config.pollingMs));

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [client, config.pollingMs, documentVisible, shouldUseStatePushWebSocket, watchedStateIds, wsConnected]);

  const writeStateTracked = async (stateId: string, value: unknown) => {
    const startedAt = Date.now();

    setStateWrites((current) => ({
      ...current,
      [stateId]: {
        expectedValue: value,
        status: "pending",
        updatedAt: startedAt,
      },
    }));

    try {
      await client.writeState(stateId, value);
    } catch (writeError) {
      setStateWrites((current) => ({
        ...current,
        [stateId]: {
          expectedValue: value,
          status: "error",
          updatedAt: Date.now(),
        },
      }));
      throw writeError;
    }
  };

  return {
    client,
    error,
    isOnline,
    states,
    stateWrites,
    writeStateTracked,
  };
}

function buildStatePushWebSocketUrl(config: DashboardSettings) {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return "";
  }

  const configuredBase = (config.iobroker.baseUrl || "").trim();
  const baseUrl = (configuredBase || window.location.origin || "").trim();
  if (!baseUrl) {
    return "";
  }

  const adapterBasePath = normalizeAdapterBasePath(config.iobroker.adapterBasePath);
  const wsPath = adapterBasePath.endsWith("/api")
    ? `${adapterBasePath.slice(0, -4)}/ws`
    : `${adapterBasePath}/ws`;

  try {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = wsPath;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeAdapterBasePath(rawPath?: string) {
  const trimmed = String(rawPath || "/smarthome-dashboard/api").trim();
  if (!trimmed) {
    return "/smarthome-dashboard/api";
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function buildWatchedStateSnapshot(
  previous: StateSnapshot,
  incoming: StateSnapshot,
  watchedStateIds: string[]
) {
  const next: StateSnapshot = {};

  for (const stateId of watchedStateIds) {
    if (Object.prototype.hasOwnProperty.call(incoming, stateId)) {
      next[stateId] = incoming[stateId];
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(previous, stateId)) {
      next[stateId] = previous[stateId];
    }
  }

  return next;
}

function areStateSnapshotsEqual(current: StateSnapshot, next: StateSnapshot, watchedStateIds: string[]) {
  if (Object.keys(current).length !== Object.keys(next).length) {
    return false;
  }

  for (const stateId of watchedStateIds) {
    if (!Object.is(current[stateId], next[stateId])) {
      return false;
    }
  }

  return true;
}

function resolveStateWriteFeedback(
  current: Record<string, StateWriteFeedback>,
  nextStates: StateSnapshot
) {
  const now = Date.now();
  const nextEntries = Object.entries(current).reduce<Record<string, StateWriteFeedback>>((acc, [stateId, feedback]) => {
    const actualValue = nextStates[stateId];

    if (feedback.status === "pending" && matchesExpectedValue(actualValue, feedback.expectedValue)) {
      acc[stateId] = {
        ...feedback,
        status: "confirmed",
        updatedAt: now,
      };
      return acc;
    }

    if ((feedback.status === "confirmed" || feedback.status === "error") && now - feedback.updatedAt > 1800) {
      return acc;
    }

    acc[stateId] = feedback;
    return acc;
  }, {});

  return nextEntries;
}

function matchesExpectedValue(actualValue: unknown, expectedValue: unknown) {
  if (actualValue === expectedValue) {
    return true;
  }

  const actualNormalized = normalizeComparableValue(actualValue);
  const expectedNormalized = normalizeComparableValue(expectedValue);
  return actualNormalized !== null && actualNormalized === expectedNormalized;
}

function normalizeComparableValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  const stringValue = String(value).trim().toLowerCase();
  if (stringValue === "true" || stringValue === "1" || stringValue === "on") {
    return "true";
  }
  if (stringValue === "false" || stringValue === "0" || stringValue === "off") {
    return "false";
  }

  const numericValue = Number(stringValue.replace(",", "."));
  if (Number.isFinite(numericValue) && stringValue !== "") {
    return String(numericValue);
  }

  return stringValue;
}
