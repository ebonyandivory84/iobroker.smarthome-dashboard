import { createElement } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { RaspberryPiStatsWidgetConfig, StateSnapshot } from "../../types/dashboard";
import { palette } from "../../utils/theme";

type RaspberryPiStatsWidgetProps = {
  config: RaspberryPiStatsWidgetConfig;
  states: StateSnapshot;
};

export function RaspberryPiStatsWidget({ config, states }: RaspberryPiStatsWidgetProps) {
  const textColor = config.appearance?.textColor || palette.text;
  const mutedTextColor = config.appearance?.mutedTextColor || palette.textMuted;
  const panelStart = config.appearance?.widgetColor || "rgba(12, 26, 52, 0.95)";
  const panelEnd = config.appearance?.widgetColor2 || "rgba(6, 14, 28, 0.98)";
  const cardStart = config.appearance?.cardColor || "rgba(108, 232, 180, 0.26)";
  const cardEnd = config.appearance?.cardColor2 || "rgba(255,255,255,0.1)";
  const cpuBarStart = config.appearance?.activeWidgetColor || "#65d6ff";
  const cpuBarEnd = config.appearance?.activeWidgetColor2 || "#4d86ff";
  const tempBarStart = config.appearance?.inactiveWidgetColor || "#ffcb67";
  const tempBarEnd = config.appearance?.inactiveWidgetColor2 || "#ff7f66";
  const statusBadgeStart = config.appearance?.statColor || "rgba(130, 182, 255, 0.24)";
  const statusBadgeEnd = config.appearance?.statColor2 || "rgba(89, 132, 238, 0.18)";

  const online = normalizeBoolean(states[config.onlineStateId]);
  const cpuLoad = normalizePercent(states[config.cpuLoadStateId]);
  const cpuTemp = normalizeTemperature(states[config.cpuTempStateId]);
  const ramFreePercent = normalizePercent(states[config.ramFreeStateId]);
  const diskFreePercent = normalizePercent(states[config.diskFreeStateId]);
  const ramFreeLabel = formatFreeValue(states[config.ramFreeStateId], ramFreePercent);
  const diskFreeLabel = formatFreeValue(states[config.diskFreeStateId], diskFreePercent);
  const cpuLoadLabel = cpuLoad === null ? "n/a" : `${cpuLoad.toFixed(1)} %`;
  const cpuTempLabel = cpuTemp === null ? "n/a" : `${cpuTemp.toFixed(1)} C`;
  const headerLabel = (config.label || config.title || "Raspberry Pi").trim() || "Raspberry Pi";

  return (
    <View style={styles.container}>
      <View style={[styles.panel, { backgroundColor: panelStart }]}>
        {Platform.OS === "web"
          ? createElement("div", {
              style: {
                ...webGradientStyle,
                background: `linear-gradient(135deg, ${panelStart} 0%, ${panelEnd} 100%)`,
              },
            })
          : null}

        <View style={styles.headerRow}>
          <Text numberOfLines={1} style={[styles.hostTitle, { color: textColor }]}>
            {headerLabel}
          </Text>
          <View
            style={[
              styles.statusBadge,
              Platform.OS !== "web"
                ? { backgroundColor: statusBadgeStart }
                : null,
            ]}
          >
            {Platform.OS === "web"
              ? createElement("div", {
                  style: {
                    ...webGradientStyle,
                    borderRadius: 999,
                    background: `linear-gradient(120deg, ${statusBadgeStart}, ${statusBadgeEnd})`,
                  },
                })
              : null}
            <Text style={[styles.statusBadgeLabel, { color: textColor }]}>
              {online === null ? "Status: n/a" : online ? "Status: Online" : "Status: Offline"}
            </Text>
          </View>
        </View>

        <View style={styles.topRow}>
          <MetricCard
            barEnd={cardEnd}
            barStart={cardStart}
            label="RAM frei"
            ratio={ramFreePercent === null ? null : ramFreePercent / 100}
            textColor={textColor}
            mutedTextColor={mutedTextColor}
            value={ramFreeLabel}
          />
          <MetricCard
            barEnd={cardEnd}
            barStart={cardStart}
            label="Disk frei"
            ratio={diskFreePercent === null ? null : diskFreePercent / 100}
            textColor={textColor}
            mutedTextColor={mutedTextColor}
            value={diskFreeLabel}
          />
        </View>

        <HorizontalMetricBar
          endColor={cpuBarEnd}
          label="CPU Last"
          mutedTextColor={mutedTextColor}
          ratio={cpuLoad === null ? null : cpuLoad / 100}
          startColor={cpuBarStart}
          textColor={textColor}
          valueLabel={cpuLoadLabel}
        />

        <HorizontalMetricBar
          endColor={tempBarEnd}
          label="CPU Temperatur"
          mutedTextColor={mutedTextColor}
          ratio={cpuTemp === null ? null : clampNumber(cpuTemp / 100, 0, 1)}
          startColor={tempBarStart}
          textColor={textColor}
          valueLabel={cpuTempLabel}
        />

        <Text numberOfLines={1} style={[styles.footerText, { color: mutedTextColor }]}>
          Datenquellen: konfigurierbare ioBroker-Datenpunkte
        </Text>
      </View>
    </View>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  ratio: number | null;
  barStart: string;
  barEnd: string;
  textColor: string;
  mutedTextColor: string;
};

function MetricCard({
  label,
  value,
  ratio,
  barStart,
  barEnd,
  textColor,
  mutedTextColor,
}: MetricCardProps) {
  const fillRatio = ratio === null ? 0 : clampNumber(ratio, 0, 1);
  const percentLabel = ratio === null ? "-" : `${Math.round(fillRatio * 100)}%`;

  return (
    <View style={styles.metricCard}>
      <Text numberOfLines={1} style={[styles.metricValue, { color: textColor }]}>
        {value}
      </Text>
      <Text style={[styles.metricLabel, { color: mutedTextColor }]}>{label}</Text>
      <View style={styles.metricTrack}>
        {Platform.OS === "web"
          ? createElement("div", {
              style: {
                ...webBarFillStyle,
                width: `${Math.max(0, Math.min(100, fillRatio * 100))}%`,
                background: `linear-gradient(90deg, ${barStart} 0%, ${barEnd} 100%)`,
              },
            })
          : (
              <View
                style={[
                  styles.nativeBarFill,
                  {
                    width: `${Math.max(0, Math.min(100, fillRatio * 100))}%`,
                    backgroundColor: barStart,
                  },
                ]}
              />
            )}
      </View>
      <Text style={[styles.metricMeta, { color: mutedTextColor }]}>{percentLabel}</Text>
    </View>
  );
}

type HorizontalMetricBarProps = {
  label: string;
  valueLabel: string;
  ratio: number | null;
  startColor: string;
  endColor: string;
  textColor: string;
  mutedTextColor: string;
};

function HorizontalMetricBar({
  label,
  valueLabel,
  ratio,
  startColor,
  endColor,
  textColor,
  mutedTextColor,
}: HorizontalMetricBarProps) {
  const fillRatio = ratio === null ? 0 : clampNumber(ratio, 0, 1);

  return (
    <View style={styles.barBlock}>
      <View style={styles.barHeader}>
        <Text style={[styles.barLabel, { color: mutedTextColor }]}>{label}</Text>
        <Text style={[styles.barValue, { color: textColor }]}>{valueLabel}</Text>
      </View>
      <View style={styles.barTrack}>
        {Platform.OS === "web"
          ? createElement("div", {
              style: {
                ...webBarFillStyle,
                width: `${Math.max(0, Math.min(100, fillRatio * 100))}%`,
                background: `linear-gradient(90deg, ${startColor} 0%, ${endColor} 100%)`,
              },
            })
          : (
              <View
                style={[
                  styles.nativeBarFill,
                  {
                    width: `${Math.max(0, Math.min(100, fillRatio * 100))}%`,
                    backgroundColor: startColor,
                  },
                ]}
              />
            )}
      </View>
    </View>
  );
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "on" || normalized === "online") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "off" || normalized === "offline") {
    return false;
  }
  return null;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    if (!normalized) {
      return null;
    }
    const direct = Number(normalized);
    if (Number.isFinite(direct)) {
      return direct;
    }
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function normalizePercent(value: unknown) {
  const numeric = normalizeNumber(value);
  if (numeric === null) {
    return null;
  }
  if (numeric >= 0 && numeric <= 1.2) {
    return clampNumber(numeric * 100, 0, 100);
  }
  return clampNumber(numeric, 0, 100);
}

function normalizeTemperature(value: unknown) {
  const numeric = normalizeNumber(value);
  if (numeric === null) {
    return null;
  }
  const normalized = numeric > 1000 ? numeric / 1000 : numeric;
  return clampNumber(normalized, 0, 150);
}

function formatFreeValue(value: unknown, percentValue: number | null) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  const numeric = normalizeNumber(value);
  if (numeric === null) {
    return "n/a";
  }

  if (percentValue !== null && numeric >= 0 && numeric <= 100) {
    return `${numeric.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
  }

  if (numeric >= 1024) {
    return formatBytes(numeric);
  }

  return numeric.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return "n/a";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let remaining = value;
  let unitIndex = 0;
  while (remaining >= 1024 && unitIndex < units.length - 1) {
    remaining /= 1024;
    unitIndex += 1;
  }

  const fixed = remaining >= 100 || unitIndex === 0 ? 0 : remaining >= 10 ? 1 : 2;
  return `${remaining.toFixed(fixed)} ${units[unitIndex]}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  panel: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  hostTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
    position: "relative",
  },
  statusBadgeLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  topRow: {
    flexDirection: "row",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 9,
    justifyContent: "center",
    gap: 5,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  metricTrack: {
    height: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  metricMeta: {
    fontSize: 10,
    fontWeight: "600",
  },
  barBlock: {
    gap: 5,
  },
  barHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  barLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  barValue: {
    fontSize: 12,
    fontWeight: "800",
  },
  barTrack: {
    height: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  nativeBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  footerText: {
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
});

const webGradientStyle = {
  position: "absolute" as const,
  inset: 0,
  pointerEvents: "none" as const,
};

const webBarFillStyle = {
  height: "100%",
  borderRadius: "999px",
  minWidth: "0%",
};
