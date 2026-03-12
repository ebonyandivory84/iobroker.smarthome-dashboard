import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { IoBrokerClient } from "../../services/iobroker";
import { IoBrokerLogEntry, LogWidgetConfig } from "../../types/dashboard";
import { palette } from "../../utils/theme";

type LogWidgetProps = {
  config: LogWidgetConfig;
  client: IoBrokerClient;
};

const SEVERITY_ORDER: Record<NonNullable<LogWidgetConfig["minSeverity"]>, number> = {
  silly: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const MONO_FONT = Platform.select({
  web: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  default: "monospace",
});

export function LogWidget({ config, client }: LogWidgetProps) {
  const [entries, setEntries] = useState<IoBrokerLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const textColor = config.appearance?.textColor || palette.text;
  const mutedTextColor = config.appearance?.mutedTextColor || palette.textMuted;
  const refreshMs = clampInt(config.refreshMs, 2000, 500);
  const maxEntries = clampInt(config.maxEntries, 80, 5);
  const minSeverity = normalizeSeverity(config.minSeverity);
  const sourceFilter = (config.sourceFilter || "").trim();
  const textFilter = (config.textFilter || "").trim();

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let pending = false;

    const sync = async () => {
      if (inFlight) {
        pending = true;
        return;
      }

      inFlight = true;
      try {
        const logs = await client.readLogs({
          limit: maxEntries,
          minSeverity,
          source: sourceFilter,
          contains: textFilter,
        });
        if (active) {
          setEntries(logs);
          setError(null);
        }
      } catch (syncError) {
        if (active) {
          setError(syncError instanceof Error ? syncError.message : "Logs konnten nicht geladen werden");
        }
      } finally {
        inFlight = false;
        if (active && pending) {
          pending = false;
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
  }, [client, maxEntries, minSeverity, refreshMs, sourceFilter, textFilter]);

  const statusText = useMemo(() => {
    if (error) {
      return error;
    }
    if (!entries.length) {
      return "Keine Log-Eintraege gefunden";
    }
    return `${entries.length} Eintraege`;
  }, [entries.length, error]);

  return (
    <View style={styles.container}>
      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: mutedTextColor }]}>
          Level: {minSeverity.toUpperCase()}
        </Text>
        <Text style={[styles.metaText, { color: error ? palette.danger : mutedTextColor }]}>
          {statusText}
        </Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {entries.map((entry) => (
          <View key={`${entry.id}-${entry.ts}-${entry.from}`} style={styles.row}>
            <Text style={[styles.timestamp, { color: mutedTextColor }]}>{formatTimestamp(entry.ts)}</Text>
            <Text style={[styles.severity, { color: colorForSeverity(entry.severity) }]}>
              {entry.severity.toUpperCase()}
            </Text>
            <Text numberOfLines={1} style={[styles.source, { color: mutedTextColor }]}>
              {entry.from || "unknown"}
            </Text>
            <Text style={[styles.message, { color: textColor }]}>{entry.message}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function clampInt(value: number | undefined, fallback: number, min: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.round(value));
}

function normalizeSeverity(value: LogWidgetConfig["minSeverity"]) {
  if (value && value in SEVERITY_ORDER) {
    return value;
  }
  return "info";
}

function formatTimestamp(value: number) {
  if (!Number.isFinite(value)) {
    return "--:--:--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }

  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function colorForSeverity(value: IoBrokerLogEntry["severity"]) {
  if (value === "error") {
    return "#ff7d7d";
  }
  if (value === "warn") {
    return "#f8c16f";
  }
  if (value === "debug" || value === "silly") {
    return "#87b8ff";
  }
  return "#95e9b8";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(6, 10, 18, 0.5)",
    overflow: "hidden",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(5, 8, 14, 0.55)",
  },
  metaText: {
    fontSize: 11,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  row: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 3,
  },
  timestamp: {
    fontSize: 11,
    fontFamily: MONO_FONT,
  },
  severity: {
    fontSize: 11,
    fontWeight: "800",
    fontFamily: MONO_FONT,
  },
  source: {
    fontSize: 11,
    fontFamily: MONO_FONT,
  },
  message: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: MONO_FONT,
  },
});
