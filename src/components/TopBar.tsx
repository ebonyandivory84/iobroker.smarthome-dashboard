import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { palette } from "../utils/theme";

type TopBarProps = {
  title: string;
  pageTitles: Array<{ id: string; title: string }>;
  activePageId: string;
  isOnline: boolean;
  isLayoutMode: boolean;
  statusDetail: string;
  onToggleLayoutMode: () => void;
  onOpenSettings: () => void;
  onAddWidget: () => void;
  onSelectPage: (pageId: string) => void;
};

export function TopBar({
  title,
  pageTitles,
  activePageId,
  isOnline,
  isLayoutMode,
  statusDetail,
  onToggleLayoutMode,
  onOpenSettings,
  onAddWidget,
  onSelectPage,
}: TopBarProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 700;

  return (
    <View style={[styles.container, isCompact ? styles.containerCompact : null]}>
      <View>
        <View style={styles.titleRow}>
          <Text style={styles.kicker}>My Home</Text>
          <View style={styles.pageTabs}>
            {pageTitles
              .filter((page) => page.id !== activePageId)
              .map((page) => (
                <Pressable
                  key={page.id}
                  onPress={() => onSelectPage(page.id)}
                  style={styles.pageTab}
                >
                  <Text numberOfLines={1} style={styles.pageTabLabel}>
                    {page.title}
                  </Text>
                </Pressable>
              ))}
          </View>
        </View>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.statusRow, isCompact ? styles.statusRowCompact : null]}>
          <View style={[styles.statusDot, isOnline ? styles.statusOnline : styles.statusOffline]} />
          <Text style={styles.statusText}>{isOnline ? "Verbunden" : "Offline"}</Text>
          <Text numberOfLines={1} style={styles.statusDetail}>
            {statusDetail}
          </Text>
        </View>
      </View>
      <View style={[styles.actions, isCompact ? styles.actionsCompact : null]}>
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
  containerCompact: {
    marginHorizontal: 10,
    marginTop: 10,
    paddingHorizontal: 8,
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  kicker: {
    color: palette.text,
    fontSize: 22,
    fontWeight: "800",
  },
  title: {
    color: palette.textMuted,
    fontSize: 13,
    marginTop: 4,
    fontWeight: "700",
  },
  pageTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    flexShrink: 1,
  },
  pageTab: {
    maxWidth: 132,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  pageTabLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  statusRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 420,
    opacity: 0.75,
  },
  statusRowCompact: {
    flexWrap: "wrap",
    maxWidth: "100%",
    rowGap: 4,
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
  actionsCompact: {
    alignSelf: "flex-end",
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
