import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, ImageBackground, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { IoBrokerClient } from "../../services/iobroker";
import { StateSnapshot, WallboxWidgetConfig } from "../../types/dashboard";
import { playConfiguredUiSound } from "../../utils/uiSounds";
import { palette } from "../../utils/theme";

type WallboxWidgetProps = {
  config: WallboxWidgetConfig;
  client: IoBrokerClient;
};

type WallboxMode = "off" | "pv" | "grid";

const DEFAULT_REFRESH_MS = 2000;
const MIN_REFRESH_MS = 500;
const AMPERE_MIN = 6;
const AMPERE_MAX = 16;
const AMPERE_STEP = 1;
const DEFAULT_GRID_AMPERE = 10;
const PHASE_VOLTAGE_V = 230;
const CHARGING_ACTIVE_THRESHOLD_W = 100;
const FAST_CHARGING_THRESHOLD_W = 5000;
const CHARGING_INDICATOR_BLINK_MS = 720;
const CHARGING_BAR_MAX_POWER_W = 11000;
const CHARGING_BAR_GLOW_CYCLE_MS = 2000;
const AMPERE_PRESET_VALUES = [6, 10, 12, 14, 16] as const;

const DEFAULT_IDS = {
  mode: "0_userdata.0.goe.mode",
  gridAmpere: "0_userdata.0.goe.gridAmpere",
  limit80: "0_userdata.0.goe.limit80",
  phaseSwitchMode: "go-e.0.phaseSwitchMode",
  ampere: "go-e.0.ampere",
  car: "go-e.0.car",
  batterySoc: "go-e.0.carBatterySoc",
  chargePower: "go-e.0.nrg.11",
  chargedEnergy: "go-e.0.eto",
  stopAt80: "go-e.0.stopChargeingAtCarSoc80",
} as const;

export function WallboxWidget({ config, client }: WallboxWidgetProps) {
  const stateIds = useMemo(
    () => ({
      mode: resolveStateId(config.modeStateId, DEFAULT_IDS.mode),
      gridAmpere: resolveStateId(config.gridAmpereStateId, DEFAULT_IDS.gridAmpere),
      limit80: resolveStateId(config.limit80StateId, DEFAULT_IDS.limit80),
      phaseSwitchMode: resolveStateId(config.phaseSwitchModeStateId, DEFAULT_IDS.phaseSwitchMode),
      ampere: resolveStateId(config.ampereStateId, DEFAULT_IDS.ampere),
      car: resolveStateId(config.carStateId, DEFAULT_IDS.car),
      batterySoc: resolveStateId(config.batterySocStateId, DEFAULT_IDS.batterySoc),
      chargePower: resolveStateId(config.chargePowerStateId, DEFAULT_IDS.chargePower),
      chargedEnergy: resolveStateId(config.chargedEnergyStateId, DEFAULT_IDS.chargedEnergy),
      stopAt80: resolveStateId(config.stopChargeingAtCarSoc80StateId, DEFAULT_IDS.stopAt80),
    }),
    [
      config.ampereStateId,
      config.carStateId,
      config.chargePowerStateId,
      config.chargedEnergyStateId,
      config.gridAmpereStateId,
      config.limit80StateId,
      config.modeStateId,
      config.phaseSwitchModeStateId,
      config.batterySocStateId,
      config.stopChargeingAtCarSoc80StateId,
    ]
  );
  const [stateSnapshot, setStateSnapshot] = useState<StateSnapshot>({});
  const [pendingWrites, setPendingWrites] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [sliderDraft, setSliderDraft] = useState<number | null>(null);
  const [chargingPulseOn, setChargingPulseOn] = useState(true);
  const [powerBarTrackWidth, setPowerBarTrackWidth] = useState(0);
  const barGlowAnim = useRef(new Animated.Value(0)).current;
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
          setError(syncError instanceof Error ? syncError.message : "Wallbox-States konnten nicht geladen werden");
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

  const mode = normalizeMode(readValue(stateIds.mode)) || "off";
  const isGridMode = mode === "grid";
  const gridAmpere = clampAmpere(normalizeAmpere(readValue(stateIds.gridAmpere)) ?? DEFAULT_GRID_AMPERE);
  const limit80Explicit = normalizeBoolean(readValue(stateIds.limit80));
  const stopAt80ByCharger = normalizeBoolean(readValue(stateIds.stopAt80));
  const limit80Enabled = limit80Explicit ?? stopAt80ByCharger ?? false;
  const phaseModeRaw = readValue(stateIds.phaseSwitchMode);
  const phaseMode = mapPhaseMode(phaseModeRaw);
  const currentPhaseSelection = resolvePhaseControlSelection(phaseModeRaw);
  const liveAmpere = normalizeFloat(readValue(stateIds.ampere));
  const carCode = normalizeInteger(readValue(stateIds.car));
  const batterySoc = normalizeFloat(readValue(stateIds.batterySoc));
  const chargedEnergyKWh = normalizeEnergyToKWh(readValue(stateIds.chargedEnergy));
  const directChargingPowerW = normalizePowerToWatts(readValue(stateIds.chargePower));
  const estimatedChargingPowerW = estimateChargingPowerW(liveAmpere, phaseModeRaw);
  const chargingPowerW = directChargingPowerW ?? estimatedChargingPowerW;
  const liveCharging =
    carCode === 2 ||
    (carCode === null && typeof liveAmpere === "number" && liveAmpere > 0.25) ||
    chargingPowerW >= CHARGING_ACTIVE_THRESHOLD_W;
  const chargeCompleted = carCode === 4 && !liveCharging;
  const writePending = Object.values(pendingWrites).some(Boolean);
  const sliderValue = sliderDraft ?? gridAmpere;
  const showGridAmpereControl = config.showGridAmpereControl !== false;
  const chargePowerCardMode: "idle" | "slow" | "fast" =
    chargingPowerW < CHARGING_ACTIVE_THRESHOLD_W
      ? "idle"
      : chargingPowerW < FAST_CHARGING_THRESHOLD_W
        ? "slow"
        : "fast";

  useEffect(() => {
    if (!liveCharging) {
      setChargingPulseOn(true);
      return;
    }
    const timer = setInterval(() => {
      setChargingPulseOn((current) => !current);
    }, CHARGING_INDICATOR_BLINK_MS);
    return () => clearInterval(timer);
  }, [liveCharging]);

  useEffect(() => {
    if (!pendingWrites[stateIds.gridAmpere]) {
      setSliderDraft(null);
    }
  }, [gridAmpere, pendingWrites, stateIds.gridAmpere]);

  useEffect(() => {
    barGlowAnim.setValue(0);
    const glowLoop = Animated.loop(
      Animated.timing(barGlowAnim, {
        toValue: 1,
        duration: CHARGING_BAR_GLOW_CYCLE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    glowLoop.start();
    return () => {
      glowLoop.stop();
    };
  }, [barGlowAnim]);

  const titleText = (config.title || "Wallbox").trim() || "Wallbox";
  const subtitleText = useMemo(
    () =>
      buildStatusSubtitle({
        mode,
        carCode,
        liveAmpere,
        limit80Enabled,
      }),
    [carCode, limit80Enabled, liveAmpere, mode]
  );

  const textColor = config.appearance?.textColor || "#f5f8ff";
  const mutedTextColor = config.appearance?.mutedTextColor || "rgba(214, 224, 244, 0.75)";
  const cardStart = config.appearance?.widgetColor || "rgba(20, 30, 44, 0.96)";
  const cardEnd = config.appearance?.widgetColor2 || "rgba(12, 18, 30, 0.98)";
  const offStart = config.appearance?.cardColor || "rgba(166, 176, 194, 0.2)";
  const offEnd = config.appearance?.cardColor2 || "rgba(123, 135, 158, 0.2)";
  const pvStart = config.appearance?.activeWidgetColor || "#3bbd83";
  const pvEnd = config.appearance?.activeWidgetColor2 || "#2f976c";
  const gridStart = config.appearance?.statColor || "#5f9eff";
  const gridEnd = config.appearance?.statColor2 || "#4578e6";
  const sliderStart = config.appearance?.iconColor || "#7eb9ff";
  const sliderEnd = config.appearance?.iconColor2 || "#5f8cf0";
  const toggleStart = config.appearance?.inactiveWidgetColor || "#f5bd6c";
  const toggleEnd = config.appearance?.inactiveWidgetColor2 || "#e69b56";
  const panelBorderColor = "rgba(191, 209, 245, 0.18)";
  const modePanelBackground = "rgba(255,255,255,0.025)";
  const disabledOpacity = 0.46;
  const backgroundBlur = Math.min(24, clampInt(config.backgroundImageBlur, 8, 0));

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
    (nextMode: WallboxMode) => {
      if (nextMode === mode) {
        return;
      }
      playPressSound(`mode:${nextMode}`);
      void writeState(stateIds.mode, nextMode, `mode:${nextMode}`);
    },
    [mode, playPressSound, stateIds.mode, writeState]
  );

  const setGridAmpere = useCallback(
    (nextAmpere: number, source: "slider" | "button") => {
      if (!isGridMode || !stateIds.gridAmpere) {
        return;
      }
      const clamped = clampAmpere(nextAmpere);
      if (clamped === gridAmpere) {
        return;
      }
      if (source === "button") {
        playPressSound(`gridAmpere:${clamped}`);
      } else {
        playSliderSound(`gridAmpere:${clamped}`);
      }
      void writeState(stateIds.gridAmpere, clamped, `gridAmpere:${clamped}`);
    },
    [gridAmpere, isGridMode, playPressSound, playSliderSound, stateIds.gridAmpere, writeState]
  );

  const adjustGridAmpere = useCallback(
    (delta: number) => {
      if (!isGridMode) {
        return;
      }
      setGridAmpere(gridAmpere + delta, "button");
    },
    [gridAmpere, isGridMode, setGridAmpere]
  );

  const toggleLimit80 = useCallback(() => {
    playPressSound("limit80");
    void writeState(stateIds.limit80, !limit80Enabled, `limit80:${!limit80Enabled ? "on" : "off"}`);
  }, [limit80Enabled, playPressSound, stateIds.limit80, writeState]);
  const setPhaseMode = useCallback(
    (phaseCount: 1 | 3) => {
      if (!isGridMode || !stateIds.phaseSwitchMode) {
        return;
      }
      if (currentPhaseSelection === phaseCount) {
        return;
      }
      playPressSound(`phase:${phaseCount}`);
      void writeState(stateIds.phaseSwitchMode, phaseCount === 1 ? 1 : 2, `phase:${phaseCount}`);
    },
    [currentPhaseSelection, isGridMode, playPressSound, stateIds.phaseSwitchMode, writeState]
  );

  const chargingStatusText = liveCharging
    ? `Laedt mit ${formatPowerKW(chargingPowerW)}`
    : chargeCompleted
      ? "Ladevorgang abgeschlossen"
      : "Kein aktiver Ladevorgang";
  const chargingIndicatorColor = liveCharging
    ? chargingPulseOn
      ? "#f8c24b"
      : "rgba(248, 194, 75, 0.28)"
    : chargeCompleted
      ? "#35d19a"
      : "rgba(197, 209, 231, 0.35)";
  const chargePowerCardAccent =
    chargePowerCardMode === "fast"
      ? "rgba(59, 203, 141, 0.95)"
      : chargePowerCardMode === "slow"
        ? "rgba(245, 198, 104, 0.96)"
        : "rgba(238, 97, 111, 0.92)";
  const chargePowerCardBackground =
    chargePowerCardMode === "idle"
      ? "rgba(224, 83, 96, 0.08)"
      : chargingPulseOn
        ? chargePowerCardMode === "fast"
          ? "rgba(53, 198, 137, 0.22)"
          : "rgba(245, 198, 104, 0.2)"
        : chargePowerCardMode === "fast"
          ? "rgba(53, 198, 137, 0.12)"
          : "rgba(245, 198, 104, 0.1)";
  const footerStatusText = error ? error : writePending ? "Synchronisiere..." : "";
  const normalizedChargingPowerW = Math.max(0, Math.min(CHARGING_BAR_MAX_POWER_W, chargingPowerW));
  const chargingPowerRatio = normalizedChargingPowerW / CHARGING_BAR_MAX_POWER_W;
  const chargingPowerPercent = chargingPowerRatio * 100;
  const chargingPowerFillWidth = `${Number(chargingPowerPercent.toFixed(2))}%` as `${number}%`;
  const webPowerBarGradientWidth = powerBarTrackWidth > 0 ? powerBarTrackWidth : "100%";
  const barFillWidthPx = powerBarTrackWidth * chargingPowerRatio;
  const barGlowWidthPx = Math.max(32, Math.min(74, barFillWidthPx * 0.42));
  const barGlowTranslateX = barGlowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-barGlowWidthPx, Math.max(0, barFillWidthPx)],
  });
  const nativeBarColor = chargingPowerRatio < 0.45 ? "#ef5d6b" : chargingPowerRatio < 0.75 ? "#f0c35f" : "#42cf8c";
  const roundedLiveAmpere = liveAmpere === null ? null : Math.round(liveAmpere);
  const phaseStatusLabel =
    currentPhaseSelection === 1 ? "1-phasig" : currentPhaseSelection === 3 ? "3-phasig" : phaseMode;
  const activeAmperePreset = useMemo(() => {
    if (roundedLiveAmpere === null || !Number.isFinite(roundedLiveAmpere)) {
      return Math.round(sliderValue);
    }
    return AMPERE_PRESET_VALUES.reduce((closest, value) =>
      Math.abs(value - roundedLiveAmpere) < Math.abs(closest - roundedLiveAmpere) ? value : closest
    );
  }, [roundedLiveAmpere, sliderValue]);

  const modeItems: Array<{
    mode: WallboxMode;
    label: string;
    start: string;
    end: string;
  }> = [
    { mode: "off", label: "Aus", start: offStart, end: offEnd },
    { mode: "pv", label: "PV", start: pvStart, end: pvEnd },
    { mode: "grid", label: "Netz", start: gridStart, end: gridEnd },
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
              <View style={styles.widgetBackgroundOverlay} />
            </>
          ) : (
            <ImageBackground
              blurRadius={backgroundBlur}
              imageStyle={styles.widgetBackgroundImage}
              source={{ uri: `/smarthome-dashboard/widget-assets/${encodeURIComponent(config.backgroundImage)}` }}
              style={styles.widgetBackground}
            >
              <View style={styles.widgetBackgroundOverlay} />
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
              {titleText}
            </Text>
          ) : null}
        </View>

        <View style={[styles.chargeStatusStrip, { borderColor: panelBorderColor, backgroundColor: modePanelBackground }]}>
          <View style={[styles.chargeStatusDot, { backgroundColor: chargingIndicatorColor }]} />
          <Text numberOfLines={1} style={[styles.chargeStatusText, { color: textColor }]}>
            {chargingStatusText}
          </Text>
        </View>

        <View style={styles.block}>
          <Text style={[styles.blockLabel, { color: mutedTextColor }]}>Betriebsart</Text>
          <View style={[styles.segmentShell, { backgroundColor: modePanelBackground, borderColor: panelBorderColor }]}>
            {modeItems.map((item) => {
              const active = mode === item.mode;
              return (
                <Pressable
                  key={`mode-${item.mode}`}
                  onPress={() => setMode(item.mode)}
                  style={({ pressed }) => [
                    styles.segmentButton,
                    active ? styles.segmentButtonActive : null,
                    pressed ? styles.pressScale : null,
                  ]}
                >
                  {active
                    ? Platform.OS === "web"
                      ? createElement("div", {
                          style: {
                            ...webGradientLayerStyle,
                            borderRadius: 10,
                            background: `linear-gradient(135deg, ${item.start}, ${item.end})`,
                          },
                        })
                      : (
                          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: item.start, borderRadius: 10 }]} />
                        )
                    : null}
                  <Text style={[styles.segmentLabel, { color: active ? "#06101a" : textColor }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {showGridAmpereControl ? (
          <View style={[styles.block, !isGridMode ? { opacity: disabledOpacity } : null]}>
            <View style={styles.blockHeaderInline}>
              <Text style={[styles.blockLabel, { color: mutedTextColor }]}>Netzladen-Strom</Text>
              <Text style={[styles.ampereValue, { color: textColor }]}>{Math.round(sliderValue)} A</Text>
            </View>
            <View style={[styles.ampereControls, { borderColor: panelBorderColor, backgroundColor: modePanelBackground }]}>
              <Pressable
                disabled={!isGridMode}
                onPress={() => adjustGridAmpere(-AMPERE_STEP)}
                style={({ pressed }) => [styles.stepButton, pressed ? styles.pressScale : null, !isGridMode ? styles.disabledControl : null]}
              >
                <Text style={[styles.stepButtonLabel, { color: textColor }]}>-</Text>
              </Pressable>

              <View style={styles.sliderWrap}>
                {Platform.OS === "web"
                  ? createElement("input", {
                      type: "range",
                      min: AMPERE_MIN,
                      max: AMPERE_MAX,
                      step: AMPERE_STEP,
                      disabled: !isGridMode,
                      value: sliderValue,
                      onInput: (event: { target: { value: string } }) => {
                        setSliderDraft(clampAmpere(Number.parseInt(event.target.value, 10) || DEFAULT_GRID_AMPERE));
                      },
                      onChange: (event: { target: { value: string } }) => {
                        const next = clampAmpere(Number.parseInt(event.target.value, 10) || DEFAULT_GRID_AMPERE);
                        setSliderDraft(next);
                        void setGridAmpere(next, "slider");
                      },
                      style: {
                        ...webSliderStyle,
                        opacity: isGridMode ? 1 : 0.45,
                        accentColor: sliderStart,
                        backgroundImage: `linear-gradient(90deg, ${sliderStart} 0%, ${sliderEnd} 100%)`,
                      },
                    })
                  : (
                      <View style={[styles.nativeTickRow, !isGridMode ? styles.disabledControl : null]}>
                        {Array.from({ length: AMPERE_MAX - AMPERE_MIN + 1 }, (_, index) => {
                          const value = AMPERE_MIN + index;
                          const active = value <= sliderValue;
                          return (
                            <Pressable
                              key={`amp-tick-${value}`}
                              disabled={!isGridMode}
                              onPress={() => {
                                setSliderDraft(value);
                                void setGridAmpere(value, "slider");
                              }}
                              style={({ pressed }) => [styles.nativeTickButton, pressed ? styles.pressScale : null]}
                            >
                              <View
                                style={[
                                  styles.nativeTickBar,
                                  {
                                    backgroundColor: active ? sliderStart : "rgba(255,255,255,0.16)",
                                  },
                                ]}
                              />
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                <View style={styles.sliderScaleRow}>
                  <Text style={[styles.sliderScaleLabel, { color: mutedTextColor }]}>{AMPERE_MIN} A</Text>
                  <Text style={[styles.sliderScaleLabel, { color: mutedTextColor }]}>{AMPERE_MAX} A</Text>
                </View>
              </View>

              <Pressable
                disabled={!isGridMode}
                onPress={() => adjustGridAmpere(AMPERE_STEP)}
                style={({ pressed }) => [styles.stepButton, pressed ? styles.pressScale : null, !isGridMode ? styles.disabledControl : null]}
              >
                <Text style={[styles.stepButtonLabel, { color: textColor }]}>+</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={[styles.block, styles.toggleBlock, { borderColor: panelBorderColor, backgroundColor: modePanelBackground }]}>
          <View style={styles.toggleTextWrap}>
            <Text style={[styles.toggleTitle, { color: textColor }]}>Begrenzen auf 80 %</Text>
            <Text style={[styles.toggleHint, { color: mutedTextColor }]}>
              Stoppt den Ladevorgang bei 80 % Fahrzeug-SoC
            </Text>
          </View>
          <Pressable
            onPress={toggleLimit80}
            style={({ pressed }) => [
              styles.toggleTrack,
              limit80Enabled ? styles.toggleTrackActive : styles.toggleTrackInactive,
              pressed ? styles.pressScale : null,
            ]}
          >
            {limit80Enabled
              ? Platform.OS === "web"
                ? createElement("div", {
                    style: {
                      ...webGradientLayerStyle,
                      borderRadius: 999,
                      background: `linear-gradient(120deg, ${toggleStart}, ${toggleEnd})`,
                    },
                  })
                : (
                    <View style={[StyleSheet.absoluteFillObject, { borderRadius: 999, backgroundColor: toggleStart }]} />
                  )
              : null}
            <View
              style={[
                styles.toggleKnob,
                limit80Enabled ? styles.toggleKnobActive : styles.toggleKnobInactive,
              ]}
            />
          </Pressable>
        </View>

        <View style={[styles.quickControlPanel, { borderColor: panelBorderColor, backgroundColor: modePanelBackground }]}>
          <View style={styles.quickControlGroup}>
            <View style={styles.quickControlHeader}>
              <Text numberOfLines={1} style={[styles.quickControlLabel, { color: mutedTextColor }]}>
                Wallbox-Strom (Ist)
              </Text>
              <Text numberOfLines={1} style={[styles.quickControlValue, { color: textColor }]}>
                {roundedLiveAmpere === null ? "-" : `${roundedLiveAmpere} A`}
              </Text>
            </View>
            <View style={styles.quickButtonRow}>
              {AMPERE_PRESET_VALUES.map((value) => {
                const active = activeAmperePreset === value;
                return (
                  <Pressable
                    key={`amp-preset-${value}`}
                    disabled={!isGridMode}
                    onPress={() => setGridAmpere(value, "button")}
                    style={({ pressed }) => [
                      styles.quickSelectButton,
                      active ? styles.quickSelectButtonActive : null,
                      !isGridMode ? styles.quickSelectButtonDisabled : null,
                      pressed ? styles.pressScale : null,
                    ]}
                  >
                    {active
                      ? Platform.OS === "web"
                        ? createElement("div", {
                            style: {
                              ...webGradientLayerStyle,
                              borderRadius: 10,
                              background: `linear-gradient(135deg, ${gridStart}, ${gridEnd})`,
                            },
                          })
                        : (
                            <View
                              style={[StyleSheet.absoluteFillObject, { borderRadius: 10, backgroundColor: gridStart }]}
                            />
                          )
                      : null}
                    <Text style={[styles.quickSelectLabel, { color: active ? "#06101a" : textColor }]}>{value} A</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.quickControlGroup}>
            <View style={styles.quickControlHeader}>
              <Text numberOfLines={1} style={[styles.quickControlLabel, { color: mutedTextColor }]}>
                Phasenmodus (Ist)
              </Text>
              <Text numberOfLines={1} style={[styles.quickControlValue, { color: textColor }]}>
                {phaseStatusLabel}
              </Text>
            </View>
            <View style={styles.quickButtonRow}>
              {(
                [
                  { phaseCount: 1 as const, label: "1-phasig" },
                  { phaseCount: 3 as const, label: "3-phasig" },
                ] as const
              ).map((item) => {
                const active = currentPhaseSelection === item.phaseCount;
                return (
                  <Pressable
                    key={`phase-mode-${item.phaseCount}`}
                    disabled={!isGridMode}
                    onPress={() => setPhaseMode(item.phaseCount)}
                    style={({ pressed }) => [
                      styles.quickSelectButton,
                      styles.quickSelectButtonWide,
                      active ? styles.quickSelectButtonActive : null,
                      !isGridMode ? styles.quickSelectButtonDisabled : null,
                      pressed ? styles.pressScale : null,
                    ]}
                  >
                    {active
                      ? Platform.OS === "web"
                        ? createElement("div", {
                            style: {
                              ...webGradientLayerStyle,
                              borderRadius: 10,
                              background: `linear-gradient(135deg, ${gridStart}, ${gridEnd})`,
                            },
                          })
                        : (
                            <View
                              style={[StyleSheet.absoluteFillObject, { borderRadius: 10, backgroundColor: gridStart }]}
                            />
                          )
                      : null}
                    <Text style={[styles.quickSelectLabel, { color: active ? "#06101a" : textColor }]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {!isGridMode ? (
            <Text numberOfLines={1} style={[styles.quickControlHint, { color: mutedTextColor }]}>
              Manuelle Auswahl nur im Netz-Modus
            </Text>
          ) : null}
        </View>

        {config.showStatusSubtitle === true ? (
          <Text numberOfLines={2} style={[styles.subtitleBottom, { color: mutedTextColor }]}>
            {subtitleText}
          </Text>
        ) : null}

        <View style={styles.metricsRow}>
          <View
            style={[
              styles.metricCard,
              styles.metricCardPower,
              {
                borderColor: chargePowerCardAccent,
                backgroundColor: chargePowerCardBackground,
              },
            ]}
          >
            <Text numberOfLines={1} style={[styles.metricLabel, { color: mutedTextColor }]}>
              Laden jetzt
            </Text>
            <Text numberOfLines={1} style={[styles.metricValue, { color: textColor }]}>
              {formatPowerKW(chargingPowerW)}
            </Text>
          </View>
          <View style={[styles.metricCard, { borderColor: panelBorderColor, backgroundColor: modePanelBackground }]}>
            <Text numberOfLines={1} style={[styles.metricLabel, { color: mutedTextColor }]}>
              Gesamt geladen
            </Text>
            <Text numberOfLines={1} style={[styles.metricValue, { color: textColor }]}>
              {formatEnergyKWh(chargedEnergyKWh)}
            </Text>
          </View>
          <View style={[styles.metricCard, { borderColor: panelBorderColor, backgroundColor: modePanelBackground }]}>
            <Text numberOfLines={1} style={[styles.metricLabel, { color: mutedTextColor }]}>
              Auto SoC
            </Text>
            <Text numberOfLines={1} style={[styles.metricValue, { color: textColor }]}>
              {formatPercent(batterySoc)}
            </Text>
          </View>
        </View>

        <View style={styles.powerBarBlock}>
          <View style={styles.powerBarHeader}>
            <Text numberOfLines={1} style={[styles.powerBarLabel, { color: mutedTextColor }]}>
              Ladeleistung 0-11 kW
            </Text>
            <Text numberOfLines={1} style={[styles.powerBarValue, { color: textColor }]}>
              {formatPowerKW(chargingPowerW)}
            </Text>
          </View>
          <View
            onLayout={(event) => {
              const nextWidth = Math.max(0, Math.round(event.nativeEvent.layout.width));
              setPowerBarTrackWidth((current) => (current === nextWidth ? current : nextWidth));
            }}
            style={styles.powerBarTrack}
          >
            <View style={[styles.powerBarFillClip, { width: chargingPowerFillWidth }]}>
              {Platform.OS === "web"
                ? createElement("div", {
                    style: {
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: 0,
                      width: webPowerBarGradientWidth,
                      zIndex: 1,
                      pointerEvents: "none",
                      borderRadius: 999,
                      background: "linear-gradient(90deg, #ef4f62 0%, #f3c35d 52%, #35cf84 100%)",
                    },
                  })
                : (
                    <View
                      style={[
                        StyleSheet.absoluteFillObject,
                        {
                          borderRadius: 999,
                          backgroundColor: nativeBarColor,
                        },
                      ]}
                    />
                  )}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.powerBarGlow,
                  {
                    width: barGlowWidthPx,
                    transform: [{ translateX: barGlowTranslateX }],
                    opacity: chargingPowerRatio > 0.01 ? 1 : 0,
                  },
                ]}
              />
            </View>
          </View>
          <View style={styles.powerBarScaleRow}>
            <Text style={[styles.powerBarScaleLabel, { color: mutedTextColor }]}>0 kW</Text>
            <Text style={[styles.powerBarScaleLabel, { color: mutedTextColor }]}>11 kW</Text>
          </View>
        </View>

        {footerStatusText ? (
          <Text
            numberOfLines={1}
            style={[
              styles.footer,
              {
                color: error ? palette.danger : mutedTextColor,
              },
            ]}
          >
            {footerStatusText}
          </Text>
        ) : null}
      </View>
    </View>
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

function clampInt(value: number | undefined, fallback: number, min: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.round(value));
}

function clampAmpere(value: number) {
  return Math.max(AMPERE_MIN, Math.min(AMPERE_MAX, Math.round(value)));
}

function normalizeMode(value: unknown): WallboxMode | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "off" || normalized === "pv" || normalized === "grid") {
    return normalized;
  }
  return null;
}

function normalizeAmpere(value: unknown) {
  const numeric = normalizeFloat(value);
  if (numeric === null) {
    return null;
  }
  return clampAmpere(numeric);
}

function normalizePowerToWatts(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value) > 80 ? value : value * 1000;
  }

  const normalized = String(value).trim().toLowerCase().replace(",", ".");
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

function normalizeEnergyToKWh(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value) > 100 ? value / 1000 : value;
  }

  const normalized = String(value).trim().toLowerCase().replace(",", ".");
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

  if (normalized.includes("mwh")) {
    return numeric * 1000;
  }
  if (normalized.includes("kwh")) {
    return numeric;
  }
  if (normalized.includes("wh")) {
    return numeric / 1000;
  }

  return Math.abs(numeric) > 100 ? numeric / 1000 : numeric;
}

function normalizeFloat(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const numeric = Number.parseFloat(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
}

function normalizeInteger(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === 1) {
    return true;
  }
  if (value === 0) {
    return false;
  }
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return null;
  }
  if (["true", "1", "on", "yes", "ja", "enabled"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "off", "no", "nein", "disabled"].includes(normalized)) {
    return false;
  }
  return null;
}

function mapPhaseMode(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return "-";
  }
  if (
    normalized === "0" ||
    normalized === "auto" ||
    normalized === "automatic" ||
    normalized === "automatisch"
  ) {
    return "Automatisch";
  }
  if (
    normalized === "1" ||
    normalized === "1p" ||
    normalized === "single" ||
    normalized === "force_1_phase" ||
    normalized === "force_1" ||
    normalized === "single_phase" ||
    normalized === "one_phase"
  ) {
    return "1 Phase";
  }
  if (
    normalized === "2" ||
    normalized === "3" ||
    normalized === "3p" ||
    normalized === "force_3_phase" ||
    normalized === "force_3" ||
    normalized === "three" ||
    normalized === "three_phase"
  ) {
    return "3 Phasen";
  }
  return normalized;
}

function resolvePhaseControlSelection(raw: unknown): 1 | 3 | null {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return null;
  }
  if (
    normalized === "1" ||
    normalized === "1p" ||
    normalized === "single" ||
    normalized === "force_1_phase" ||
    normalized === "force_1" ||
    normalized === "single_phase" ||
    normalized === "one_phase"
  ) {
    return 1;
  }
  if (
    normalized === "2" ||
    normalized === "3" ||
    normalized === "3p" ||
    normalized === "force_3_phase" ||
    normalized === "force_3" ||
    normalized === "three" ||
    normalized === "three_phase"
  ) {
    return 3;
  }
  return null;
}

function resolvePhaseCount(raw: unknown) {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (
    normalized === "1" ||
    normalized === "1p" ||
    normalized === "single" ||
    normalized === "force_1_phase" ||
    normalized === "force_1" ||
    normalized === "single_phase" ||
    normalized === "one_phase"
  ) {
    return 1;
  }
  if (
    normalized === "2" ||
    normalized === "3" ||
    normalized === "3p" ||
    normalized === "force_3_phase" ||
    normalized === "force_3" ||
    normalized === "three" ||
    normalized === "three_phase"
  ) {
    return 3;
  }
  return 1;
}

function estimateChargingPowerW(liveAmpere: number | null, phaseModeRaw: unknown) {
  if (liveAmpere === null || !Number.isFinite(liveAmpere) || liveAmpere <= 0) {
    return 0;
  }
  const phaseCount = resolvePhaseCount(phaseModeRaw);
  const estimated = liveAmpere * PHASE_VOLTAGE_V * phaseCount;
  if (!Number.isFinite(estimated) || estimated < 0) {
    return 0;
  }
  return estimated;
}

function formatPowerKW(powerW: number) {
  if (!Number.isFinite(powerW) || powerW <= 0) {
    return "0.00 kW";
  }
  return `${(powerW / 1000).toFixed(2)} kW`;
}

function formatEnergyKWh(energyKWh: number | null) {
  if (energyKWh === null || !Number.isFinite(energyKWh) || energyKWh < 0) {
    return "-";
  }
  if (energyKWh >= 1000) {
    return `${(energyKWh / 1000).toFixed(2)} MWh`;
  }
  return `${energyKWh.toFixed(1)} kWh`;
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }
  const normalized = Math.max(0, Math.min(100, value));
  return `${Math.round(normalized)} %`;
}

function modeStatusLabel(mode: WallboxMode) {
  if (mode === "pv") {
    return "PV-Ueberschussladen aktiv";
  }
  if (mode === "grid") {
    return "Netzladen aktiv";
  }
  return "Laden deaktiviert";
}

function buildStatusSubtitle({
  mode,
  carCode,
  liveAmpere,
  limit80Enabled,
}: {
  mode: WallboxMode;
  carCode: number | null;
  liveAmpere: number | null;
  limit80Enabled: boolean;
}) {
  const parts: string[] = [];
  const hasCarSignal = carCode !== null;
  const liveCharging = carCode === 2 || (!hasCarSignal && typeof liveAmpere === "number" && liveAmpere > 0.25);
  if (liveCharging) {
    parts.push("Fahrzeug laedt");
  } else if (carCode === 4) {
    parts.push("Fahrzeug verbunden");
  } else if (carCode === 3) {
    parts.push("Warte auf Fahrzeug");
  } else if (carCode === 1) {
    parts.push("Fahrzeug bereit");
  }
  parts.push(modeStatusLabel(mode));
  if (limit80Enabled) {
    parts.push("80%-Begrenzung aktiv");
  }
  return parts.join(" | ");
}

function buildBlurredWidgetBackgroundStyle(imageName: string, blur: number) {
  return {
    ...webBackgroundLayerStyle,
    backgroundImage: `url("/smarthome-dashboard/widget-assets/${encodeURIComponent(imageName)}")`,
    filter: `blur(${blur}px)`,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  card: {
    flex: 1,
    minHeight: 0,
    borderRadius: 0,
    borderWidth: 0,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 11,
    position: "relative",
  },
  widgetBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  widgetBackgroundImage: {
    resizeMode: "cover",
  },
  widgetBackgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 10, 18, 0.36)",
  },
  header: {
    gap: 3,
  },
  chargeStatusStrip: {
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chargeStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  chargeStatusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  subtitleBottom: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  metricCard: {
    flex: 1,
    minHeight: 70,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 8,
    justifyContent: "space-between",
    gap: 4,
  },
  metricCardPower: {
    borderWidth: 1.2,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
  },
  powerBarBlock: {
    gap: 6,
    marginTop: 1,
  },
  powerBarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  powerBarLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  powerBarValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  powerBarTrack: {
    height: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(191, 209, 245, 0.24)",
    backgroundColor: "rgba(20, 27, 38, 0.72)",
    overflow: "hidden",
  },
  powerBarFillClip: {
    height: "100%",
    minWidth: 0,
    borderRadius: 999,
    overflow: "hidden",
    position: "relative",
  },
  powerBarGlow: {
    position: "absolute",
    left: 0,
    top: -5,
    bottom: -5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.5)",
    shadowColor: "#fff",
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  powerBarScaleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  powerBarScaleLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  block: {
    gap: 7,
  },
  blockHeaderInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  blockLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  ampereValue: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  segmentShell: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    flexDirection: "row",
    gap: 6,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 10,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.01)",
    overflow: "hidden",
  },
  segmentButtonActive: {
    borderColor: "transparent",
  },
  segmentLabel: {
    fontSize: 15,
    fontWeight: "800",
    zIndex: 2,
  },
  ampereControls: {
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  stepButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.035)",
  },
  stepButtonLabel: {
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: -1,
  },
  sliderWrap: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    gap: 2,
  },
  nativeTickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 24,
  },
  nativeTickButton: {
    flex: 1,
    minHeight: 22,
    justifyContent: "center",
  },
  nativeTickBar: {
    height: 6,
    borderRadius: 999,
  },
  sliderScaleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sliderScaleLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  toggleBlock: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  toggleTextWrap: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  toggleHint: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
  },
  toggleTrack: {
    width: 54,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
    justifyContent: "center",
    position: "relative",
  },
  toggleTrackActive: {
    borderColor: "transparent",
    backgroundColor: "rgba(252, 204, 124, 0.2)",
  },
  toggleTrackInactive: {
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 2,
    zIndex: 2,
  },
  toggleKnobActive: {
    alignSelf: "flex-end",
    borderColor: "rgba(77, 48, 15, 0.35)",
    backgroundColor: "#fff6e8",
  },
  toggleKnobInactive: {
    alignSelf: "flex-start",
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(232, 238, 251, 0.9)",
  },
  quickControlPanel: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  quickControlGroup: {
    gap: 6,
  },
  quickControlHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
  },
  quickControlLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  quickControlValue: {
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
    maxWidth: "46%",
  },
  quickButtonRow: {
    flexDirection: "row",
    gap: 6,
  },
  quickSelectButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.02)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  quickSelectButtonWide: {
    minHeight: 38,
  },
  quickSelectButtonActive: {
    borderColor: "transparent",
  },
  quickSelectButtonDisabled: {
    opacity: 0.45,
  },
  quickSelectLabel: {
    fontSize: 13,
    fontWeight: "800",
    zIndex: 2,
  },
  quickControlHint: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "right",
  },
  footer: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  disabledControl: {
    opacity: 0.5,
  },
  pressScale: {
    transform: [{ scale: 0.97 }],
  },
});

const webGradientLayerStyle = {
  position: "absolute",
  inset: 0,
  zIndex: 1,
  pointerEvents: "none",
} as const;

const webBackgroundLayerStyle = {
  position: "absolute",
  inset: "-14px",
  zIndex: 0,
  pointerEvents: "none",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "cover",
  transform: "scale(1.04)",
} as const;

const webSliderStyle = {
  width: "100%",
  margin: 0,
  background: "transparent",
  cursor: "pointer",
} as const;
