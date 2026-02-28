import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { SolarWidgetConfig, StateSnapshot } from "../../types/dashboard";
import { palette } from "../../utils/theme";

type SolarWidgetProps = {
  config: SolarWidgetConfig;
  states: StateSnapshot;
};

type FlowDir = "toHome" | "fromHome" | "idle";

export function SolarWidget({ config, states }: SolarWidgetProps) {
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
      <View style={styles.sceneCard}>
        <SolarFlowScene
          battDir={battDir}
          battPower={Math.abs(battSigned)}
          battTemp={battTemp}
          gridDir={gridDir}
          gridPower={Math.abs(gridSigned)}
          homeNow={homeNow}
          pvDir={pvDir}
          pvNow={pvNow}
          soc={soc}
        />
      </View>

      <View style={styles.bottomRow}>
        <MiniStat label="Eigenverbrauch" value={fmtKWh(daySelfKWh)} />
        <MiniStat label="Verbraucht" value={fmtKWh(dayConsumedKWh)} />
        <MiniStat label="Autarkie" value={autarkPct === null ? "—" : `${Math.round(autarkPct)} %`} />
        <MiniStat label="PV Gesamt" value={fmtKWh(pvTotalKWh)} />
      </View>

      <Text style={styles.footnote}>
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
}) {
  const progress = useRef(new Animated.Value(0)).current;

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

  return (
    <View style={styles.scene}>
      <View style={styles.lineVerticalTop} />
      <View style={styles.lineHorizontalLeft} />
      <View style={styles.lineHorizontalRight} />

      <AnimatedBeam
        active={pvDir !== "idle"}
        axis="y"
        progress={progress}
        range={pvDir === "toHome" ? [0, 90] : [90, 0]}
        baseStyle={styles.beamVerticalBase}
        strength={clamp((pvNow || 0) / 8000, 0.2, 1)}
      />
      <AnimatedBeam
        active={battDir !== "idle"}
        axis="x"
        progress={progress}
        range={battDir === "toHome" ? [0, 36] : [36, 0]}
        baseStyle={styles.beamLeftBase}
        strength={clamp(battPower / 6000, 0.2, 1)}
      />
      <AnimatedBeam
        active={gridDir !== "idle"}
        axis="x"
        progress={progress}
        range={gridDir === "toHome" ? [36, 0] : [0, 36]}
        baseStyle={styles.beamRightBase}
        strength={clamp(gridPower / 12000, 0.2, 1)}
      />

      <NodeCard
        icon="solar-power"
        label="PV"
        style={styles.nodeTop}
        value={fmtW(pvNow)}
        highlight={pvDir !== "idle"}
      />
      <NodeCard
        icon="home-lightning-bolt-outline"
        label="Haus"
        style={styles.nodeCenter}
        value={fmtW(homeNow)}
        highlight
      />
      <NodeCard
        icon="battery-high"
        label={soc !== null ? `Akku ${Math.round(soc)}%` : "Akku"}
        style={styles.nodeLeft}
        value={fmtW(battPower || null)}
        meta={battTemp !== null ? `${battTemp.toFixed(1)} °C` : undefined}
        highlight={battDir !== "idle"}
      />
      <NodeCard
        icon="transmission-tower"
        label="Netz"
        style={styles.nodeRight}
        value={fmtW(gridPower || null)}
        meta={gridDir === "toHome" ? "Bezug" : gridDir === "fromHome" ? "Einspeisung" : "Idle"}
        highlight={gridDir !== "idle"}
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
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: string;
  meta?: string;
  highlight?: boolean;
  style?: object;
}) {
  return (
    <View style={[styles.nodeCard, style, highlight ? styles.nodeCardActive : null]}>
      <View style={[styles.nodeIcon, highlight ? styles.nodeIconActive : null]}>
        <MaterialCommunityIcons color={highlight ? palette.accent : palette.textMuted} name={icon} size={26} />
      </View>
      <Text style={styles.nodeLabel}>{label}</Text>
      <Text style={styles.nodeValue}>{value}</Text>
      {meta ? <Text style={styles.nodeMeta}>{meta}</Text> : null}
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.mini}>
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
  },
  sceneCard: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  scene: {
    height: 444,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  lineVerticalTop: {
    position: "absolute",
    top: 118,
    left: "50%",
    marginLeft: -2,
    width: 4,
    height: 110,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  lineHorizontalLeft: {
    position: "absolute",
    top: 286,
    left: "50%",
    marginLeft: -116,
    width: 54,
    height: 4,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  lineHorizontalRight: {
    position: "absolute",
    top: 286,
    left: "50%",
    marginLeft: 62,
    width: 54,
    height: 4,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  beamVerticalBase: {
    top: 118,
    left: "50%",
    marginLeft: -4,
  },
  beamLeftBase: {
    top: 284,
    left: "50%",
    marginLeft: -116,
  },
  beamRightBase: {
    top: 284,
    left: "50%",
    marginLeft: 62,
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
  nodeCard: {
    position: "absolute",
    width: 124,
    minHeight: 102,
    borderRadius: 18,
    padding: 12,
    alignItems: "center",
    backgroundColor: "rgba(9, 18, 30, 0.9)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  nodeCardActive: {
    backgroundColor: "rgba(77, 226, 177, 0.06)",
  },
  nodeTop: {
    top: 8,
    left: "50%",
    marginLeft: -62,
  },
  nodeCenter: {
    top: 236,
    left: "50%",
    marginLeft: -62,
  },
  nodeLeft: {
    top: 236,
    left: "50%",
    marginLeft: -240,
  },
  nodeRight: {
    top: 236,
    left: "50%",
    marginLeft: 116,
  },
  nodeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  nodeIconActive: {
    backgroundColor: "rgba(77, 226, 177, 0.08)",
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
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: palette.border,
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
