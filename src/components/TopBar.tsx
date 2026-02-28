import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { palette } from "../utils/theme";

type TopBarProps = {
  title: string;
  isOnline: boolean;
  isLayoutMode: boolean;
  statusDetail: string;
  onToggleLayoutMode: () => void;
  onOpenSettings: () => void;
  onAddWidget: () => void;
};

export function TopBar({
  title,
  isOnline,
  isLayoutMode,
  statusDetail,
  onToggleLayoutMode,
  onOpenSettings,
  onAddWidget,
}: TopBarProps) {
  return (
    <View style={styles.container}>
      <View>
        <View style={styles.titleRow}>
          <Text style={styles.kicker}>My Home</Text>
          <MaterialCommunityIcons color={palette.text} name="chevron-down" size={18} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, isOnline ? styles.statusOnline : styles.statusOffline]} />
          <Text style={styles.statusText}>{isOnline ? "Verbunden" : "Offline"}</Text>
          <Text numberOfLines={1} style={styles.statusDetail}>
            {statusDetail}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={onToggleLayoutMode}
          style={[styles.actionButton, isLayoutMode ? styles.layoutActiveButton : null]}
        >
          <MaterialCommunityIcons color={palette.text} name="pencil-outline" size={18} />
        </Pressable>
        <Pressable onPress={onAddWidget} style={styles.actionButton}>
          <MaterialCommunityIcons color={palette.text} name="plus" size={18} />
        </Pressable>
        <Pressable onPress={onOpenSettings} style={styles.actionButton}>
          <MaterialCommunityIcons color={palette.text} name="cog-outline" size={18} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 26,
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: "transparent",
    borderWidth: 0,
    zIndex: 30,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  kicker: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "800",
  },
  title: {
    color: palette.textMuted,
    fontSize: 0,
    marginTop: 0,
    height: 0,
  },
  statusRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 420,
    opacity: 0.75,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 99,
  },
  statusOnline: {
    backgroundColor: palette.accent,
  },
  statusOffline: {
    backgroundColor: palette.danger,
  },
  statusText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "700",
  },
  statusDetail: {
    color: palette.textMuted,
    fontSize: 12,
    flexShrink: 1,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    alignSelf: "flex-start",
  },
  actionButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  layoutActiveButton: {
    backgroundColor: "rgba(92, 124, 255, 0.16)",
    borderColor: "rgba(92, 124, 255, 0.3)",
  },
});
