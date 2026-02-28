import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StateWidgetConfig } from "../../types/dashboard";
import { palette } from "../../utils/theme";

type StateWidgetProps = {
  config: StateWidgetConfig;
  value: unknown;
  onToggle: () => void;
};

export function StateWidget({ config, value, onToggle }: StateWidgetProps) {
  const hasValue = value !== null && value !== undefined;
  const active = Boolean(value);
  const iconName = resolveIconName(config, value);
  const textColor = config.appearance?.textColor || palette.text;
  const mutedTextColor = config.appearance?.mutedTextColor || palette.textMuted;

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons
          color={active ? palette.accent : palette.textMuted}
          name={(iconName || "toggle-switch-outline") as never}
          size={34}
        />
      </View>
      <Text style={[styles.title, { color: textColor }]}>{config.title}</Text>
      <Text style={[styles.value, { color: mutedTextColor }]}>
        {hasValue ? (active ? config.onLabel || "Ein" : config.offLabel || "Aus") : "Keine Daten"}
      </Text>
      {!hasValue ? <Text style={styles.hint}>{config.stateId}</Text> : null}
      {config.writeable ? (
        <Pressable onPress={onToggle} style={[styles.button, active ? styles.buttonActive : styles.buttonIdle]}>
          <Text style={[styles.buttonLabel, { color: textColor }]}>{active ? "Ausschalten" : "Schalten"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function resolveIconName(config: StateWidgetConfig, value: unknown) {
  const numericValue = asNumber(value);
  const activeIcon = config.iconPair?.active || "toggle-switch";
  const inactiveIcon = config.iconPair?.inactive || "toggle-switch-off-outline";

  if (numericValue !== null && shouldUseBatteryScale(config)) {
    return resolveBatteryIcon(numericValue);
  }

  return Boolean(value) ? activeIcon : inactiveIcon;
}

function shouldUseBatteryScale(config: StateWidgetConfig) {
  const iconNames = `${config.iconPair?.active || ""} ${config.iconPair?.inactive || ""}`.toLowerCase();
  const descriptor = `${config.title} ${config.stateId}`.toLowerCase();
  return (
    iconNames.includes("battery") ||
    descriptor.includes("akku") ||
    descriptor.includes("battery") ||
    descriptor.includes("soc")
  );
}

function resolveBatteryIcon(value: number): keyof typeof MaterialCommunityIcons.glyphMap {
  const percent = Math.max(0, Math.min(100, Math.round(value)));

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

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".");
    const match = normalized.match(/-?\d+(\.\d+)?/);
    if (!match) {
      return null;
    }

    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 14,
  },
  value: {
    color: palette.textMuted,
    fontSize: 16,
    marginTop: 4,
  },
  hint: {
    color: palette.danger,
    fontSize: 12,
    marginTop: 6,
  },
  button: {
    marginTop: "auto",
    borderRadius: 14,
    alignItems: "center",
    paddingVertical: 10,
  },
  buttonActive: {
    backgroundColor: "rgba(247, 181, 74, 0.25)",
  },
  buttonIdle: {
    backgroundColor: "rgba(77, 226, 177, 0.18)",
  },
  buttonLabel: {
    color: palette.text,
    fontWeight: "700",
  },
});
