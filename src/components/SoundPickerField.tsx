import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LCARS_SOUND_OPTIONS, normalizeSoundSelection, resolveLcarsSoundLabel } from "../utils/lcarsSounds";
import { palette } from "../utils/theme";

type SoundPickerFieldProps = {
  value?: string[];
  onChange: (value: string[]) => void;
  maxItems?: number;
};

export function SoundPickerField({ value, onChange, maxItems = 5 }: SoundPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => normalizeSoundSelection(value, maxItems), [maxItems, value]);

  const toggle = (soundId: string) => {
    const exists = selected.includes(soundId);
    if (exists) {
      onChange(selected.filter((entry) => entry !== soundId));
      return;
    }

    if (selected.length >= maxItems) {
      return;
    }

    onChange([...selected, soundId]);
  };

  return (
    <>
      <View style={styles.fieldWrap}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {selected.length ? selected.map((entry) => resolveLcarsSoundLabel(entry)).join(", ") : "Keine Sounds"}
          </Text>
          <Text style={styles.counter}>
            {selected.length}/{maxItems}
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={() => setOpen(true)} style={[styles.button, styles.primaryButton]}>
            <Text style={styles.primaryLabel}>Sounds waehlen</Text>
          </Pressable>
          {selected.length ? (
            <Pressable onPress={() => onChange([])} style={[styles.button, styles.secondaryButton]}>
              <Text style={styles.secondaryLabel}>Leeren</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Modal animationType="fade" transparent visible={open}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>LCARS Sounds</Text>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={styles.close}>Schliessen</Text>
              </Pressable>
            </View>
            <Text style={styles.helper}>Bis zu {maxItems} Sounds auswaehlen. Die Wiedergabe rotiert dann durch die Auswahl.</Text>
            <ScrollView contentContainerStyle={styles.optionList}>
              {LCARS_SOUND_OPTIONS.map((option) => {
                const active = selected.includes(option.id);
                const disabled = !active && selected.length >= maxItems;

                return (
                  <Pressable
                    key={option.id}
                    onPress={() => toggle(option.id)}
                    style={[
                      styles.option,
                      active ? styles.optionActive : null,
                      disabled ? styles.optionDisabled : null,
                    ]}
                  >
                    <Text style={[styles.optionLabel, active ? styles.optionLabelActive : null]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fieldWrap: {
    gap: 10,
  },
  summaryRow: {
    gap: 8,
  },
  summaryText: {
    color: palette.text,
    lineHeight: 18,
  },
  counter: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  button: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButton: {
    backgroundColor: palette.accent,
  },
  secondaryButton: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  primaryLabel: {
    color: "#041019",
    fontWeight: "800",
  },
  secondaryLabel: {
    color: palette.text,
    fontWeight: "800",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    padding: 24,
    justifyContent: "center",
  },
  card: {
    maxHeight: "80%",
    borderRadius: 22,
    backgroundColor: palette.panelStrong,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 20,
  },
  close: {
    color: palette.textMuted,
    fontWeight: "700",
  },
  helper: {
    color: palette.textMuted,
    lineHeight: 18,
  },
  optionList: {
    gap: 8,
    paddingBottom: 8,
  },
  option: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  optionActive: {
    backgroundColor: palette.accent,
    borderColor: "rgba(77, 226, 177, 0.55)",
  },
  optionDisabled: {
    opacity: 0.45,
  },
  optionLabel: {
    color: palette.text,
    fontWeight: "700",
  },
  optionLabelActive: {
    color: "#041019",
  },
});
