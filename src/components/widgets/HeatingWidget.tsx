import { MaterialCommunityIcons } from "@expo/vector-icons";
import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { ImageBackground, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { IoBrokerClient } from "../../services/iobroker";
import { HeatingWidgetConfig, StateSnapshot } from "../../types/dashboard";
import { playConfiguredUiSound } from "../../utils/uiSounds";
import { palette } from "../../utils/theme";

type HeatingWidgetProps = {
  config: HeatingWidgetConfig;
  client: IoBrokerClient;
};

type HeatingMode = "standby" | "dhw" | "dhwAndHeating";
type ProgramMode = "normal" | "reduced" | "comfort" | "eco";

const DEFAULT_REFRESH_MS = 3000;
const MIN_REFRESH_MS = 800;

const ROOM_TEMP_MIN = 10;
const ROOM_TEMP_MAX = 30;
const ROOM_TEMP_STEP = 0.5;

const DHW_TEMP_MIN = 10;
const DHW_TEMP_MAX = 60;
const DHW_TEMP_STEP = 1;

const DEFAULT_IDS = {
  modeSet: "viessmannapi.0.299550.0.features.heating.circuits.1.operating.modes.active.commands.setMode.setValue",
  modeValue: "viessmannapi.0.299550.0.features.heating.circuits.1.operating.modes.active.properties.value.value",
  activeProgram: "viessmannapi.0.299550.0.features.heating.circuits.1.operating.programs.active.properties.value.value",
  normalSetTemp:
    "viessmannapi.0.299550.0.features.heating.circuits.1.operating.programs.normal.commands.setTemperature.setValue",
  reducedSetTemp:
    "viessmannapi.0.299550.0.features.heating.circuits.1.operating.programs.reduced.commands.setTemperature.setValue",
  comfortSetTemp:
    "viessmannapi.0.299550.0.features.heating.circuits.1.operating.programs.comfort.commands.setTemperature.setValue",
  dhwSetTemp: "viessmannapi.0.299550.0.features.heating.dhw.temperature.main.commands.setTargetTemperature.setValue",
  comfortActivate:
    "viessmannapi.0.299550.0.features.heating.circuits.1.operating.programs.comfort.commands.activate.setValue",
  comfortDeactivate:
    "viessmannapi.0.299550.0.features.heating.circuits.1.operating.programs.comfort.commands.deactivate.setValue",
  ecoSetActive: "viessmannapi.0.299550.0.features.heating.circuits.1.operating.programs.eco.commands.setActive.setValue",
  oneTimeChargeSetActive: "viessmannapi.0.299550.0.features.heating.dhw.oneTimeCharge.commands.setActive.setValue",
  oneTimeChargeActive: "viessmannapi.0.299550.0.features.heating.dhw.oneTimeCharge.properties.active.value",
  heatingTemp: "viessmannapi.0.299550.0.features.heating.circuits.1.temperature.properties.value.value",
  supplyTemp: "viessmannapi.0.299550.0.features.heating.circuits.1.sensors.temperature.supply.properties.value.value",
  outsideTemp: "viessmannapi.0.299550.0.features.heating.sensors.temperature.outside.properties.value.value",
  returnTemp: "viessmannapi.0.299550.0.features.heating.sensors.temperature.return.properties.value.value",
  dhwTemp: "viessmannapi.0.299550.0.features.heating.dhw.sensors.temperature.dhwCylinder.properties.value.value",
  compressorPower: "viessmannapi.0.299550.0.features.heating.compressors.0.power.properties.value.value",
  compressorSensorPower: "viessmannapi.0.299550.0.features.heating.compressors.0.sensors.power.properties.value.value",
} as const;

export function HeatingWidget({ config, client }: HeatingWidgetProps) {
  const stateIds = useMemo(
    () => ({
      modeSet: resolveStateId(config.modeSetStateId, DEFAULT_IDS.modeSet),
      modeValue: resolveStateId(config.modeValueStateId, DEFAULT_IDS.modeValue),
      activeProgram: resolveStateId(config.activeProgramStateId, DEFAULT_IDS.activeProgram),
      normalSetTemp: resolveStateId(config.normalSetTempStateId, DEFAULT_IDS.normalSetTemp),
      reducedSetTemp: resolveOptionalStateId(config.reducedSetTempStateId, DEFAULT_IDS.reducedSetTemp),
      comfortSetTemp: resolveOptionalStateId(config.comfortSetTempStateId, DEFAULT_IDS.comfortSetTemp),
      dhwSetTemp: resolveStateId(config.dhwSetTempStateId, DEFAULT_IDS.dhwSetTemp),
      comfortActivate: resolveOptionalStateId(config.comfortActivateStateId, DEFAULT_IDS.comfortActivate),
      comfortDeactivate: resolveOptionalStateId(config.comfortDeactivateStateId, DEFAULT_IDS.comfortDeactivate),
      ecoSetActive: resolveOptionalStateId(config.ecoSetActiveStateId, DEFAULT_IDS.ecoSetActive),
      oneTimeChargeSetActive: resolveOptionalStateId(config.oneTimeChargeSetActiveStateId, DEFAULT_IDS.oneTimeChargeSetActive),
      oneTimeChargeActive: resolveOptionalStateId(config.oneTimeChargeActiveStateId, DEFAULT_IDS.oneTimeChargeActive),
      heatingTemp: resolveOptionalStateId(config.heatingTempStateId, DEFAULT_IDS.heatingTemp),
      supplyTemp: resolveOptionalStateId(config.supplyTempStateId, DEFAULT_IDS.supplyTemp),
      outsideTemp: resolveOptionalStateId(config.outsideTempStateId, DEFAULT_IDS.outsideTemp),
      returnTemp: resolveOptionalStateId(config.returnTempStateId, DEFAULT_IDS.returnTemp),
      dhwTemp: resolveOptionalStateId(config.dhwTempStateId, DEFAULT_IDS.dhwTemp),
      compressorPower: resolveOptionalStateId(config.compressorPowerStateId, DEFAULT_IDS.compressorPower),
      compressorSensorPower: resolveOptionalStateId(config.compressorSensorPowerStateId, DEFAULT_IDS.compressorSensorPower),
    }),
    [
      config.modeSetStateId,
      config.modeValueStateId,
      config.activeProgramStateId,
      config.normalSetTempStateId,
      config.reducedSetTempStateId,
      config.comfortSetTempStateId,
      config.dhwSetTempStateId,
      config.comfortActivateStateId,
      config.comfortDeactivateStateId,
      config.ecoSetActiveStateId,
      config.oneTimeChargeSetActiveStateId,
      config.oneTimeChargeActiveStateId,
      config.heatingTempStateId,
      config.supplyTempStateId,
      config.outsideTempStateId,
      config.returnTempStateId,
      config.dhwTempStateId,
      config.compressorPowerStateId,
      config.compressorSensorPowerStateId,
    ]
  );

  const [stateSnapshot, setStateSnapshot] = useState<StateSnapshot>({});
  const [pendingWrites, setPendingWrites] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [normalDraft, setNormalDraft] = useState<number | null>(null);
  const [dhwDraft, setDhwDraft] = useState<number | null>(null);

  const refreshMs = clampInt(config.refreshMs, DEFAULT_REFRESH_MS, MIN_REFRESH_MS);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let pendingSync = false;
    const readIds = uniqueStateIds(Object.values(stateIds));

    const sync = async () => {
      if (inFlight) {
        pendingSync = true;
        return;
      }

      inFlight = true;
      try {
        const next = await client.readStates(readIds);
        if (active) {
          setStateSnapshot((current) => mergeStateSnapshot(current, readIds, next));
          setError(null);
        }
      } catch (syncError) {
        if (active) {
          setError(syncError instanceof Error ? syncError.message : "Heizungs-States konnten nicht geladen werden");
        }
      } finally {
        inFlight = false;
        if (active && pendingSync) {
          pendingSync = false;
          void sync();
        }
      }
    };

    void sync();
    const timer = setInterval(() => {
      void sync();
    }, refreshMs);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [client, refreshMs, stateIds]);

  const readValue = useCallback(
    (stateId: string) => {
      if (!stateId) {
        return undefined;
      }
      return stateSnapshot[stateId];
    },
    [stateSnapshot]
  );

  const mode =
    normalizeMode(readValue(stateIds.modeValue)) ||
    normalizeMode(readValue(stateIds.modeSet)) ||
    "standby";
  const activeProgram = normalizeProgram(readValue(stateIds.activeProgram));
  const normalTarget = clampTemperature(
    normalizeFloat(readValue(stateIds.normalSetTemp)) ?? 21,
    ROOM_TEMP_MIN,
    ROOM_TEMP_MAX,
    ROOM_TEMP_STEP
  );
  const reducedTarget = normalizeFloat(readValue(stateIds.reducedSetTemp));
  const comfortTarget = normalizeFloat(readValue(stateIds.comfortSetTemp));
  const dhwTarget = clampTemperature(
    normalizeFloat(readValue(stateIds.dhwSetTemp)) ?? 50,
    DHW_TEMP_MIN,
    DHW_TEMP_MAX,
    DHW_TEMP_STEP
  );
  const oneTimeChargeActive = normalizeBoolean(readValue(stateIds.oneTimeChargeActive)) ?? false;

  const outsideTemp = normalizeFloat(readValue(stateIds.outsideTemp));
  const supplyTemp = normalizeFloat(readValue(stateIds.supplyTemp));
  const returnTemp = normalizeFloat(readValue(stateIds.returnTemp));
  const heatingTemp = normalizeFloat(readValue(stateIds.heatingTemp));
  const dhwTemp = normalizeFloat(readValue(stateIds.dhwTemp));
  const compressorPowerW =
    normalizePowerToWatts(readValue(stateIds.compressorPower)) ||
    normalizePowerToWatts(readValue(stateIds.compressorSensorPower));

  const normalSliderValue = normalDraft ?? normalTarget;
  const dhwSliderValue = dhwDraft ?? dhwTarget;
  const writePending = Object.values(pendingWrites).some(Boolean);

  useEffect(() => {
    if (!pendingWrites[stateIds.normalSetTemp]) {
      setNormalDraft(null);
    }
  }, [normalTarget, pendingWrites, stateIds.normalSetTemp]);

  useEffect(() => {
    if (!pendingWrites[stateIds.dhwSetTemp]) {
      setDhwDraft(null);
    }
  }, [dhwTarget, pendingWrites, stateIds.dhwSetTemp]);

  const playPressSound = useCallback(
    (key: string) => {
      playConfiguredUiSound(config.interactionSounds?.press, "tap", `${config.id}:press:${key}`);
    },
    [config.id, config.interactionSounds?.press]
  );

  const playConfirmSound = useCallback(
    (key: string) => {
      playConfiguredUiSound(config.interactionSounds?.confirm, "toggle", `${config.id}:confirm:${key}`);
    },
    [config.id, config.interactionSounds?.confirm]
  );

  const playSliderSound = useCallback(
    (key: string) => {
      playConfiguredUiSound(config.interactionSounds?.slider, "swipe", `${config.id}:slider:${key}`);
    },
    [config.id, config.interactionSounds?.slider]
  );

  const writeState = useCallback(
    async (stateId: string, value: unknown, key: string) => {
      if (!stateId) {
        return;
      }
      setPendingWrites((current) => ({ ...current, [stateId]: true }));
      setStateSnapshot((current) => ({
        ...current,
        [stateId]: value,
      }));
      setError(null);
      try {
        await client.writeState(stateId, value);
        playConfirmSound(key);
      } catch (writeError) {
        setError(writeError instanceof Error ? writeError.message : "State konnte nicht geschrieben werden");
      } finally {
        setPendingWrites((current) => ({ ...current, [stateId]: false }));
      }
    },
    [client, playConfirmSound]
  );

  const setMode = useCallback(
    (nextMode: HeatingMode) => {
      if (nextMode === mode) {
        return;
      }
      playPressSound(`mode:${nextMode}`);
      void writeState(stateIds.modeSet, nextMode, `mode:${nextMode}`);
    },
    [mode, playPressSound, stateIds.modeSet, writeState]
  );

  const setNormalTemperature = useCallback(
    (nextValue: number, source: "slider" | "button") => {
      const clamped = clampTemperature(nextValue, ROOM_TEMP_MIN, ROOM_TEMP_MAX, ROOM_TEMP_STEP);
      if (Math.abs(clamped - normalTarget) < 0.001) {
        return;
      }
      if (source === "slider") {
        playSliderSound(`normal:${clamped}`);
      } else {
        playPressSound(`normal:${clamped}`);
      }
      void writeState(stateIds.normalSetTemp, clamped, `normal:${clamped}`);
    },
    [normalTarget, playPressSound, playSliderSound, stateIds.normalSetTemp, writeState]
  );

  const setDhwTemperature = useCallback(
    (nextValue: number, source: "slider" | "button") => {
      const clamped = clampTemperature(nextValue, DHW_TEMP_MIN, DHW_TEMP_MAX, DHW_TEMP_STEP);
      if (Math.abs(clamped - dhwTarget) < 0.001) {
        return;
      }
      if (source === "slider") {
        playSliderSound(`dhw:${clamped}`);
      } else {
        playPressSound(`dhw:${clamped}`);
      }
      void writeState(stateIds.dhwSetTemp, clamped, `dhw:${clamped}`);
    },
    [dhwTarget, playPressSound, playSliderSound, stateIds.dhwSetTemp, writeState]
  );

  const toggleComfort = useCallback(() => {
    const isComfort = activeProgram === "comfort";
    const targetState = isComfort ? stateIds.comfortDeactivate : stateIds.comfortActivate;
    if (!targetState) {
      return;
    }
    playPressSound("comfort");
    void writeState(targetState, true, `comfort:${isComfort ? "off" : "on"}`);
  }, [activeProgram, playPressSound, stateIds.comfortActivate, stateIds.comfortDeactivate, writeState]);

  const toggleEco = useCallback(() => {
    if (!stateIds.ecoSetActive) {
      return;
    }
    const nextActive = activeProgram !== "eco";
    playPressSound("eco");
    void writeState(stateIds.ecoSetActive, nextActive, `eco:${nextActive ? "on" : "off"}`);
  }, [activeProgram, playPressSound, stateIds.ecoSetActive, writeState]);

  const toggleOneTimeCharge = useCallback(() => {
    if (!stateIds.oneTimeChargeSetActive) {
      return;
    }
    const nextActive = !oneTimeChargeActive;
    playPressSound("oneTimeCharge");
    void writeState(stateIds.oneTimeChargeSetActive, nextActive, `oneTimeCharge:${nextActive ? "on" : "off"}`);
  }, [oneTimeChargeActive, playPressSound, stateIds.oneTimeChargeSetActive, writeState]);

  const textColor = config.appearance?.textColor || "#f5f8ff";
  const mutedTextColor = config.appearance?.mutedTextColor || "rgba(214, 224, 244, 0.78)";
  const cardStart = config.appearance?.widgetColor || "rgba(18, 28, 42, 0.96)";
  const cardEnd = config.appearance?.widgetColor2 || "rgba(10, 16, 27, 0.98)";
  const panelColor = config.appearance?.cardColor || "rgba(255,255,255,0.035)";
  const panelBorder = "rgba(184, 206, 242, 0.16)";
  const sliderStart = config.appearance?.iconColor || "#79b5ff";
  const sliderEnd = config.appearance?.iconColor2 || "#5a85ef";
  const comfortColor = config.appearance?.activeWidgetColor || "#f6c869";
  const ecoColor = config.appearance?.activeWidgetColor2 || "#4ed09a";
  const oneTimeColor = config.appearance?.statColor || "#7fb9ff";
  const backgroundBlur = Math.min(24, clampInt(config.backgroundImageBlur, 8, 0));

  const modeButtons: Array<{
    mode: HeatingMode;
    label: string;
    icon: string;
    color: string;
  }> = [
    {
      mode: "standby",
      label: "Standby",
      icon: normalizeIcon(config.standbyIcon, "power-standby"),
      color: "rgba(178, 188, 205, 0.28)",
    },
    {
      mode: "dhw",
      label: "Nur Warmwasser",
      icon: normalizeIcon(config.dhwIcon, "water"),
      color: "rgba(116, 199, 255, 0.3)",
    },
    {
      mode: "dhwAndHeating",
      label: "Heizen + WW",
      icon: normalizeIcon(config.heatingIcon, "radiator"),
      color: "rgba(255, 183, 106, 0.32)",
    },
  ];

  const summaryText = buildStatusText({
    mode,
    activeProgram,
    outsideTemp,
    oneTimeChargeActive,
  });

  const infoRows = [
    { label: "Aussen", value: formatTemperature(outsideTemp) },
    { label: "Vorlauf", value: formatTemperature(supplyTemp) },
    { label: "Ruecklauf", value: formatTemperature(returnTemp) },
    { label: "Heizkreis", value: formatTemperature(heatingTemp) },
    { label: "Warmwasser", value: formatTemperature(dhwTemp) },
    { label: "Verdichter", value: formatPower(compressorPowerW) },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: cardStart }]}> 
        {config.backgroundImage ? (
          Platform.OS === "web" ? (
            <>
              {createElement("div", {
                style: buildBlurredWidgetBackgroundStyle(config.backgroundImage, backgroundBlur),
              })}
              <View style={styles.backgroundOverlay} />
            </>
          ) : (
            <ImageBackground
              blurRadius={backgroundBlur}
              imageStyle={styles.widgetBackgroundImage}
              source={{ uri: `/smarthome-dashboard/widget-assets/${encodeURIComponent(config.backgroundImage)}` }}
              style={styles.widgetBackground}
            >
              <View style={styles.backgroundOverlay} />
            </ImageBackground>
          )
        ) : null}

        {Platform.OS === "web"
          ? createElement("div", {
              style: {
                ...webGradientLayerStyle,
                background: `linear-gradient(145deg, ${cardStart} 0%, ${cardEnd} 100%)`,
              },
            })
          : null}

        <View style={styles.header}>
          {config.showTitle !== false ? (
            <Text numberOfLines={1} style={[styles.title, { color: textColor }]}>
              {(config.title || "Heizung").trim() || "Heizung"}
            </Text>
          ) : null}
          <View style={[styles.liveBadge, { borderColor: panelBorder, backgroundColor: panelColor }]}> 
            <Text style={[styles.liveBadgeText, { color: error ? palette.danger : mutedTextColor }]}> 
              {error ? "Fehler" : writePending ? "Sync" : "Live"}
            </Text>
          </View>
        </View>

        {config.showStatusSubtitle !== false ? (
          <Text numberOfLines={2} style={[styles.subtitle, { color: mutedTextColor }]}>
            {summaryText}
          </Text>
        ) : null}

        <View style={styles.block}>
          <Text style={[styles.blockLabel, { color: mutedTextColor }]}>Betriebsart</Text>
          <View style={[styles.modeRow, { borderColor: panelBorder, backgroundColor: panelColor }]}> 
            {modeButtons.map((item) => {
              const isActive = item.mode === mode;
              return (
                <Pressable
                  key={`mode-${item.mode}`}
                  onPress={() => setMode(item.mode)}
                  style={({ pressed }) => [
                    styles.modeButton,
                    isActive ? styles.modeButtonActive : null,
                    pressed ? styles.pressScale : null,
                  ]}
                >
                  {isActive
                    ? Platform.OS === "web"
                      ? createElement("div", {
                          style: {
                            ...webGradientLayerStyle,
                            borderRadius: 11,
                            background: `linear-gradient(135deg, ${item.color} 0%, rgba(255,255,255,0.08) 100%)`,
                          },
                        })
                      : <View style={[StyleSheet.absoluteFillObject, { borderRadius: 11, backgroundColor: item.color }]} />
                    : null}
                  <MaterialCommunityIcons color={textColor} name={item.icon as never} size={16} />
                  <Text numberOfLines={1} style={[styles.modeLabel, { color: textColor }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.block}>
          <View style={styles.blockHeaderInline}>
            <Text style={[styles.blockLabel, { color: mutedTextColor }]}>Heizung Soll (Normal)</Text>
            <Text style={[styles.valueText, { color: textColor }]}>{formatTemperature(normalSliderValue)}</Text>
          </View>
          <View style={[styles.sliderShell, { borderColor: panelBorder, backgroundColor: panelColor }]}> 
            <Pressable
              onPress={() => setNormalTemperature(normalSliderValue - ROOM_TEMP_STEP, "button")}
              style={({ pressed }) => [styles.stepButton, pressed ? styles.pressScale : null]}
            >
              <Text style={[styles.stepLabel, { color: textColor }]}>-</Text>
            </Pressable>
            <View style={styles.sliderWrap}>
              {Platform.OS === "web"
                ? createElement("input", {
                    type: "range",
                    min: ROOM_TEMP_MIN,
                    max: ROOM_TEMP_MAX,
                    step: ROOM_TEMP_STEP,
                    value: normalSliderValue,
                    onInput: (event: { target: { value: string } }) => {
                      const next = clampTemperature(Number.parseFloat(event.target.value) || normalTarget, ROOM_TEMP_MIN, ROOM_TEMP_MAX, ROOM_TEMP_STEP);
                      setNormalDraft(next);
                    },
                    onChange: (event: { target: { value: string } }) => {
                      const next = clampTemperature(Number.parseFloat(event.target.value) || normalTarget, ROOM_TEMP_MIN, ROOM_TEMP_MAX, ROOM_TEMP_STEP);
                      setNormalDraft(next);
                      void setNormalTemperature(next, "slider");
                    },
                    style: {
                      ...webSliderStyle,
                      accentColor: sliderStart,
                      backgroundImage: `linear-gradient(90deg, ${sliderStart} 0%, ${sliderEnd} 100%)`,
                    },
                  })
                : null}
              <View style={styles.sliderScaleRow}>
                <Text style={[styles.sliderScaleLabel, { color: mutedTextColor }]}>{ROOM_TEMP_MIN}°</Text>
                <Text style={[styles.sliderScaleLabel, { color: mutedTextColor }]}>{ROOM_TEMP_MAX}°</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setNormalTemperature(normalSliderValue + ROOM_TEMP_STEP, "button")}
              style={({ pressed }) => [styles.stepButton, pressed ? styles.pressScale : null]}
            >
              <Text style={[styles.stepLabel, { color: textColor }]}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.block}>
          <View style={styles.blockHeaderInline}>
            <Text style={[styles.blockLabel, { color: mutedTextColor }]}>Warmwasser Soll</Text>
            <Text style={[styles.valueText, { color: textColor }]}>{formatTemperature(dhwSliderValue)}</Text>
          </View>
          <View style={[styles.sliderShell, { borderColor: panelBorder, backgroundColor: panelColor }]}> 
            <Pressable
              onPress={() => setDhwTemperature(dhwSliderValue - DHW_TEMP_STEP, "button")}
              style={({ pressed }) => [styles.stepButton, pressed ? styles.pressScale : null]}
            >
              <Text style={[styles.stepLabel, { color: textColor }]}>-</Text>
            </Pressable>
            <View style={styles.sliderWrap}>
              {Platform.OS === "web"
                ? createElement("input", {
                    type: "range",
                    min: DHW_TEMP_MIN,
                    max: DHW_TEMP_MAX,
                    step: DHW_TEMP_STEP,
                    value: dhwSliderValue,
                    onInput: (event: { target: { value: string } }) => {
                      const next = clampTemperature(Number.parseFloat(event.target.value) || dhwTarget, DHW_TEMP_MIN, DHW_TEMP_MAX, DHW_TEMP_STEP);
                      setDhwDraft(next);
                    },
                    onChange: (event: { target: { value: string } }) => {
                      const next = clampTemperature(Number.parseFloat(event.target.value) || dhwTarget, DHW_TEMP_MIN, DHW_TEMP_MAX, DHW_TEMP_STEP);
                      setDhwDraft(next);
                      void setDhwTemperature(next, "slider");
                    },
                    style: {
                      ...webSliderStyle,
                      accentColor: sliderStart,
                      backgroundImage: `linear-gradient(90deg, ${sliderStart} 0%, ${sliderEnd} 100%)`,
                    },
                  })
                : null}
              <View style={styles.sliderScaleRow}>
                <Text style={[styles.sliderScaleLabel, { color: mutedTextColor }]}>{DHW_TEMP_MIN}°</Text>
                <Text style={[styles.sliderScaleLabel, { color: mutedTextColor }]}>{DHW_TEMP_MAX}°</Text>
              </View>
            </View>
            <Pressable
              onPress={() => setDhwTemperature(dhwSliderValue + DHW_TEMP_STEP, "button")}
              style={({ pressed }) => [styles.stepButton, pressed ? styles.pressScale : null]}
            >
              <Text style={[styles.stepLabel, { color: textColor }]}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.quickActionRow}>
          <ActionChip
            active={activeProgram === "comfort"}
            color={comfortColor}
            icon={normalizeIcon(config.comfortIcon, "white-balance-sunny")}
            label="Komfort"
            mutedTextColor={mutedTextColor}
            onPress={toggleComfort}
            textColor={textColor}
          />
          <ActionChip
            active={activeProgram === "eco"}
            color={ecoColor}
            icon={normalizeIcon(config.ecoIcon, "leaf")}
            label="Eco"
            mutedTextColor={mutedTextColor}
            onPress={toggleEco}
            textColor={textColor}
          />
          <ActionChip
            active={oneTimeChargeActive}
            color={oneTimeColor}
            icon={normalizeIcon(config.oneTimeChargeIcon, "flash")}
            label="Einmalladung"
            mutedTextColor={mutedTextColor}
            onPress={toggleOneTimeCharge}
            textColor={textColor}
          />
        </View>

        <View style={[styles.infoPanel, { borderColor: panelBorder, backgroundColor: panelColor }]}> 
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: mutedTextColor }]}>Programm</Text>
            <Text style={[styles.infoValue, { color: textColor }]}>{formatProgramLabel(activeProgram)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: mutedTextColor }]}>Zielwerte</Text>
            <Text style={[styles.infoValue, { color: textColor }]}>
              N {formatTemperature(normalTarget)} | R {formatTemperature(reducedTarget)} | K {formatTemperature(comfortTarget)}
            </Text>
          </View>
          {infoRows.map((row) => (
            <View key={row.label} style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: mutedTextColor }]}>{row.label}</Text>
              <Text style={[styles.infoValue, { color: textColor }]}>{row.value}</Text>
            </View>
          ))}
        </View>

        <Text numberOfLines={1} style={[styles.footer, { color: error ? palette.danger : mutedTextColor }]}> 
          {error || (writePending ? "Synchronisiere..." : "Bereit")}
        </Text>
      </View>
    </View>
  );
}

type ActionChipProps = {
  active: boolean;
  label: string;
  icon: string;
  color: string;
  textColor: string;
  mutedTextColor: string;
  onPress: () => void;
};

function ActionChip({ active, label, icon, color, textColor, mutedTextColor, onPress }: ActionChipProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionChip, pressed ? styles.pressScale : null]}> 
      {active
        ? Platform.OS === "web"
          ? createElement("div", {
              style: {
                ...webGradientLayerStyle,
                borderRadius: 12,
                background: `linear-gradient(135deg, ${color} 0%, rgba(255,255,255,0.1) 100%)`,
              },
            })
          : <View style={[StyleSheet.absoluteFillObject, { borderRadius: 12, backgroundColor: color }]} />
        : null}
      <MaterialCommunityIcons color={active ? "#0a1220" : textColor} name={icon as never} size={16} />
      <Text style={[styles.actionChipText, { color: active ? "#0a1220" : mutedTextColor }]}>{label}</Text>
    </Pressable>
  );
}

function uniqueStateIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function mergeStateSnapshot(current: StateSnapshot, watchedIds: string[], next: StateSnapshot) {
  const merged: StateSnapshot = { ...current };
  watchedIds.forEach((stateId) => {
    merged[stateId] = next[stateId];
  });
  return merged;
}

function resolveStateId(candidate: string | undefined, fallback: string) {
  const trimmed = String(candidate || "").trim();
  return trimmed || fallback;
}

function resolveOptionalStateId(candidate: string | undefined, fallback?: string) {
  const trimmed = String(candidate || "").trim();
  if (trimmed) {
    return trimmed;
  }
  return fallback || "";
}

function normalizeIcon(value: string | undefined, fallback: string) {
  const trimmed = (value || "").trim();
  return trimmed || fallback;
}

function clampInt(value: number | undefined, fallback: number, min: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.round(value));
}

function normalizeMode(value: unknown): HeatingMode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "standby") {
    return "standby";
  }
  if (normalized === "dhw") {
    return "dhw";
  }
  if (normalized === "dhwandheating") {
    return "dhwAndHeating";
  }
  return null;
}

function normalizeProgram(value: unknown): ProgramMode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "normal" || normalized === "reduced" || normalized === "comfort" || normalized === "eco") {
    return normalized;
  }
  return null;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "on", "yes"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "off", "no"].includes(normalized)) {
    return false;
  }
  return null;
}

function normalizeFloat(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) {
    return null;
  }
  const numeric = Number.parseFloat(normalized);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
}

function clampTemperature(value: number, min: number, max: number, step: number) {
  const clamped = Math.max(min, Math.min(max, value));
  const rounded = Math.round(clamped / step) * step;
  return Number(rounded.toFixed(2));
}

function formatTemperature(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }
  const hasFraction = Math.abs(value % 1) > 0.001;
  return `${hasFraction ? value.toFixed(1) : value.toFixed(0)} °C`;
}

function formatProgramLabel(value: ProgramMode | null) {
  if (value === "normal") {
    return "Normal";
  }
  if (value === "reduced") {
    return "Reduziert";
  }
  if (value === "comfort") {
    return "Komfort";
  }
  if (value === "eco") {
    return "Eco";
  }
  return "-";
}

function normalizePowerToWatts(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value) > 80 ? value : value * 1000;
  }
  const normalized = String(value ?? "").trim().toLowerCase().replace(",", ".");
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/-?\d+(\.\d+)?/);
  if (!match) {
    return null;
  }
  const numeric = Number(match[0]);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  if (normalized.includes("kw")) {
    return numeric * 1000;
  }
  if (normalized.includes("w")) {
    return numeric;
  }
  return Math.abs(numeric) > 80 ? numeric : numeric * 1000;
}

function formatPower(valueW: number | null) {
  if (valueW === null || !Number.isFinite(valueW)) {
    return "-";
  }
  const abs = Math.abs(valueW);
  if (abs < 1000) {
    return `${valueW.toFixed(0)} W`;
  }
  return `${(valueW / 1000).toFixed(2)} kW`;
}

function buildStatusText(input: {
  mode: HeatingMode;
  activeProgram: ProgramMode | null;
  outsideTemp: number | null;
  oneTimeChargeActive: boolean;
}) {
  const modeLabel =
    input.mode === "standby"
      ? "Standby"
      : input.mode === "dhw"
        ? "Nur Warmwasser"
        : "Heizen + Warmwasser";
  const parts = [modeLabel];

  if (input.activeProgram) {
    parts.push(`Programm ${formatProgramLabel(input.activeProgram)}`);
  }
  if (input.outsideTemp !== null) {
    parts.push(`Aussen ${formatTemperature(input.outsideTemp)}`);
  }
  if (input.oneTimeChargeActive) {
    parts.push("Einmalladung aktiv");
  }

  return parts.join(" | ");
}

function buildBlurredWidgetBackgroundStyle(imageName: string, blurPx: number): Record<string, string | number> {
  const encoded = encodeURIComponent(imageName);
  return {
    position: "absolute",
    top: "-12%",
    left: "-12%",
    right: "-12%",
    bottom: "-12%",
    backgroundImage: `url(/smarthome-dashboard/widget-assets/${encoded})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: `blur(${Math.max(0, blurPx)}px)`,
    transform: "scale(1.08)",
    pointerEvents: "none",
    zIndex: 0,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(157, 186, 231, 0.2)",
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
    position: "relative",
  },
  widgetBackground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  widgetBackgroundImage: {
    resizeMode: "cover",
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6, 11, 18, 0.48)",
    zIndex: 1,
  },
  header: {
    position: "relative",
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    flex: 1,
  },
  liveBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  liveBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  subtitle: {
    position: "relative",
    zIndex: 2,
    fontSize: 12,
    lineHeight: 17,
  },
  block: {
    position: "relative",
    zIndex: 2,
    gap: 6,
  },
  blockLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  modeRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 6,
    gap: 6,
  },
  modeButton: {
    borderRadius: 11,
    minHeight: 38,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 10,
    position: "relative",
    overflow: "hidden",
  },
  modeButtonActive: {
    borderColor: "rgba(173, 204, 246, 0.45)",
  },
  modeLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  blockHeaderInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  valueText: {
    fontSize: 15,
    fontWeight: "800",
  },
  sliderShell: {
    borderWidth: 1,
    borderRadius: 13,
    minHeight: 44,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepButton: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  stepLabel: {
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 18,
  },
  sliderWrap: {
    flex: 1,
    minWidth: 120,
  },
  sliderScaleRow: {
    marginTop: 2,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sliderScaleLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  quickActionRow: {
    position: "relative",
    zIndex: 2,
    flexDirection: "row",
    gap: 8,
  },
  actionChip: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.03)",
    overflow: "hidden",
  },
  actionChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  infoPanel: {
    position: "relative",
    zIndex: 2,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 4,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  infoValue: {
    fontSize: 11,
    fontWeight: "700",
    flexShrink: 1,
    textAlign: "right",
  },
  footer: {
    position: "relative",
    zIndex: 2,
    fontSize: 11,
    fontWeight: "700",
  },
  pressScale: {
    transform: [{ scale: 0.98 }],
  },
});

const webGradientLayerStyle: Record<string, string | number> = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  pointerEvents: "none",
  zIndex: 0,
};

const webSliderStyle: Record<string, string | number> = {
  width: "100%",
  margin: 0,
  height: 18,
  appearance: "none",
  backgroundColor: "rgba(255,255,255,0.08)",
  borderRadius: 999,
};
