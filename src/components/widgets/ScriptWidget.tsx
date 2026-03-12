import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { IoBrokerClient } from "../../services/iobroker";
import { IoBrokerScriptEntry, ScriptWidgetConfig } from "../../types/dashboard";
import { palette } from "../../utils/theme";

type ScriptWidgetProps = {
  config: ScriptWidgetConfig;
  client: IoBrokerClient;
};

export function ScriptWidget({ config, client }: ScriptWidgetProps) {
  const [entries, setEntries] = useState<IoBrokerScriptEntry[]>([]);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const textColor = config.appearance?.textColor || palette.text;
  const mutedTextColor = config.appearance?.mutedTextColor || palette.textMuted;
  const refreshMs = clampInt(config.refreshMs, 3000, 500);
  const maxEntries = clampInt(config.maxEntries, 120, 1);
  const instanceFilter = (config.instanceFilter || "").trim();
  const textFilter = (config.textFilter || "").trim();

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let pendingSync = false;

    const sync = async () => {
      if (inFlight) {
        pendingSync = true;
        return;
      }
      inFlight = true;
      try {
        const scripts = await client.listScripts({
          limit: maxEntries,
          instance: instanceFilter,
          contains: textFilter,
        });
        if (active) {
          setEntries(scripts);
          setError(null);
        }
      } catch (syncError) {
        if (active) {
          setError(syncError instanceof Error ? syncError.message : "Skripte konnten nicht geladen werden");
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
  }, [client, instanceFilter, maxEntries, refreshMs, textFilter]);

  const statusText = useMemo(() => {
    if (error) {
      return error;
    }
    return `${entries.length} Skripte`;
  }, [entries.length, error]);

  const toggleScript = async (entry: IoBrokerScriptEntry) => {
    if (pending[entry.stateId]) {
      return;
    }

    setPending((current) => ({ ...current, [entry.stateId]: true }));
    setEntries((current) =>
      current.map((row) =>
        row.stateId === entry.stateId
          ? {
              ...row,
              enabled: !entry.enabled,
            }
          : row
      )
    );

    try {
      await client.writeState(entry.stateId, !entry.enabled);
      setError(null);
    } catch (toggleError) {
      setEntries((current) =>
        current.map((row) =>
          row.stateId === entry.stateId
            ? {
                ...row,
                enabled: entry.enabled,
              }
            : row
        )
      );
      setError(toggleError instanceof Error ? toggleError.message : "Skript konnte nicht geschaltet werden");
    } finally {
      setPending((current) => ({ ...current, [entry.stateId]: false }));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.metaRow}>
        <Text numberOfLines={1} style={[styles.metaText, { color: mutedTextColor }]}>
          {instanceFilter || "Alle Instanzen"}
        </Text>
        <Text numberOfLines={1} style={[styles.metaText, { color: error ? palette.danger : mutedTextColor }]}>
          {statusText}
        </Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {!entries.length ? (
          <Text style={[styles.empty, { color: mutedTextColor }]}>Keine JavaScript-Skripte gefunden.</Text>
        ) : null}
        {entries.map((entry) => {
          const isPending = Boolean(pending[entry.stateId]);
          const icon = entry.enabled ? "pause-circle-outline" : "play-circle-outline";
          const iconColor = entry.enabled ? "#f8c16f" : "#95e9b8";
          return (
            <View key={entry.stateId} style={styles.row}>
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={[styles.name, { color: textColor }]}>
                  {entry.name}
                </Text>
                <Text numberOfLines={1} style={[styles.instance, { color: mutedTextColor }]}>
                  {entry.instance}
                </Text>
              </View>
              <Pressable
                disabled={isPending}
                onPress={() => {
                  void toggleScript(entry);
                }}
                style={[
                  styles.actionButton,
                  isPending ? styles.actionButtonDisabled : null,
                ]}
              >
                <MaterialCommunityIcons color={iconColor} name={icon} size={22} />
              </Pressable>
            </View>
          );
        })}
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
    maxWidth: "48%",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  empty: {
    fontSize: 12,
    fontWeight: "600",
    paddingVertical: 6,
  },
  row: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
  },
  instance: {
    fontSize: 11,
    fontWeight: "600",
  },
  actionButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
});
