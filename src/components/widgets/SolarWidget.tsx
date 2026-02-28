import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { SolarWidgetConfig, StateSnapshot, ThemeSettings } from "../../types/dashboard";
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
  const getValue = (key?: string) => {
    if (!key) {
      return null;
    }
    return states[`${config.statePrefix}.${key}`];
  };

  const pvNow = asNumber(getValue(config.keys.pvNow));
  const homeNow = asNumber(getValue(config.keys.homeNow));
  const gridIn = asNumber(getValue(config.keys.gridIn));
  const gridOut = asNumber(getValue(config.keys.gridOut));
  const soc = asNumber(getValue(config.keys.soc));
  const battIn = asNumber(getValue(config.keys.battIn));
  const battOut = asNumber(getValue(config.keys.battOut));
  const battTemp = asNumber(getValue(config.keys.battTemp));
  const pvTotalKWh = normalizeEnergyToKWh(getValue(config.keys.pvTotal), config.dailyEnergyUnit);
  const dayConsumedKWh = normalizeEnergyToKWh(getValue(config.keys.dayConsumed), config.dailyEnergyUnit);
  const daySelfKWh = normalizeEnergyToKWh(getValue(config.keys.daySelf), config.dailyEnergyUnit);
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

  return (
    <View style={styles.container}>
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
        />
      </View>

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
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [sceneLayout, setSceneLayout] = useState({ width: 960, height: 420 });

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

  const cardWidth = clamp(sceneLayout.width * 0.14, 108, 152);
  const cardHeight = 102;
  const beamLength = 18;
  const centerX = sceneLayout.width / 2 - cardWidth / 2;
  const horizontalGap = clamp(sceneLayout.width * 0.11, 52, 124);
  const verticalGap = clamp(sceneLayout.height * 0.16, 84, 156);
  const centerY = clamp(
    sceneLayout.height * 0.42,
    24 + cardHeight + verticalGap,
    sceneLayout.height - (24 + cardHeight * 2 + verticalGap)
  );

  const topY = Math.max(12, centerY - cardHeight - verticalGap);
  const leftX = Math.max(0, centerX - cardWidth - horizontalGap);
  const rightX = Math.min(sceneLayout.width - cardWidth, centerX + cardWidth + horizontalGap);
  const bottomY = Math.min(sceneLayout.height - cardHeight - 12, centerY + cardHeight + verticalGap);

  const topLineStart = topY + cardHeight;
  const topLineHeight = Math.max(12, centerY - topLineStart);
  const centerLineY = centerY + cardHeight / 2 - 2;
  const leftLineStart = leftX + cardWidth;
  const leftLineWidth = Math.max(16, centerX - leftLineStart);
  const rightLineStart = centerX + cardWidth;
  const rightLineWidth = Math.max(16, rightX - rightLineStart);
  const bottomLineStart = centerY + cardHeight;
  const bottomLineHeight = Math.max(12, bottomY - bottomLineStart);

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setSceneLayout(event.nativeEvent.layout)}
      style={styles.scene}
    >
      <View style={[styles.lineVertical, { top: topLineStart, left: sceneLayout.width / 2 - 2, height: topLineHeight }]} />
      <View style={[styles.lineVertical, { top: bottomLineStart, left: sceneLayout.width / 2 - 2, height: bottomLineHeight }]} />
      <View style={[styles.lineHorizontal, { top: centerLineY, left: leftLineStart, width: leftLineWidth }]} />
      <View style={[styles.lineHorizontal, { top: centerLineY, left: rightLineStart, width: rightLineWidth }]} />

      <AnimatedBeam
        active={pvDir !== "idle"}
        axis="y"
        progress={progress}
        range={pvDir === "toHome" ? [0, Math.max(0, topLineHeight - 20)] : [Math.max(0, topLineHeight - 20), 0]}
        baseStyle={{ top: topLineStart, left: sceneLayout.width / 2 - 4 }}
        strength={clamp((pvNow || 0) / 8000, 0.2, 1)}
      />
      <AnimatedBeam
        active={battDir !== "idle"}
        axis="x"
        progress={progress}
        range={battDir === "toHome" ? [0, Math.max(0, leftLineWidth - beamLength)] : [Math.max(0, leftLineWidth - beamLength), 0]}
        baseStyle={{ top: centerLineY - 2, left: leftLineStart }}
        strength={clamp(battPower / 6000, 0.2, 1)}
      />
      <AnimatedBeam
        active={gridDir !== "idle"}
        axis="x"
        progress={progress}
        range={gridDir === "toHome" ? [Math.max(0, rightLineWidth - beamLength), 0] : [0, Math.max(0, rightLineWidth - beamLength)]}
        baseStyle={{ top: centerLineY - 2, left: rightLineStart }}
        strength={clamp(gridPower / 12000, 0.2, 1)}
      />

      <NodeCard
        icon="solar-power"
        label="PV"
        nodeColor={widgetAppearance?.pvCardColor}
        theme={theme}
        textColor={textColor}
        mutedTextColor={mutedTextColor}
        widgetAppearance={widgetAppearance}
        style={{ ...styles.nodePosition, top: topY, left: centerX, width: cardWidth, minHeight: cardHeight }}
        value={fmtW(pvNow)}
        highlight={pvDir !== "idle"}
      />
      <NodeCard
        icon="home-lightning-bolt-outline"
        label="Haus"
        nodeColor={widgetAppearance?.homeCardColor}
        theme={theme}
        textColor={textColor}
        mutedTextColor={mutedTextColor}
        widgetAppearance={widgetAppearance}
        style={{ ...styles.nodePosition, top: centerY, left: centerX, width: cardWidth, minHeight: cardHeight }}
        value={fmtW(homeNow)}
        highlight
      />
      <NodeCard
        icon={resolveBatteryIcon(soc)}
        label={soc !== null ? `Akku ${Math.round(soc)}%` : "Akku"}
        nodeColor={widgetAppearance?.batteryCardColor}
        theme={theme}
        textColor={textColor}
        mutedTextColor={mutedTextColor}
        widgetAppearance={widgetAppearance}
        style={{ ...styles.nodePosition, top: centerY, left: leftX, width: cardWidth, minHeight: cardHeight }}
        value={fmtW(battPower || null)}
        meta={battTemp !== null ? `${battTemp.toFixed(1)} °C` : undefined}
        highlight={battDir !== "idle"}
      />
      <NodeCard
        icon="transmission-tower"
        label="Netz"
        nodeColor={widgetAppearance?.gridCardColor}
        theme={theme}
        textColor={textColor}
        mutedTextColor={mutedTextColor}
        widgetAppearance={widgetAppearance}
        style={{ ...styles.nodePosition, top: centerY, left: rightX, width: cardWidth, minHeight: cardHeight }}
        value={fmtW(gridPower || null)}
        meta={gridDir === "toHome" ? "Bezug" : gridDir === "fromHome" ? "Einspeisung" : "Idle"}
        highlight={gridDir !== "idle"}
      />
      <NodeCard
        icon="car-electric"
        label="Auto"
        nodeColor={widgetAppearance?.carCardColor}
        theme={theme}
        textColor={textColor}
        mutedTextColor={mutedTextColor}
        widgetAppearance={widgetAppearance}
        style={{ ...styles.nodePosition, top: bottomY, left: centerX, width: cardWidth, minHeight: cardHeight }}
        value="—"
        meta="Wallbox"
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
      <View style={[styles.nodeIcon, highlight ? styles.nodeIconActive : null]}>
        <MaterialCommunityIcons color={highlight ? palette.accent : palette.textMuted} name={icon} size={26} />
      </View>
      <Text style={[styles.nodeLabel, { color: mutedTextColor }]}>{label}</Text>
      <Text style={[styles.nodeValue, { color: textColor }]}>{value}</Text>
      {meta ? <Text style={[styles.nodeMeta, { color: mutedTextColor }]}>{meta}</Text> : null}
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
  return `${(n / 1000).toFixed(2)} kW`;
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
  },
  sceneCard: {
    borderRadius: 22,
    padding: 14,
    alignSelf: "stretch",
    aspectRatio: 2.15,
    minHeight: 360,
    borderWidth: 1,
    overflow: "hidden",
  },
  scene: {
    flex: 1,
    position: "relative",
    backgroundColor: "rgba(0,0,0,0)",
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
  },
  nodeCardActive: {
  },
  nodeIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  nodeIconActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
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
    marginTop: 6,
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  nodeMeta: {
    marginTop: 4,
    color: palette.textMuted,
    fontSize: 11,
  },
  bottomRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
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
