import { useEffect, useMemo, useState } from "react";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { IoBrokerClient } from "../services/iobroker";
import { StateSnapshot } from "../types/dashboard";

export type StateWriteFeedback = {
  expectedValue: unknown;
  status: "pending" | "confirmed" | "error";
  updatedAt: number;
};

const pickStateIds = (widgets: ReturnType<typeof useDashboardConfig>["config"]["widgets"]) =>
  widgets.flatMap((widget) => {
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
    return [];
  });

export function useIoBrokerStates() {
  const { config } = useDashboardConfig();
  const [states, setStates] = useState<StateSnapshot>({});
  const [stateWrites, setStateWrites] = useState<Record<string, StateWriteFeedback>>({});
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const client = useMemo(() => new IoBrokerClient(config), [config]);

  useEffect(() => {
    let active = true;

    const sync = async () => {
      try {
        const next = await client.readStates(pickStateIds(config.widgets));
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
      }
    };

    sync();
    client.primeObjectCache();
    const timer = setInterval(sync, config.pollingMs);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [client, config]);

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
