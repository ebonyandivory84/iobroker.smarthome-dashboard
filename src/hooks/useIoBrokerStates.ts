import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { IoBrokerClient, IoBrokerStateStreamEvent } from "../services/iobroker";
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
  if (widget.type === "state") {
    return [widget.stateId];
  }
  if (widget.type === "camera") {
    return [
      widget.maximizeStateId || "",
      widget.personDetectionStateId || "",
      widget.carDetectionStateId || "",
      widget.catDetectionStateId || "",
    ];
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
  return [];
};

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
  const [stateVersions, setStateVersions] = useState<Record<string, number>>({});
  const [stateWrites, setStateWrites] = useState<Record<string, StateWriteFeedback>>({});
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const client = useMemo(() => new IoBrokerClient(config), [config]);
  const watchedStateIds = useMemo(() => normalizeStateIds(pickStateIds(config.widgets)), [config.widgets]);
  const statesRef = useRef<StateSnapshot>({});
  const streamStampRef = useRef<Record<string, number>>({});

  useEffect(() => {
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
          const previous = statesRef.current;
          const changedIds: string[] = [];
          for (const stateId of watchedStateIds) {
            if (!Object.is(previous[stateId], next[stateId])) {
              changedIds.push(stateId);
              streamStampRef.current[stateId] = Date.now();
            }
          }
          if (changedIds.length) {
            setStateVersions((current) => {
            const nextVersions = { ...current };
            changedIds.forEach((stateId) => {
              nextVersions[stateId] = (nextVersions[stateId] || 0) + 1;
            });
            return nextVersions;
          });
          }
          statesRef.current = next;
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
    const timer = setInterval(() => {
      void sync();
    }, Math.max(250, config.pollingMs));

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [client, config.pollingMs, watchedStateIds]);

  useEffect(() => {
    if (!watchedStateIds.length) {
      return;
    }

    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const abortController = new AbortController();
    const reconnectDelayMs = Math.max(800, Math.min(4000, Math.round(config.pollingMs / 2)));

    const applyStreamEvent = (event: IoBrokerStateStreamEvent) => {
      const stateId = (event.id || "").trim();
      if (!stateId) {
        return;
      }

      const stamp = Number.isFinite(event.lc) && event.lc > 0
        ? event.lc
        : Number.isFinite(event.ts) && event.ts > 0
          ? event.ts
          : Date.now();
      const previousStamp = streamStampRef.current[stateId] || 0;
      if (stamp && stamp < previousStamp) {
        return;
      }
      streamStampRef.current[stateId] = stamp;

      setStateVersions((current) => {
        return {
          ...current,
          [stateId]: (current[stateId] || 0) + 1,
        };
      });

      const currentValue = statesRef.current[stateId];
      if (Object.is(currentValue, event.val)) {
        return;
      }

      statesRef.current = {
        ...statesRef.current,
        [stateId]: event.val,
      };
      setStates((current) => ({
        ...current,
        [stateId]: event.val,
      }));
    };

    const connect = async () => {
      while (active) {
        try {
          await client.openStateStream(watchedStateIds, {
            signal: abortController.signal,
            onState: applyStreamEvent,
          });
        } catch (streamError) {
          if (!active || abortController.signal.aborted) {
            return;
          }
          const message = streamError instanceof Error ? streamError.message : String(streamError);
          if (
            message.includes("unsupported") ||
            message.includes("unavailable (404)")
          ) {
            return;
          }
        }

        if (!active || abortController.signal.aborted) {
          return;
        }
        await new Promise<void>((resolve) => {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            resolve();
          }, reconnectDelayMs);
        });
      }
    };

    void connect();

    return () => {
      active = false;
      abortController.abort();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
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
    stateVersions,
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
