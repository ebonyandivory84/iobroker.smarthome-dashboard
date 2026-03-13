import { WidgetConfig, WidgetType } from "../types/dashboard";

type GridSettings = {
  columns: number;
};

export function buildWidgetTemplate(
  type: WidgetType,
  count: number,
  grid: GridSettings
): WidgetConfig {
  const suffix = count + 1;
  const basePosition = {
    x: 0,
    y: count + 2,
    w:
      type === "camera"
        ? 6
        : type === "solar"
          ? 8
            : type === "grafana"
              ? 6
              : type === "log"
                ? 6
                : type === "script"
                  ? 6
                : type === "host"
                  ? 6
                  : type === "weather"
                    ? 4
                : type === "numpad"
                  ? 6
                : 3,
    h:
      type === "camera"
        ? 4
        : type === "solar"
          ? 4
          : type === "energy"
            ? 3
            : type === "grafana"
              ? 4
              : type === "log"
                ? 3
                : type === "script"
                  ? 3
                  : type === "host"
                    ? 3
                    : type === "weather"
                      ? 3
                : type === "numpad"
                  ? 4
                : 2,
  };

  if (type === "state") {
    return {
      id: `state-${suffix}`,
      type: "state",
      title: `Schalter ${suffix}`,
      stateId: `0_userdata.0.widgets.state_${suffix}`,
      writeable: true,
      onLabel: "Ein",
      offLabel: "Aus",
      activeValue: "true",
      inactiveValue: "false",
      iconPair: {
        active: "toggle-switch",
        inactive: "toggle-switch-off-outline",
      },
      position: basePosition,
    };
  }

  if (type === "camera") {
    return {
      id: `camera-${suffix}`,
      type: "camera",
      title: `Kamera ${suffix}`,
      titleFontSize: 14,
      previewSourceMode: "snapshot",
      snapshotUrl: "",
      mjpegUrl: "",
      flvUrl: "",
      fmp4Url: "",
      refreshMs: 2000,
      audioEnabled: false,
      position: {
        ...basePosition,
        w: Math.min(6, grid.columns),
      },
    };
  }

  if (type === "energy") {
    return {
      id: `energy-${suffix}`,
      type: "energy",
      title: `Energie ${suffix}`,
      pvStateId: `0_userdata.0.energy_${suffix}.pv`,
      houseStateId: `0_userdata.0.energy_${suffix}.house`,
      batteryStateId: `0_userdata.0.energy_${suffix}.battery`,
      gridStateId: `0_userdata.0.energy_${suffix}.grid`,
      position: {
        ...basePosition,
        w: Math.min(6, grid.columns),
      },
    };
  }

  if (type === "grafana") {
    return {
      id: `grafana-${suffix}`,
      type: "grafana",
      title: `Grafana ${suffix}`,
      url: "http://127.0.0.1:3000/d/example/example?viewPanel=1&kiosk",
      refreshMs: 10000,
      allowInteractions: true,
      position: {
        ...basePosition,
        w: Math.min(6, grid.columns),
      },
    };
  }

  if (type === "weather") {
    return {
      id: `weather-${suffix}`,
      type: "weather",
      title: `Wetter ${suffix}`,
      locationName: "Zuhause",
      locationQuery: "",
      latitude: 52.52,
      longitude: 13.41,
      timezone: "auto",
      refreshMs: 300000,
      position: {
        ...basePosition,
        w: Math.min(4, grid.columns),
      },
    };
  }

  if (type === "numpad") {
    return {
      id: `numpad-${suffix}`,
      type: "numpad",
      title: `Numpad ${suffix}`,
      position: {
        ...basePosition,
        w: Math.min(6, grid.columns),
      },
    };
  }

  if (type === "link") {
    return {
      id: `link-${suffix}`,
      type: "link",
      title: `Link ${suffix}`,
      url: "",
      position: {
        ...basePosition,
      },
    };
  }

  if (type === "log") {
    return {
      id: `log-${suffix}`,
      type: "log",
      title: `Log ${suffix}`,
      refreshMs: 2000,
      maxEntries: 80,
      minSeverity: "info",
      sourceFilter: "",
      textFilter: "",
      position: {
        ...basePosition,
        w: Math.min(6, grid.columns),
      },
    };
  }

  if (type === "script") {
    return {
      id: `script-${suffix}`,
      type: "script",
      title: `Skripte ${suffix}`,
      refreshMs: 3000,
      maxEntries: 120,
      instanceFilter: "",
      textFilter: "",
      position: {
        ...basePosition,
        w: Math.min(6, grid.columns),
      },
    };
  }

  if (type === "host") {
    return {
      id: `host-${suffix}`,
      type: "host",
      title: `Host ${suffix}`,
      refreshMs: 5000,
      hostLabel: "",
      position: {
        ...basePosition,
        w: Math.min(6, grid.columns),
      },
    };
  }

  return {
    id: `solar-${suffix}`,
    type: "solar",
    title: `Solar ${suffix}`,
    statePrefix: `0_userdata.0.solar_${suffix}`,
    keys: {
      pvNow: "pv_now",
      homeNow: "home_now",
      gridIn: "grid_in",
      gridOut: "grid_out",
      soc: "soc",
      battIn: "battery_charge",
      battOut: "battery_discharge",
      dayConsumed: "day_consumed",
      daySelf: "day_self",
      pvTotal: "pv_total",
      battTemp: "battery_temp",
    },
    dailyEnergyUnit: "auto",
    statValueUnit: "none",
    position: {
      ...basePosition,
      w: Math.min(8, grid.columns),
    },
  };
}
