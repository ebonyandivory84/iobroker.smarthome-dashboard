import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { BackgroundMode } from "../types/dashboard";
import { palette } from "../utils/theme";

type SettingsModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const { config, patchConfig, rawJson, resetConfig, updateConfigFromJson } = useDashboardConfig();
  const [draft, setDraft] = useState(rawJson);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDraft(rawJson);
      setError(null);
    }
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
            Hier konfigurierst du ioBroker URL, Hintergrund, Grid und alle Widgets direkt als JSON.
          </Text>
          <View style={styles.quickForm}>
            <Field label="Titel">
              <TextInput
                onChangeText={(value) => patchConfig({ title: value })}
                style={styles.input}
                value={config.title}
              />
            </Field>
            <Field label="ioBroker URL">
              <TextInput
                autoCapitalize="none"
                onChangeText={(value) =>
                  patchConfig({
                    iobroker: {
                      ...config.iobroker,
                      baseUrl: value,
                    },
                  })
                }
                style={styles.input}
                value={config.iobroker.baseUrl}
              />
            </Field>
            <Field label="Polling (ms)">
              <TextInput
                keyboardType="numeric"
                onChangeText={(value) => patchConfig({ pollingMs: Number(value) || config.pollingMs })}
                style={styles.input}
                value={String(config.pollingMs)}
              />
            </Field>
            <View style={styles.colorRow}>
              <Field label="Spalten">
                <TextInput
                  keyboardType="numeric"
                  onChangeText={(value) =>
                    patchConfig({
                      grid: {
                        ...config.grid,
                        columns: Math.max(1, Number(value) || config.grid.columns),
                      },
                    })
                  }
                  style={styles.input}
                  value={String(config.grid.columns)}
                />
              </Field>
              <Field label="Row Height">
                <TextInput
                  keyboardType="numeric"
                  onChangeText={(value) =>
                    patchConfig({
                      grid: {
                        ...config.grid,
                        rowHeight: Math.max(40, Number(value) || config.grid.rowHeight),
                      },
                    })
                  }
                  style={styles.input}
                  value={String(config.grid.rowHeight)}
                />
              </Field>
              <Field label="Gap">
                <TextInput
                  keyboardType="numeric"
                  onChangeText={(value) =>
                    patchConfig({
                      grid: {
                        ...config.grid,
                        gap: Math.max(0, Number(value) || config.grid.gap),
                      },
                    })
                  }
                  style={styles.input}
                  value={String(config.grid.gap)}
                />
              </Field>
            </View>
            <Field label="Hintergrund">
              <View style={styles.modeRow}>
                {(["mesh", "gradient", "solid"] as BackgroundMode[]).map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => patchConfig({ backgroundMode: mode })}
                    style={[styles.modeButton, config.backgroundMode === mode ? styles.modeButtonActive : null]}
                  >
                    <Text style={styles.modeLabel}>{mode}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>
            <View style={styles.colorRow}>
              <Field label="Basisfarbe">
                <TextInput
                  autoCapitalize="none"
                  onChangeText={(value) => patchConfig({ backgroundColor: value })}
                  style={styles.input}
                  value={config.backgroundColor}
                />
              </Field>
              <Field label="Akzent">
                <TextInput
                  autoCapitalize="none"
                  onChangeText={(value) => patchConfig({ backgroundAccent: value })}
                  style={styles.input}
                  value={config.backgroundAccent}
                />
              </Field>
            </View>
          </View>
          <ScrollView style={styles.editorWrap}>
            <TextInput
              multiline
              onChangeText={setDraft}
              style={styles.editor}
              value={draft}
              autoCapitalize="none"
              autoCorrect={false}
              textAlignVertical="top"
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
              <Text style={styles.buttonLabel}>Abbrechen</Text>
            </Pressable>
            <Pressable onPress={save} style={[styles.button, styles.primaryButton]}>
              <Text style={styles.buttonLabel}>Speichern</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
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
    fontWeight: "600",
  },
  helper: {
    color: palette.textMuted,
    marginTop: 10,
    marginBottom: 12,
    lineHeight: 20,
  },
  quickForm: {
    gap: 10,
    marginBottom: 14,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: palette.text,
    backgroundColor: "rgba(6, 12, 20, 0.9)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeButton: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  modeButtonActive: {
    backgroundColor: "rgba(77, 226, 177, 0.12)",
    borderColor: "rgba(77, 226, 177, 0.3)",
  },
  modeLabel: {
    color: palette.text,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  colorRow: {
    flexDirection: "row",
    gap: 10,
  },
  editorWrap: {
    flex: 1,
  },
  editor: {
    minHeight: 480,
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
  buttonLabel: {
    color: "#041019",
    fontWeight: "800",
  },
});
