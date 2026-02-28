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
    w: type === "camera" ? 6 : type === "solar" ? 8 : 3,
    h: type === "camera" ? 4 : type === "solar" ? 4 : type === "energy" ? 3 : 2,
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
      snapshotUrl: "",
      rtspUrl: "rtsp://camera.local:554/stream1",
      refreshMs: 2000,
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
    position: {
      ...basePosition,
      w: Math.min(8, grid.columns),
    },
  };
}
