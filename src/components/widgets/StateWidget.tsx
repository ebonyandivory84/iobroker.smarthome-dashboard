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
  const hasTitle = config.showTitle !== false && Boolean(config.title?.trim());
  const active = resolveStateActive(config, value);
  const iconName = resolveIconName(config, value);
  const textColor = config.appearance?.textColor || palette.text;
  const mutedTextColor = config.appearance?.mutedTextColor || palette.textMuted;
  const iconColor = active
    ? config.appearance?.iconColor || palette.accent
    : config.appearance?.iconColor2 || palette.textMuted;

  return (
    <View style={[styles.container, hasTitle ? styles.containerWithTitle : null]}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons
          color={iconColor}
          name={(iconName || "toggle-switch-outline") as never}
          size={34}
        />
      </View>
      <Text style={[styles.value, { color: mutedTextColor }]}>
        {hasValue ? resolveStateLabel(config, value, active) : "Keine Daten"}
      </Text>
      {config.writeable ? (
        <Pressable onPress={onToggle} style={[styles.button, active ? styles.buttonActive : styles.buttonIdle]}>
          <Text style={[styles.buttonLabel, { color: textColor }]}>{active ? "Ausschalten" : "Schalten"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function resolveStateActive(config: StateWidgetConfig, value: unknown) {
  const normalizedCurrent = normalizeStateComparisonValue(config, value);
  const activeMatch = normalizeStateComparisonValue(config, config.activeValue);
  const inactiveMatch = normalizeStateComparisonValue(config, config.inactiveValue);

  if (activeMatch !== undefined && normalizedCurrent === activeMatch) {
    return true;
  }

  if (inactiveMatch !== undefined && normalizedCurrent === inactiveMatch) {
    return false;
  }

  if (config.format === "number" || config.format === "text") {
    return false;
  }

  return Boolean(value);
}

export function resolveStateNextValue(config: StateWidgetConfig, currentValue: unknown) {
  const nextActive = !resolveStateActive(config, currentValue);

  if (nextActive) {
    return parseStateValue(config, config.activeValue ?? defaultStateValue(config, true));
  }

  return parseStateValue(config, config.inactiveValue ?? defaultStateValue(config, false));
}

function resolveIconName(config: StateWidgetConfig, value: unknown) {
  const active = resolveStateActive(config, value);
  const numericValue = asNumber(value);
  const activeIcon = config.iconPair?.active || "toggle-switch";
  const inactiveIcon = config.iconPair?.inactive || "toggle-switch-off-outline";

  if (numericValue !== null && shouldUseBatteryScale(config)) {
    return resolveBatteryIcon(numericValue);
  }

  return active ? activeIcon : inactiveIcon;
}

function resolveStateLabel(config: StateWidgetConfig, value: unknown, active: boolean) {
  const mappedLabel = resolveMappedLabel(config, value);
  if (mappedLabel) {
    return mappedLabel;
  }

  if (active && config.onLabel) {
    return config.onLabel;
  }
  if (!active && config.offLabel) {
    return config.offLabel;
  }

  if (config.format === "number" || config.format === "text") {
    return String(value);
  }

  return active ? "Ein" : "Aus";
}

function resolveMappedLabel(config: StateWidgetConfig, value: unknown) {
  if (!config.valueLabels || value === null || value === undefined) {
    return null;
  }

  const key = config.format === "number" ? String(asNumber(value)) : String(value);
  return config.valueLabels[key] || null;
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

function normalizeStateComparisonValue(config: StateWidgetConfig, value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return "null";
  }

  if (config.format === "number") {
    const numeric = asNumber(value);
    return numeric === null ? undefined : String(numeric);
  }

  if (config.format === "text") {
    return String(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "on") {
      return "true";
    }
    if (normalized === "false" || normalized === "0" || normalized === "off") {
      return "false";
    }
  }

  return String(Boolean(value));
}

function parseStateValue(config: StateWidgetConfig, raw: string) {
  if (config.format === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (config.format === "text") {
    return raw;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "off") {
    return false;
  }
  return raw;
}

function defaultStateValue(config: StateWidgetConfig, active: boolean) {
  if (config.format === "number") {
    return active ? "1" : "0";
  }
  if (config.format === "text") {
    return active ? "on" : "off";
  }
  return active ? "true" : "false";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  containerWithTitle: {
    paddingTop: 24,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    color: palette.textMuted,
    fontSize: 16,
    marginTop: 14,
    textAlign: "center",
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
