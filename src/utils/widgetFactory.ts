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
                    : type === "wallbox"
                      ? 6
                    : type === "heating" || type === "heatingV2"
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
                      : type === "wallbox"
                        ? 3
                        : type === "heating" || type === "heatingV2"
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

  if (type === "wallbox") {
    return {
      id: `wallbox-${suffix}`,
      type: "wallbox",
      title: `Wallbox ${suffix}`,
      refreshMs: 2000,
      showStatusSubtitle: false,
      showGridAmpereControl: true,
      targetMode: "soc",
      highlightOpacity: 0.32,
      backgroundImage: "",
      backgroundImageBlur: 8,
      stopWriteStateId: "go-e-gemini-adapter.0.control.allowCharging",
      stopStateId: "go-e-gemini-adapter.0.status.effectiveAllowCharging",
      pvWriteStateId: "go-e-gemini-adapter.0.control.mode",
      pvStateId: "go-e-gemini-adapter.0.status.activeMode",
      pvPriorityWriteStateId: "go-e-gemini-adapter.0.control.mode",
      pvPriorityStateId: "go-e-gemini-adapter.0.status.activeMode",
      gridWriteStateId: "go-e-gemini-adapter.0.control.mode",
      gridStateId: "go-e-gemini-adapter.0.status.activeMode",
      manualCurrentWriteStateId: "go-e-gemini-adapter.0.control.gridManual.currentA",
      manualCurrentStateId: "go-e-gemini-adapter.0.status.setCurrentA",
      ampereCardsWriteStateId: "go-e-gemini-adapter.0.control.gridManual.currentA",
      ampereCardsStateId: "go-e-gemini-adapter.0.status.setCurrentA",
      phaseCardsWriteStateId: "go-e-gemini-adapter.0.control.gridManual.phaseMode",
      phaseCardsStateId: "go-e-gemini-adapter.0.status.targetPhaseMode",
      stopWriteValueType: "boolean",
      stopWriteValue: "",
      stopStateValueType: "boolean",
      stopStateValue: "",
      pvWriteValueType: "number",
      pvWriteValue: "1",
      pvStateValueType: "string",
      pvStateValue: "pv only",
      pvPriorityWriteValueType: "number",
      pvPriorityWriteValue: "2",
      pvPriorityStateValueType: "string",
      pvPriorityStateValue: "pv only (go-e = priority)",
      gridWriteValueType: "number",
      gridWriteValue: "3",
      gridStateValueType: "string",
      gridStateValue: "grid mode",
      manualCurrentWriteValueType: "number",
      manualCurrentStateValueType: "number",
      ampereCardsWriteValueType: "number",
      ampereCardsStateValueType: "number",
      ampere6WriteValue: "6",
      ampere10WriteValue: "10",
      ampere12WriteValue: "12",
      ampere14WriteValue: "14",
      ampere16WriteValue: "16",
      ampere6StateValue: "6",
      ampere10StateValue: "10",
      ampere12StateValue: "12",
      ampere14StateValue: "14",
      ampere16StateValue: "16",
      phaseCardsWriteValueType: "number",
      phaseCardsStateValueType: "number",
      phase1WriteValue: "1",
      phase3WriteValue: "2",
      phase1StateValue: "1",
      phase3StateValue: "2",
      targetChargeValueType: "number",
      modeStateId: "go-e-gemini-adapter.0.control.mode",
      gridAmpereStateId: "go-e-gemini-adapter.0.control.gridManual.currentA",
      limit80StateId: "go-e-gemini-adapter.0.control.targetSocPercent",
      targetKmStateId: "",
      allowChargingStateId: "go-e-gemini-adapter.0.control.allowCharging",
      solarLoadOnlyStateId: "",
      phaseSwitchModeStateId: "go-e-gemini-adapter.0.control.gridManual.phaseMode",
      phaseSwitchModeEnabledStateId: "go-e-gemini-adapter.0.status.enabledPhases",
      ampereStateId: "go-e-gemini-adapter.0.status.setCurrentA",
      carStateId: "go-e-gemini-adapter.0.status.carState",
      batterySocStateId: "go-e-gemini-adapter.0.status.carSocPercent",
      carRangeStateId: "",
      chargePowerStateId: "go-e-gemini-adapter.0.status.chargerPowerW",
      chargedEnergyStateId: "go-e.0.eto",
      stopChargeingAtCarSoc80StateId: "go-e-gemini-adapter.0.control.targetSocEnabled",
      position: {
        ...basePosition,
        w: Math.min(6, grid.columns),
      },
    };
  }

  if (type === "heating" || type === "heatingV2") {
    const isV2 = type === "heatingV2";
    return {
      id: isV2 ? `heating-v2-${suffix}` : `heating-${suffix}`,
      type,
      title: isV2 ? `Heizung V2 ${suffix}` : `Heizung ${suffix}`,
      refreshMs: 3000,
      showStatusSubtitle: true,
      detailsTickerSpeedPxPerS: 46,
      backgroundImage: "",
      backgroundImageBlur: 8,
      modeSetStateId: "viessmannapi.0.299550.0.features.heating.circuits.1.operating.modes.active.commands.setMode.setValue",
      modeValueStateId: "viessmannapi.0.299550.0.features.heating.circuits.1.operating.modes.active.properties.value.value",
      activeProgramStateId: "viessmannapi.0.299550.0.features.heating.circuits.1.operating.programs.active.properties.value.value",
      normalSetTempStateId: "viessmannapi.0.299550.0.features.heating.circuits.1.operating.programs.normal.commands.setTemperature.setValue",
      reducedSetTempStateId: "viessmannapi.0.299550.0.features.heating.circuits.1.operating.programs.reduced.commands.setTemperature.setValue",
      comfortSetTempStateId: "viessmannapi.0.299550.0.features.heating.circuits.1.operating.programs.comfort.commands.setTemperature.setValue",
      dhwSetTempStateId: "viessmannapi.0.299550.0.features.heating.dhw.temperature.main.commands.setTargetTemperature.setValue",
      comfortActivateStateId: "viessmannapi.0.299550.0.features.heating.circuits.1.operating.programs.comfort.commands.activate.setValue",
      comfortDeactivateStateId: "viessmannapi.0.299550.0.features.heating.circuits.1.operating.programs.comfort.commands.deactivate.setValue",
      ecoSetActiveStateId: "viessmannapi.0.299550.0.features.heating.circuits.1.operating.programs.eco.commands.setActive.setValue",
      oneTimeChargeSetActiveStateId: "viessmannapi.0.299550.0.features.heating.dhw.oneTimeCharge.commands.setActive.setValue",
      oneTimeChargeActiveStateId: "viessmannapi.0.299550.0.features.heating.dhw.oneTimeCharge.properties.active.value",
      ventilationAutoSetActiveStateId: "",
      ventilationAutoActiveStateId: "",
      ventilationLevelSetStateId: "",
      ventilationLevelStateId: "",
      roomTempStateId: "viessmannapi.0.299550.0.features.heating.circuits.1.temperature.properties.value.value",
      heatingTempStateId: "viessmannapi.0.299550.0.features.heating.circuits.1.temperature.properties.value.value",
      supplyTempStateId: "viessmannapi.0.299550.0.features.heating.circuits.1.sensors.temperature.supply.properties.value.value",
      outsideTempStateId: "viessmannapi.0.299550.0.features.heating.sensors.temperature.outside.properties.value.value",
      returnTempStateId: "viessmannapi.0.299550.0.features.heating.sensors.temperature.return.properties.value.value",
      dhwTempStateId: "viessmannapi.0.299550.0.features.heating.dhw.sensors.temperature.dhwCylinder.properties.value.value",
      compressorPowerStateId: "viessmannapi.0.299550.0.features.heating.compressors.0.power.properties.value.value",
      compressorSensorPowerStateId: "viessmannapi.0.299550.0.features.heating.compressors.0.sensors.power.properties.value.value",
      showInfoProgram: true,
      showInfoTargets: true,
      showInfoOutsideTemp: true,
      showInfoSupplyTemp: true,
      showInfoReturnTemp: true,
      showInfoHeatingTemp: true,
      showInfoCompressorPower: true,
      standbyIcon: "power-standby",
      dhwIcon: "water",
      heatingIcon: "radiator",
      comfortIcon: "white-balance-sunny",
      ecoIcon: "leaf",
      oneTimeChargeIcon: "shower-head",
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
    wallboxCarStateId: "go-e.0.car",
    wallboxChargePowerStateId: "go-e.0.nrg.11",
    wallboxAmpereStateId: "go-e.0.ampere",
    wallboxPhaseModeStateId: "go-e.0.phaseSwitchMode",
    wallboxCarSocStateId: "go-e.0.carBatterySoc",
    wallboxCarRangeStateId: "",
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
