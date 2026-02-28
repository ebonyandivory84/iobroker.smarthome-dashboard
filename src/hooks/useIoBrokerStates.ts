import { useEffect, useMemo, useState } from "react";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { IoBrokerClient } from "../services/iobroker";
import { StateSnapshot } from "../types/dashboard";

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
      ];
    }
    return [];
  });

export function useIoBrokerStates() {
  const { config } = useDashboardConfig();
  const [states, setStates] = useState<StateSnapshot>({});
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
    const timer = setInterval(sync, config.pollingMs);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [client, config]);

  return {
    client,
    error,
    isOnline,
    states,
  };
}
