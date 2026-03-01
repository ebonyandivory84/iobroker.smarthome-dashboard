import { MaterialCommunityIcons } from "@expo/vector-icons";
import { createElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, ImageBackground, LayoutChangeEvent, Platform, StyleSheet, Text, View } from "react-native";
import { SolarLayoutConfig, SolarNodeLayout, SolarWidgetConfig, StateSnapshot, ThemeSettings } from "../../types/dashboard";
import { resolveThemeSettings } from "../../utils/themeConfig";
import { palette } from "../../utils/theme";

type SolarWidgetProps = {
  config: SolarWidgetConfig;
  states: StateSnapshot;
  theme?: ThemeSettings;
};

type FlowDir = "toHome" | "fromHome" | "idle";

export function SolarWidget({ config, states, theme }: SolarWidgetProps) {
  const resolvedTheme = resolveThemeSettings(theme);
  const widgetAppearance = config.appearance;
  const textColor = widgetAppearance?.textColor || palette.text;
  const mutedTextColor = widgetAppearance?.mutedTextColor || palette.textMuted;
  const getValue = (snapshot: StateSnapshot, key?: string) => {
    if (!key) {
      return null;
    }
    return snapshot[`${config.statePrefix}.${key}`];
  };

  const incomingSnapshot = useMemo(
    () => ({
      pvNow: asNumber(getValue(states, config.keys.pvNow)),
      homeNow: asNumber(getValue(states, config.keys.homeNow)),
      gridIn: asNumber(getValue(states, config.keys.gridIn)),
      gridOut: asNumber(getValue(states, config.keys.gridOut)),
      soc: asNumber(getValue(states, config.keys.soc)),
      battIn: asNumber(getValue(states, config.keys.battIn)),
      battOut: asNumber(getValue(states, config.keys.battOut)),
      battTemp: asNumber(getValue(states, config.keys.battTemp)),
      pvTotalKWh: normalizeEnergyToKWh(getValue(states, config.keys.pvTotal), config.dailyEnergyUnit),
      dayConsumedKWh: normalizeEnergyToKWh(getValue(states, config.keys.dayConsumed), config.dailyEnergyUnit),
      daySelfKWh: normalizeEnergyToKWh(getValue(states, config.keys.daySelf), config.dailyEnergyUnit),
    }),
    [config.dailyEnergyUnit, config.keys, config.statePrefix, states]
  );

  const [displaySnapshot, setDisplaySnapshot] = useState(incomingSnapshot);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplaySnapshot(incomingSnapshot);
    }, 220);

    return () => clearTimeout(timer);
  }, [incomingSnapshot]);

  const { pvNow, homeNow, gridIn, gridOut, soc, battIn, battOut, battTemp, pvTotalKWh, dayConsumedKWh, daySelfKWh } =
    displaySnapshot;
  const autarkPct =
    daySelfKWh !== null && dayConsumedKWh !== null && dayConsumedKWh > 0
      ? clamp((daySelfKWh / dayConsumedKWh) * 100, 0, 100)
      : null;
  const missingCore = pvNow === null && homeNow === null && gridIn === null && gridOut === null;

  const battSigned =
    battOut !== null && battOut > 20 ? Math.abs(battOut) : battIn !== null && battIn > 20 ? -Math.abs(battIn) : 0;
  const gridSigned =
    gridIn !== null && gridIn > 20 ? Math.abs(gridIn) : gridOut !== null && gridOut > 20 ? -Math.abs(gridOut) : 0;
  const pvDir: FlowDir = pvNow !== null && pvNow > 20 ? "toHome" : "idle";
  const battDir = dirFromSigned(battSigned);
  const gridDir = dirFromSigned(gridSigned);
  const backgroundBlur = clamp(config.backgroundImageBlur ?? 8, 0, 24);

  return (
    <View style={styles.container}>
      {config.backgroundMode === "image" && config.backgroundImage ? (
        Platform.OS === "web" ? (
          <View
            style={[
              styles.sceneCard,
              {
                borderColor: resolvedTheme.solar.sceneCardBorder,
              },
            ]}
          >
            {createElement("div", {
              style: buildBlurredBackgroundStyle(config.backgroundImage, backgroundBlur),
            })}
            <View style={styles.sceneBackgroundOverlay} />
            <SolarFlowScene
              battDir={battDir}
              battPower={Math.abs(battSigned)}
              battTemp={battTemp}
              gridDir={gridDir}
              gridPower={Math.abs(gridSigned)}
              homeNow={homeNow}
              mutedTextColor={mutedTextColor}
              textColor={textColor}
              widgetAppearance={widgetAppearance}
              theme={resolvedTheme}
              pvDir={pvDir}
              pvNow={pvNow}
              soc={soc}
              nodeLayout={config.nodeLayout}
            />
          </View>
        ) : (
            <ImageBackground
              blurRadius={backgroundBlur}
              imageStyle={styles.sceneBackgroundImage}
              source={{ uri: `/smarthome-dashboard/widget-assets/${encodeURIComponent(config.backgroundImage)}` }}
              style={[
                styles.sceneCard,
                {
                  borderColor: resolvedTheme.solar.sceneCardBorder,
                },
              ]}
            >
              <View style={styles.sceneBackgroundOverlay} />
              <SolarFlowScene
                battDir={battDir}
                battPower={Math.abs(battSigned)}
                battTemp={battTemp}
                gridDir={gridDir}
                gridPower={Math.abs(gridSigned)}
                homeNow={homeNow}
                mutedTextColor={mutedTextColor}
                textColor={textColor}
                widgetAppearance={widgetAppearance}
                theme={resolvedTheme}
                pvDir={pvDir}
                pvNow={pvNow}
                soc={soc}
                nodeLayout={config.nodeLayout}
              />
            </ImageBackground>
          )
      ) : (
          <View
            style={[
              styles.sceneCard,
              {
                backgroundColor: widgetAppearance?.cardColor || resolvedTheme.solar.sceneCardBackground,
                borderColor: resolvedTheme.solar.sceneCardBorder,
              },
            ]}
          >
            <SolarFlowScene
              battDir={battDir}
              battPower={Math.abs(battSigned)}
              battTemp={battTemp}
              gridDir={gridDir}
              gridPower={Math.abs(gridSigned)}
              homeNow={homeNow}
              mutedTextColor={mutedTextColor}
              textColor={textColor}
              widgetAppearance={widgetAppearance}
              theme={resolvedTheme}
              pvDir={pvDir}
              pvNow={pvNow}
              soc={soc}
              nodeLayout={config.nodeLayout}
            />
          </View>
        )}

      <View style={styles.bottomRow}>
        <MiniStat
          appearance={widgetAppearance}
          label="Eigenverbrauch"
          mutedTextColor={mutedTextColor}
          textColor={textColor}
          theme={resolvedTheme}
          value={fmtKWh(daySelfKWh)}
        />
        <MiniStat
          appearance={widgetAppearance}
          label="Verbraucht"
          mutedTextColor={mutedTextColor}
          textColor={textColor}
          theme={resolvedTheme}
          value={fmtKWh(dayConsumedKWh)}
        />
        <MiniStat
          appearance={widgetAppearance}
          label="Autarkie"
          mutedTextColor={mutedTextColor}
          textColor={textColor}
          theme={resolvedTheme}
          value={autarkPct === null ? "—" : `${Math.round(autarkPct)} %`}
        />
        <MiniStat
          appearance={widgetAppearance}
          label="PV Gesamt"
          mutedTextColor={mutedTextColor}
          textColor={textColor}
          theme={resolvedTheme}
          value={fmtKWh(pvTotalKWh)}
        />
      </View>

      <Text style={[styles.footnote, { color: mutedTextColor }]}>
        Tageswerte nutzen `dailyEnergyUnit={config.dailyEnergyUnit || "auto"}`. `auto` erkennt `Wh`/`kWh` aus Strings
        oder schaetzt nackte Zahlen plausibel.
      </Text>
      {missingCore ? <Text style={styles.warning}>Keine Solar-Daten gefunden. Pruefe Prefix und Key-Mapping.</Text> : null}
    </View>
  );
}

function SolarFlowScene({
  pvDir,
  pvNow,
  homeNow,
  battDir,
  battPower,
  soc,
  battTemp,
  gridDir,
  gridPower,
  theme,
  textColor,
  mutedTextColor,
  widgetAppearance,
  nodeLayout,
}: {
  pvDir: FlowDir;
  pvNow: number | null;
  homeNow: number | null;
  battDir: FlowDir;
  battPower: number;
  soc: number | null;
  battTemp: number | null;
  gridDir: FlowDir;
  gridPower: number;
  theme: ThemeSettings;
  textColor: string;
  mutedTextColor: string;
  widgetAppearance?: SolarWidgetConfig["appearance"];
  nodeLayout?: Partial<SolarLayoutConfig>;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [sceneLayout, setSceneLayout] = useState({ width: 960, height: 520 });

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const defaults = getDefaultNodeLayout();
  const pvBox = resolveNodeBox(nodeLayout?.pv, defaults.pv, sceneLayout);
  const homeBox = resolveNodeBox(nodeLayout?.home, defaults.home, sceneLayout);
  const batteryBox = resolveNodeBox(nodeLayout?.battery, defaults.battery, sceneLayout);
  const gridBox = resolveNodeBox(nodeLayout?.grid, defaults.grid, sceneLayout);
  const carBox = resolveNodeBox(nodeLayout?.car, defaults.car, sceneLayout);
  const beamLength = 18;
  const connectorInset = 18;
  const topMidX = pvBox.x + pvBox.w / 2;
  const homeMidX = homeBox.x + homeBox.w / 2;
  const carMidX = carBox.x + carBox.w / 2;
  const batteryMidY = batteryBox.y + batteryBox.h / 2;
  const homeMidY = homeBox.y + homeBox.h / 2;
  const gridMidY = gridBox.y + gridBox.h / 2;
  const topLineLeft = Math.round((topMidX + homeMidX) / 2) - 2;
  const topBeamLeft = topLineLeft - 2;
  const bottomLineLeft = Math.round((carMidX + homeMidX) / 2) - 2;
  const bottomBeamLeft = bottomLineLeft - 2;

  const topLineStart = pvBox.y + pvBox.h + connectorInset;
  const topLineEnd = homeBox.y - connectorInset;
  const topLineHeight = Math.max(12, topLineEnd - topLineStart);
  const leftLineTop = Math.round((batteryMidY + homeMidY) / 2) - 2;
  const rightLineTop = Math.round((gridMidY + homeMidY) / 2) - 2;
  const leftLineStart = batteryBox.x + batteryBox.w + connectorInset;
  const leftLineEnd = homeBox.x - connectorInset;
  const leftLineWidth = Math.max(16, leftLineEnd - leftLineStart);
  const rightLineStart = homeBox.x + homeBox.w + connectorInset;
  const rightLineEnd = gridBox.x - connectorInset;
  const rightLineWidth = Math.max(16, rightLineEnd - rightLineStart);
  const bottomLineStart = homeBox.y + homeBox.h + connectorInset;
  const bottomLineEnd = carBox.y - connectorInset;
  const bottomLineHeight = Math.max(12, bottomLineEnd - bottomLineStart);

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setSceneLayout(event.nativeEvent.layout)}
      style={styles.scene}
    >
      <View style={[styles.lineVertical, { top: topLineStart, left: topLineLeft, height: topLineHeight }]} />
      <View style={[styles.lineVertical, { top: bottomLineStart, left: bottomLineLeft, height: bottomLineHeight }]} />
      <View style={[styles.lineHorizontal, { top: leftLineTop, left: leftLineStart, width: leftLineWidth }]} />
      <View style={[styles.lineHorizontal, { top: rightLineTop, left: rightLineStart, width: rightLineWidth }]} />

      <AnimatedBeam
        active={pvDir !== "idle"}
        axis="y"
        progress={progress}
        range={pvDir === "toHome" ? [0, Math.max(0, topLineHeight - 20)] : [Math.max(0, topLineHeight - 20), 0]}
        baseStyle={{ top: topLineStart, left: topBeamLeft }}
        strength={clamp((pvNow || 0) / 8000, 0.2, 1)}
      />
      <AnimatedBeam
        active={battDir !== "idle"}
        axis="x"
        progress={progress}
        range={battDir === "toHome" ? [0, Math.max(0, leftLineWidth - beamLength)] : [Math.max(0, leftLineWidth - beamLength), 0]}
        baseStyle={{ top: leftLineTop - 2, left: leftLineStart }}
        strength={clamp(battPower / 6000, 0.2, 1)}
      />
      <AnimatedBeam
        active={gridDir !== "idle"}
        axis="x"
        progress={progress}
        range={gridDir === "toHome" ? [Math.max(0, rightLineWidth - beamLength), 0] : [0, Math.max(0, rightLineWidth - beamLength)]}
        baseStyle={{ top: rightLineTop - 2, left: rightLineStart }}
        strength={clamp(gridPower / 12000, 0.2, 1)}
      />

      <NodeCard
        icon="white-balance-sunny"
        label="PV"
        iconColor="#8af7d3"
        iconSurface="rgba(35, 98, 88, 0.34)"
        nodeColor={widgetAppearance?.pvCardColor}
        theme={theme}
        textColor={textColor}
        mutedTextColor={textColor}
        widgetAppearance={widgetAppearance}
        style={{ ...styles.nodePosition, top: pvBox.y, left: pvBox.x, width: pvBox.w, minHeight: pvBox.h }}
        value={fmtW(pvNow)}
        highlight={pvDir !== "idle"}
      />
      <NodeCard
        icon="home-variant-outline"
        label="Haus"
        iconColor="#86b7ff"
        iconSurface="rgba(35, 59, 110, 0.34)"
        nodeColor={widgetAppearance?.homeCardColor}
        theme={theme}
        textColor={textColor}
        mutedTextColor={textColor}
        widgetAppearance={widgetAppearance}
        style={{ ...styles.nodePosition, top: homeBox.y, left: homeBox.x, width: homeBox.w, minHeight: homeBox.h }}
        value={fmtW(homeNow)}
        highlight
      />
      <NodeCard
        icon={resolveBatteryIcon(soc)}
        label={soc !== null ? `Akku ${Math.round(soc)}%` : "Akku"}
        iconColor="#8b8dff"
        iconSurface="rgba(58, 48, 110, 0.34)"
        nodeColor={widgetAppearance?.batteryCardColor}
        theme={theme}
        textColor={textColor}
        mutedTextColor={textColor}
        widgetAppearance={widgetAppearance}
        style={{ ...styles.nodePosition, top: batteryBox.y, left: batteryBox.x, width: batteryBox.w, minHeight: batteryBox.h }}
        value={fmtW(battPower || null)}
        meta={
          soc !== null && battTemp !== null
            ? `${Math.round(soc)} % · ${battTemp.toFixed(1)} °C`
            : soc !== null
              ? `${Math.round(soc)} %`
              : battTemp !== null
                ? `${battTemp.toFixed(1)} °C`
                : undefined
        }
        highlight={battDir !== "idle"}
      />
      <NodeCard
        icon="transmission-tower-export"
        label="Netz"
        iconColor="#b9c4d8"
        iconSurface="rgba(70, 78, 98, 0.28)"
        nodeColor={widgetAppearance?.gridCardColor}
        theme={theme}
        textColor={textColor}
        mutedTextColor={mutedTextColor}
        widgetAppearance={widgetAppearance}
        style={{ ...styles.nodePosition, top: gridBox.y, left: gridBox.x, width: gridBox.w, minHeight: gridBox.h }}
        value={fmtW(gridPower || null)}
        meta={gridDir === "toHome" ? "Bezug" : gridDir === "fromHome" ? "Einspeisung" : "Idle"}
        highlight={gridDir !== "idle"}
      />
      <NodeCard
        icon="ev-station"
        label="Auto"
        iconColor="#9fe89f"
        iconSurface="rgba(46, 94, 62, 0.28)"
        nodeColor={widgetAppearance?.carCardColor}
        theme={theme}
        textColor={textColor}
        mutedTextColor={mutedTextColor}
        widgetAppearance={widgetAppearance}
        style={{ ...styles.nodePosition, top: carBox.y, left: carBox.x, width: carBox.w, minHeight: carBox.h }}
        value="—"
      />
    </View>
  );
}

function AnimatedBeam({
  active,
  progress,
  axis,
  range,
  strength,
  baseStyle,
}: {
  active: boolean;
  progress: Animated.Value;
  axis: "x" | "y";
  range: [number, number];
  strength: number;
  baseStyle?: object;
}) {
  if (!active) {
    return null;
  }

  const transform =
    axis === "x"
      ? [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: range }) }]
      : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: range }) }];

  return (
    <Animated.View
      style={[
        axis === "x" ? styles.beamHorizontal : styles.beamVertical,
        baseStyle,
        {
          opacity: clamp(0.35 + strength * 0.65, 0.35, 1),
          transform,
        },
      ]}
    />
  );
}

function NodeCard({
  icon,
  label,
  value,
  meta,
  highlight,
  style,
  theme,
  textColor,
  mutedTextColor,
  widgetAppearance,
  nodeColor,
  iconColor,
  iconSurface,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  meta?: string;
  highlight?: boolean;
  style?: object;
  theme: ThemeSettings;
  textColor: string;
  mutedTextColor: string;
  widgetAppearance?: SolarWidgetConfig["appearance"];
  nodeColor?: string;
  iconColor?: string;
  iconSurface?: string;
}) {
  return (
    <View
      style={[
        styles.nodeCard,
        {
          backgroundColor: nodeColor || widgetAppearance?.cardColor || theme.solar.nodeCardBackground,
          borderColor: theme.solar.nodeCardBorder,
        },
        style,
        highlight ? styles.nodeCardActive : null,
      ]}
    >
      <View
        style={[
          styles.nodeIcon,
          { backgroundColor: iconSurface || "rgba(255,255,255,0.08)" },
          highlight ? styles.nodeIconActive : null,
        ]}
      >
        <View style={styles.nodeIconInner}>
          <MaterialCommunityIcons
            color={iconColor || (highlight ? palette.accent : palette.textMuted)}
            name={icon}
            size={24}
          />
        </View>
      </View>
      <Text style={[styles.nodeValue, styles.nodeValueCompact, { color: textColor }]}>{value}</Text>
      {meta ? (
        <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.nodeMeta, { color: mutedTextColor }]}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

function MiniStat({
  appearance,
  label,
  value,
  theme,
  textColor,
  mutedTextColor,
}: {
  appearance?: SolarWidgetConfig["appearance"];
  label: string;
  value: string;
  theme: ThemeSettings;
  textColor: string;
  mutedTextColor: string;
}) {
  return (
    <View
      style={[
        styles.mini,
        {
          backgroundColor: appearance?.statColor || theme.solar.statCardBackground,
          borderColor: theme.solar.statCardBorder,
        },
      ]}
    >
      <Text style={[styles.miniValue, { color: textColor }]}>{value}</Text>
      <Text style={[styles.miniLabel, { color: mutedTextColor }]}>{label}</Text>
    </View>
  );
}

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined) {
    return null;
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : null;
  }
  const match = String(v).trim().replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEnergyToKWh(
  value: unknown,
  configuredUnit: SolarWidgetConfig["dailyEnergyUnit"] = "auto"
) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(",", ".");
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

    return numericToKWh(numeric, configuredUnit);
  }

  const numeric = asNumber(value);
  if (numeric === null) {
    return null;
  }

  return numericToKWh(numeric, configuredUnit);
}

function numericToKWh(
  numeric: number,
  configuredUnit: SolarWidgetConfig["dailyEnergyUnit"] = "auto"
) {
  if (configuredUnit === "kWh") {
    return numeric;
  }
  if (configuredUnit === "Wh") {
    return numeric / 1000;
  }
  if (Math.abs(numeric) > 100) {
    return numeric / 1000;
  }
  return numeric;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function dirFromSigned(value: number, threshold = 20): FlowDir {
  if (Math.abs(value) < threshold) {
    return "idle";
  }
  return value > 0 ? "toHome" : "fromHome";
}

function fmtW(n: number | null) {
  if (n === null) {
    return "—";
  }
  return `${(n / 1000).toFixed(1)} kW`;
}

function fmtKWh(n: number | null) {
  if (n === null) {
    return "—";
  }
  if (Math.abs(n) >= 1000) {
    return `${(n / 1000).toFixed(2)} MWh`;
  }
  return `${n.toFixed(1)} kWh`;
}

function resolveBatteryIcon(soc: number | null): keyof typeof MaterialCommunityIcons.glyphMap {
  if (soc === null) {
    return "battery-outline";
  }

  const percent = clamp(Math.round(soc), 0, 100);
  if (percent >= 95) {
    return "battery";
  }
  if (percent >= 75) {
    return "battery-80";
  }
  if (percent >= 50) {
    return "battery-50";
  }
  if (percent >= 25) {
    return "battery-30";
  }
  if (percent > 0) {
    return "battery-10";
  }
  return "battery-outline";
}

function getDefaultNodeLayout(): SolarLayoutConfig {
  return {
    pv: { x: 0.44, y: 0.07, w: 0.12, h: 0.18 },
    home: { x: 0.44, y: 0.41, w: 0.12, h: 0.18 },
    battery: { x: 0.14, y: 0.43, w: 0.1, h: 0.14 },
    grid: { x: 0.76, y: 0.43, w: 0.1, h: 0.14 },
    car: { x: 0.45, y: 0.77, w: 0.1, h: 0.14 },
  };
}

function resolveNodeBox(
  partial: Partial<SolarNodeLayout> | undefined,
  fallback: SolarNodeLayout,
  scene: { width: number; height: number }
) {
  const x = clamp(typeof partial?.x === "number" ? partial.x : fallback.x, 0, 1);
  const y = clamp(typeof partial?.y === "number" ? partial.y : fallback.y, 0, 1);
  const w = clamp(typeof partial?.w === "number" ? partial.w : fallback.w, 0.06, 0.4);
  const h = clamp(typeof partial?.h === "number" ? partial.h : fallback.h, 0.08, 0.4);
  const width = scene.width * w;
  const height = scene.height * h;
  const left = clamp(scene.width * x, 0, Math.max(0, scene.width - width));
  const top = clamp(scene.height * y, 0, Math.max(0, scene.height - height));

  return {
    x: left,
    y: top,
    w: width,
    h: height,
  };
}

function buildBlurredBackgroundStyle(imageName: string, blur: number) {
  return {
    position: "absolute",
    inset: "-18px",
    borderRadius: "28px",
    backgroundImage: `url("/smarthome-dashboard/widget-assets/${encodeURIComponent(imageName)}")`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
    filter: `blur(${blur}px)`,
    transform: "scale(1.04)",
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
  },
  sceneCard: {
    borderRadius: 22,
    padding: 14,
    alignSelf: "stretch",
    aspectRatio: 1.75,
    minHeight: 560,
    borderWidth: 1,
    overflow: "hidden",
  },
  scene: {
    flex: 1,
    position: "relative",
    backgroundColor: "rgba(0,0,0,0)",
  },
  sceneBackgroundImage: {
    borderRadius: 22,
    resizeMode: "cover",
  },
  sceneBackgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    backgroundColor: "rgba(5, 10, 18, 0.3)",
  },
  lineVertical: {
    position: "absolute",
    width: 4,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  lineHorizontal: {
    position: "absolute",
    height: 4,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  beamVertical: {
    position: "absolute",
    width: 8,
    height: 20,
    borderRadius: 99,
    backgroundColor: palette.accentWarm,
    shadowColor: palette.accentWarm,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  beamHorizontal: {
    position: "absolute",
    width: 18,
    height: 8,
    borderRadius: 99,
    backgroundColor: palette.accentWarm,
    shadowColor: palette.accentWarm,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  nodePosition: {
    position: "absolute",
  },
  nodeCard: {
    position: "absolute",
    borderRadius: 20,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  nodeCardActive: {
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  nodeIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  nodeIconActive: {
    borderColor: "rgba(255,255,255,0.12)",
  },
  nodeIconInner: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  nodeLabel: {
    marginTop: 8,
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  nodeValue: {
    marginTop: 10,
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  nodeValueCompact: {
    marginTop: 12,
  },
  nodeMeta: {
    marginTop: 4,
    color: palette.textMuted,
    fontSize: 10,
    maxWidth: "92%",
    textAlign: "center",
  },
  bottomRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 18,
  },
  mini: {
    flexGrow: 1,
    flexBasis: 140,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  miniValue: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  miniLabel: {
    marginTop: 4,
    color: palette.textMuted,
    fontSize: 12,
  },
  footnote: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  warning: {
    color: palette.danger,
    fontSize: 12,
    lineHeight: 18,
  },
});
