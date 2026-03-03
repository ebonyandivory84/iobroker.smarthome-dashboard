import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SoundPickerField } from "./SoundPickerField";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { UiSoundSet } from "../types/dashboard";
import { palette } from "../utils/theme";

type SettingsModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const {
    config,
    rawJson,
    resetConfig,
    updateConfigFromJson,
    savedDashboards,
    refreshSavedDashboards,
    saveNamedDashboard,
    loadNamedDashboard,
    deleteNamedDashboard,
  } = useDashboardConfig();
  const [draft, setDraft] = useState(rawJson);
  const [dashboardName, setDashboardName] = useState("");
  const [homeLabel, setHomeLabel] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState("55");
  const [soundSet, setSoundSet] = useState<UiSoundSet>("voyager");
  const [pageTabSounds, setPageTabSounds] = useState<string[]>([]);
  const [pageSwipeSounds, setPageSwipeSounds] = useState<string[]>([]);
  const [pageContentScrollSounds, setPageContentScrollSounds] = useState<string[]>([]);
  const [layoutToggleSounds, setLayoutToggleSounds] = useState<string[]>([]);
  const [addWidgetSounds, setAddWidgetSounds] = useState<string[]>([]);
  const [openSettingsSounds, setOpenSettingsSounds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setDraft(rawJson);
    setDashboardName(config.title || "");
    setHomeLabel(config.homeLabel || "My Home");
    setSoundEnabled(config.uiSounds?.enabled !== false);
    setSoundVolume(String(config.uiSounds?.volume ?? 55));
    setSoundSet(config.uiSounds?.soundSet || "voyager");
    setPageTabSounds(config.uiSounds?.pageSounds?.tabPress || []);
    setPageSwipeSounds(config.uiSounds?.pageSounds?.swipe || []);
    setPageContentScrollSounds(config.uiSounds?.pageSounds?.contentScroll || []);
    setLayoutToggleSounds(config.uiSounds?.pageSounds?.layoutToggle || []);
    setAddWidgetSounds(config.uiSounds?.pageSounds?.addWidget || []);
    setOpenSettingsSounds(config.uiSounds?.pageSounds?.openSettings || []);
    setError(null);
    refreshSavedDashboards();
  }, [config.homeLabel, config.title, rawJson, visible]);

  const save = () => {
    let nextDraft = draft;
    const normalizedVolume = Number.parseInt(soundVolume, 10);

    if (!Number.isFinite(normalizedVolume)) {
      setError("Lautstaerke muss eine Zahl von 0 bis 100 sein");
      return;
    }

    try {
      const parsed = JSON.parse(draft) as Record<string, unknown>;
      parsed.homeLabel = (homeLabel || "").trim() || "My Home";
      parsed.uiSounds = {
        enabled: soundEnabled,
        volume: Math.max(0, Math.min(100, normalizedVolume)),
        soundSet,
        pageSounds: {
          tabPress: pageTabSounds,
          swipe: pageSwipeSounds,
          contentScroll: pageContentScrollSounds,
          layoutToggle: layoutToggleSounds,
          addWidget: addWidgetSounds,
          openSettings: openSettingsSounds,
        },
      };
      nextDraft = JSON.stringify(parsed, null, 2);
    } catch {
      // Let the existing JSON validation path surface the error.
    }

    const result = updateConfigFromJson(nextDraft);
    if (!result.ok) {
      setError(result.error || "JSON invalid");
      return;
    }
    onClose();
  };

  const saveCurrentAsNamed = async () => {
    const result = await saveNamedDashboard(dashboardName);
    if (!result.ok) {
      setError(result.error || "Dashboard speichern fehlgeschlagen");
      return;
    }
    setError(null);
  };

  const loadSaved = async (name: string) => {
    const result = await loadNamedDashboard(name);
    if (!result.ok) {
      setError(result.error || "Dashboard laden fehlgeschlagen");
      return;
    }
    setError(null);
    onClose();
  };

  const removeSaved = async (name: string) => {
    const result = await deleteNamedDashboard(name);
    if (!result.ok) {
      setError(result.error || "Dashboard loeschen fehlgeschlagen");
      return;
    }
    setError(null);
  };

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.modalScrollContent} style={styles.modalScroll}>
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
              <MetaPill label="Home" value={config.homeLabel || "My Home"} />
              <MetaPill label="Titel" value={config.title} />
              <MetaPill label="Widgets" value={String(config.widgets.length)} />
              <MetaPill label="API" value={config.iobroker.adapterBasePath || "/smarthome-dashboard/api"} />
            </View>
            <View style={styles.libraryCard}>
              <Text style={styles.sectionTitle}>Kopfzeile</Text>
              <TextInput
                onChangeText={setHomeLabel}
                placeholder="Name links oben"
                placeholderTextColor={palette.textMuted}
                style={styles.input}
                value={homeLabel}
              />
            </View>
            <View style={styles.libraryCard}>
              <Text style={styles.sectionTitle}>UI-Sounds</Text>
              <Text style={styles.helperInline}>
                Steuert Tastentoene fuer klickbare Widgets, Seitenwechsel und Kamera-Interaktionen.
              </Text>
              <View style={styles.choiceRow}>
                <Pressable
                  onPress={() => setSoundEnabled(true)}
                  style={[styles.choiceChip, soundEnabled ? styles.choiceChipActive : null]}
                >
                  <Text style={[styles.choiceChipLabel, soundEnabled ? styles.choiceChipLabelActive : null]}>Ein</Text>
                </Pressable>
                <Pressable
                  onPress={() => setSoundEnabled(false)}
                  style={[styles.choiceChip, !soundEnabled ? styles.choiceChipActive : null]}
                >
                  <Text style={[styles.choiceChipLabel, !soundEnabled ? styles.choiceChipLabelActive : null]}>Aus</Text>
                </Pressable>
              </View>
              <View style={styles.soundVolumeRow}>
                <Text style={styles.fieldLabel}>Lautstaerke (0-100)</Text>
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={setSoundVolume}
                  placeholder="55"
                  placeholderTextColor={palette.textMuted}
                  style={[styles.input, styles.volumeInput]}
                  value={soundVolume}
                />
              </View>
              <View style={styles.soundSetBlock}>
                <Text style={styles.fieldLabel}>Soundset</Text>
                <View style={styles.choiceRow}>
                  {([
                    { key: "voyager", label: "Voyager" },
                    { key: "ops", label: "Ops" },
                    { key: "soft", label: "Soft" },
                  ] as const).map((option) => (
                    <Pressable
                      key={option.key}
                      onPress={() => setSoundSet(option.key)}
                      style={[styles.choiceChip, soundSet === option.key ? styles.choiceChipActive : null]}
                    >
                      <Text
                        style={[
                          styles.choiceChipLabel,
                          soundSet === option.key ? styles.choiceChipLabelActive : null,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.soundSetBlock}>
                <Text style={styles.fieldLabel}>Seiten-Tabs</Text>
                <SoundPickerField onChange={setPageTabSounds} value={pageTabSounds} />
              </View>
              <View style={styles.soundSetBlock}>
                <Text style={styles.fieldLabel}>Dashboard wischen</Text>
                <SoundPickerField onChange={setPageSwipeSounds} value={pageSwipeSounds} />
              </View>
            <View style={styles.soundSetBlock}>
              <Text style={styles.fieldLabel}>Seite scrollen</Text>
              <SoundPickerField onChange={setPageContentScrollSounds} value={pageContentScrollSounds} />
            </View>
            <View style={styles.soundSetBlock}>
              <Text style={styles.fieldLabel}>Stift / Layout</Text>
              <SoundPickerField onChange={setLayoutToggleSounds} value={layoutToggleSounds} />
            </View>
            <View style={styles.soundSetBlock}>
              <Text style={styles.fieldLabel}>Plus / Widget</Text>
              <SoundPickerField onChange={setAddWidgetSounds} value={addWidgetSounds} />
            </View>
            <View style={styles.soundSetBlock}>
              <Text style={styles.fieldLabel}>Zahnrad / Einstellungen</Text>
              <SoundPickerField onChange={setOpenSettingsSounds} value={openSettingsSounds} />
            </View>
          </View>
            <View style={styles.libraryCard}>
              <Text style={styles.sectionTitle}>Gespeicherte Dashboards</Text>
              <View style={styles.saveRow}>
                <TextInput
                  onChangeText={setDashboardName}
                  placeholder="Dashboard-Name"
                  placeholderTextColor={palette.textMuted}
                  style={[styles.input, styles.nameInput]}
                  value={dashboardName}
                />
                <Pressable onPress={saveCurrentAsNamed} style={[styles.button, styles.secondaryButton]}>
                  <Text style={styles.secondaryLabel}>Unter Namen speichern</Text>
                </Pressable>
              </View>
              <View style={styles.savedList}>
                {savedDashboards.length ? (
                  savedDashboards.map((name) => (
                    <View key={name} style={styles.savedItem}>
                      <Text numberOfLines={1} style={styles.savedName}>
                        {name}
                      </Text>
                      <View style={styles.savedActions}>
                        <Pressable onPress={() => loadSaved(name)} style={[styles.button, styles.primaryButtonSmall]}>
                          <Text style={styles.primaryLabel}>Laden</Text>
                        </Pressable>
                        <Pressable onPress={() => removeSaved(name)} style={[styles.button, styles.warningButtonSmall]}>
                          <Text style={styles.warningLabel}>Loeschen</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>Noch keine Dashboards im Adapter gespeichert.</Text>
                )}
              </View>
            </View>
            <View style={styles.editorWrap}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                onChangeText={setDraft}
                style={styles.editor}
                textAlignVertical="top"
                value={draft}
              />
            </View>
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
        </ScrollView>
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
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  card: {
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
  libraryCard: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: palette.border,
    gap: 12,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "800",
  },
  helperInline: {
    color: palette.textMuted,
    lineHeight: 18,
  },
  fieldLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  choiceChip: {
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceChipActive: {
    backgroundColor: palette.accent,
    borderColor: "rgba(77, 226, 177, 0.55)",
  },
  choiceChipLabel: {
    color: palette.text,
    fontWeight: "700",
  },
  choiceChipLabelActive: {
    color: "#041019",
  },
  soundVolumeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  volumeInput: {
    minWidth: 96,
    textAlign: "center",
  },
  soundSetBlock: {
    gap: 8,
  },
  saveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  nameInput: {
    flex: 1,
    minWidth: 220,
  },
  savedList: {
    gap: 10,
  },
  savedItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 2,
  },
  savedName: {
    flex: 1,
    color: palette.text,
    fontWeight: "700",
  },
  savedActions: {
    flexDirection: "row",
    gap: 8,
  },
  emptyText: {
    color: palette.textMuted,
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
    marginTop: 2,
  },
  input: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: palette.text,
    backgroundColor: "rgba(6, 12, 20, 0.9)",
    borderWidth: 1,
    borderColor: palette.border,
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
  primaryButtonSmall: {
    backgroundColor: palette.accent,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warningButtonSmall: {
    backgroundColor: "rgba(247, 181, 74, 0.22)",
    paddingHorizontal: 12,
    paddingVertical: 10,
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
