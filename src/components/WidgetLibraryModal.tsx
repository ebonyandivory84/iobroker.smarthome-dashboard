import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { WidgetType } from "../types/dashboard";
import { palette } from "../utils/theme";

type WidgetLibraryModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelectType: (type: WidgetType) => void;
};

const OPTIONS: Array<{
  type: WidgetType;
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}> = [
  {
    type: "state",
    title: "State",
    description: "Schalter, Sensoren und boolesche ioBroker-States lesen und schreiben.",
    icon: "toggle-switch-outline",
  },
  {
    type: "camera",
    title: "Kamera",
    description: "Snapshot-URL pollen und optional RTSP-Link einbinden.",
    icon: "cctv",
  },
  {
    type: "energy",
    title: "Energiefluss",
    description: "Kompakter Energiefluss fuer PV, Haus, Batterie und Netz.",
    icon: "transmission-tower-export",
  },
  {
    type: "solar",
    title: "Solar",
    description: "Erweitertes Solar-Widget fuer EKD/PV-Anlagen mit Tageswerten.",
    icon: "solar-power",
  },
];

export function WidgetLibraryModal({
  visible,
  onClose,
  onSelectType,
}: WidgetLibraryModalProps) {
  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Widget-Bibliothek</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.close}>Schliessen</Text>
            </Pressable>
          </View>
          <View style={styles.grid}>
            {OPTIONS.map((option) => (
              <Pressable
                key={option.type}
                onPress={() => {
                  onSelectType(option.type);
                  onClose();
                }}
                style={styles.option}
              >
                <View style={styles.iconWrap}>
                  <MaterialCommunityIcons color={palette.accent} name={option.icon} size={28} />
                </View>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionText}>{option.description}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    padding: 22,
  },
  card: {
    borderRadius: 24,
    backgroundColor: palette.panelStrong,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "800",
  },
  close: {
    color: palette.textMuted,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  option: {
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 170,
    borderRadius: 18,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(77, 226, 177, 0.08)",
  },
  optionTitle: {
    marginTop: 14,
    color: palette.text,
    fontSize: 18,
    fontWeight: "800",
  },
  optionText: {
    marginTop: 8,
    color: palette.textMuted,
    lineHeight: 20,
  },
});
