import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { palette } from "../utils/theme";

type SettingsModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const { config, rawJson, resetConfig, updateConfigFromJson } = useDashboardConfig();
  const [draft, setDraft] = useState(rawJson);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setDraft(rawJson);
    setError(null);
  }, [rawJson, visible]);

  const save = () => {
    const result = updateConfigFromJson(draft);
    if (!result.ok) {
      setError(result.error || "JSON invalid");
      return;
    }
    onClose();
  };

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Dashboard JSON</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.close}>Schliessen</Text>
            </Pressable>
          </View>
          <Text style={styles.helper}>
            Die gesamte Dashboard-Konfiguration ist JSON-basiert. Hier bearbeitest du Titel, Grid,
            ioBroker-Ziele, Widget-Typen und alle Widget-Einstellungen direkt in einer Datei.
          </Text>
          <View style={styles.metaRow}>
            <MetaPill label="Titel" value={config.title} />
            <MetaPill label="Widgets" value={String(config.widgets.length)} />
            <MetaPill label="API" value={config.iobroker.adapterBasePath || "/smarthome-dashboard/api"} />
          </View>
          <ScrollView style={styles.editorWrap}>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={setDraft}
              style={styles.editor}
              textAlignVertical="top"
              value={draft}
            />
          </ScrollView>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.footer}>
            <Pressable
              onPress={() => {
                resetConfig();
                onClose();
              }}
              style={[styles.button, styles.warningButton]}
            >
              <Text style={styles.warningLabel}>Demo laden</Text>
            </Pressable>
            <Pressable onPress={onClose} style={[styles.button, styles.secondaryButton]}>
              <Text style={styles.secondaryLabel}>Abbrechen</Text>
            </Pressable>
            <Pressable onPress={save} style={[styles.button, styles.primaryButton]}>
              <Text style={styles.primaryLabel}>Speichern</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.pillValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.74)",
    padding: 22,
    justifyContent: "center",
  },
  card: {
    flex: 1,
    marginVertical: 18,
    borderRadius: 22,
    backgroundColor: palette.panelStrong,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 22,
  },
  close: {
    color: palette.textMuted,
    fontWeight: "700",
  },
  helper: {
    color: palette.textMuted,
    marginTop: 10,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
    marginBottom: 14,
  },
  pill: {
    minWidth: 120,
    maxWidth: "100%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: palette.border,
    gap: 4,
  },
  pillLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  pillValue: {
    color: palette.text,
    fontWeight: "700",
  },
  editorWrap: {
    flex: 1,
  },
  editor: {
    minHeight: 520,
    padding: 14,
    borderRadius: 16,
    color: palette.text,
    backgroundColor: "rgba(6, 12, 20, 0.9)",
    fontFamily: "Courier",
    fontSize: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  error: {
    color: palette.danger,
    marginTop: 10,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  button: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryButton: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  warningButton: {
    backgroundColor: "rgba(247, 181, 74, 0.22)",
  },
  primaryButton: {
    backgroundColor: palette.accent,
  },
  warningLabel: {
    color: palette.text,
    fontWeight: "800",
  },
  secondaryLabel: {
    color: palette.text,
    fontWeight: "800",
  },
  primaryLabel: {
    color: "#041019",
    fontWeight: "800",
  },
});
