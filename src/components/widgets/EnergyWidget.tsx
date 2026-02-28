import { StyleSheet, Text, View } from "react-native";
import { EnergyWidgetConfig, StateSnapshot } from "../../types/dashboard";
import { palette } from "../../utils/theme";

type EnergyWidgetProps = {
  config: EnergyWidgetConfig;
  states: StateSnapshot;
};

const watts = (value: unknown) => `${Number(value || 0).toFixed(0)} W`;

export function EnergyWidget({ config, states }: EnergyWidgetProps) {
  const pv = states[config.pvStateId];
  const house = states[config.houseStateId];
  const battery = config.batteryStateId ? states[config.batteryStateId] : 0;
  const grid = config.gridStateId ? states[config.gridStateId] : 0;
  const missingCore = pv === undefined || house === undefined;
  const cardColor = config.appearance?.cardColor;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <EnergyNode backgroundColor={cardColor} label="PV" value={watts(pv)} accent={palette.accent} />
        <Text style={styles.arrow}>→</Text>
        <EnergyNode backgroundColor={cardColor} label="Haus" value={watts(house)} accent={palette.text} />
      </View>
      <View style={styles.row}>
        <EnergyNode backgroundColor={cardColor} label="Batterie" value={watts(battery)} accent={palette.accentWarm} />
        <Text style={styles.arrow}>↔</Text>
        <EnergyNode backgroundColor={cardColor} label="Netz" value={watts(grid)} accent={palette.textMuted} />
      </View>
      {missingCore ? <Text style={styles.hint}>Pruefe PV- und Haus-State-ID im Widget-Editor.</Text> : null}
    </View>
  );
}

function EnergyNode({
  label,
  value,
  accent,
  backgroundColor,
}: {
  label: string;
  value: string;
  accent: string;
  backgroundColor?: string;
}) {
  return (
    <View style={[styles.node, backgroundColor ? { backgroundColor } : null]}>
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <Text style={styles.nodeLabel}>{label}</Text>
      <Text style={styles.nodeValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    gap: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  arrow: {
    color: palette.textMuted,
    fontSize: 24,
    fontWeight: "700",
  },
  hint: {
    color: palette.danger,
    fontSize: 12,
  },
  node: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 99,
    marginBottom: 8,
  },
  nodeLabel: {
    color: palette.textMuted,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  nodeValue: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 4,
  },
});
