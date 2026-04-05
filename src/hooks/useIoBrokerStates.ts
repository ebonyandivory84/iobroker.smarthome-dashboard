import { useEffect, useMemo, useState } from "react";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { IoBrokerClient } from "../services/iobroker";
import { StateSnapshot, WidgetConfig } from "../types/dashboard";
import { resolveMobileWidget } from "../utils/mobileWidget";

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
  const directStateIds = collectStateIdsDeep(widget);

  if (widget.type === "solar") {
    const prefix = widget.statePrefix;
    const withPrefix = (key?: string) => (key ? `${prefix}.${key}` : "");
    return [
      ...directStateIds,
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
    ];
  }
  if (widget.type === "raspberryPiStats") {
    return [
      ...directStateIds,
      widget.cpuTempStateId,
      widget.cpuLoadStateId,
      widget.ramFreeStateId,
      widget.diskFreeStateId,
      inferRaspberryPercentStateId(widget.ramFreeStateId, "ramFree"),
      inferRaspberryPercentStateId(widget.diskFreeStateId, "diskFree"),
      widget.onlineStateId,
    ];
  }
  return directStateIds;
};

function collectStateIdsDeep(value: unknown): string[] {
  const collected = new Set<string>();
  const visited = new WeakSet<object>();

  const visit = (entry: unknown, key?: string) => {
    if (typeof entry === "string") {
      if (key && /stateid$/i.test(key)) {
        const normalized = entry.trim();
        if (normalized) {
          collected.add(normalized);
        }
      }
      return;
    }

    if (!entry || typeof entry !== "object") {
      return;
    }
    if (visited.has(entry)) {
      return;
    }
    visited.add(entry);

    if (Array.isArray(entry)) {
      entry.forEach((item) => visit(item));
      return;
    }

    Object.entries(entry).forEach(([childKey, childValue]) => {
      visit(childValue, childKey);
    });
  };

  visit(value);
  return Array.from(collected);
}

const pickStateIds = (widgets: ReturnType<typeof useDashboardConfig>["config"]["widgets"]) =>
  widgets.flatMap((widget) => {
    const mobileVariant = resolveMobileWidget(widget);
    return [...collectWidgetStateIds(widget), ...collectWidgetStateIds(mobileVariant)];
  });

const normalizeStateIds = (stateIds: string[]) =>
  Array.from(new Set(stateIds.map((entry) => entry.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "de"));

export function useIoBrokerStates() {
  const { config } = useDashboardConfig();
  const [states, setStates] = useState<StateSnapshot>({});
  const [stateWrites, setStateWrites] = useState<Record<string, StateWriteFeedback>>({});
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const client = useMemo(() => new IoBrokerClient(config), [config]);
  const watchedStateIds = useMemo(() => normalizeStateIds(pickStateIds(config.widgets)), [config.widgets]);

  useEffect(() => {
    let active = true;
    let syncInFlight = false;
    let syncPending = false;
    let stopStream: (() => void) | null = null;
    const streamEnabled = client.canStreamStates() && watchedStateIds.length > 0;
    const pollIntervalMs = streamEnabled ? Math.max(10_000, config.pollingMs * 10) : Math.max(250, config.pollingMs);

    const sync = async () => {
      if (syncInFlight) {
        syncPending = true;
        return;
      }
      syncInFlight = true;
      try {
        const next = await client.readStates(watchedStateIds);
        if (active) {
          setStates(next);
          setStateWrites((current) => resolveStateWriteFeedback(current, next));
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
    if (streamEnabled) {
      stopStream = client.streamStates(watchedStateIds, {
        onConnected: () => {
          if (!active) {
            return;
          }
          setError(null);
          setIsOnline(true);
        },
        onSnapshot: (snapshot) => {
          if (!active) {
            return;
          }
          setStates(snapshot);
          setStateWrites((current) => resolveStateWriteFeedback(current, snapshot));
          setError(null);
          setIsOnline(true);
        },
        onStatePatch: (patch) => {
          if (!active) {
            return;
          }
          setStates((current) => {
            const merged = {
              ...current,
              ...patch,
            };
            setStateWrites((existing) => resolveStateWriteFeedback(existing, merged));
            return merged;
          });
          setError(null);
          setIsOnline(true);
        },
        onError: (message) => {
          if (!active) {
            return;
          }
          setError(message);
          setIsOnline(false);
        },
      });
    }

    const timer = setInterval(() => {
      void sync();
    }, pollIntervalMs);

    return () => {
      active = false;
      if (stopStream) {
        stopStream();
      }
      clearInterval(timer);
    };
  }, [client, config.pollingMs, watchedStateIds]);

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
