import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { playConfiguredUiSound } from "../utils/uiSounds";
import { palette } from "../utils/theme";

type TopBarProps = {
  homeLabel: string;
  pageTitles: Array<{ id: string; title: string }>;
  activePageId: string;
  isOnline: boolean;
  isLayoutMode: boolean;
  onToggleLayoutMode: () => void;
  onOpenSettings: () => void;
  onAddWidget: () => void;
  onSelectPage: (pageId: string) => void;
  pageTabSounds?: string[];
  layoutToggleSounds?: string[];
  addWidgetSounds?: string[];
  openSettingsSounds?: string[];
};

export function TopBar({
  homeLabel,
  pageTitles,
  activePageId,
  isOnline,
  isLayoutMode,
  onToggleLayoutMode,
  onOpenSettings,
  onAddWidget,
  onSelectPage,
  pageTabSounds,
  layoutToggleSounds,
  addWidgetSounds,
  openSettingsSounds,
}: TopBarProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 700;

  return (
    <View style={[styles.container, isCompact ? styles.containerCompact : null]}>
      <View>
        <View style={styles.titleRow}>
          <Text style={styles.kicker}>{homeLabel}</Text>
          <View style={[styles.statusDot, isOnline ? styles.statusOnline : styles.statusOffline]} />
          <View style={styles.pageTabs}>
            {pageTitles.map((page) => {
              const activePage = page.id === activePageId;
              return (
                <Pressable
                  key={page.id}
                  onPress={() => {
                    playConfiguredUiSound(pageTabSounds, "page", `page-tab:${page.id}`);
                    onSelectPage(page.id);
                  }}
                  style={[styles.pageTab, activePage ? styles.pageTabActive : null]}
                >
                  <Text numberOfLines={1} style={[styles.pageTabLabel, activePage ? styles.pageTabLabelActive : null]}>
                    {page.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <View style={[styles.actions, isCompact ? styles.actionsCompact : null]}>
        <Pressable
          onPress={() => {
            playConfiguredUiSound(layoutToggleSounds, "panel", "topbar:layoutToggle");
            onToggleLayoutMode();
          }}
          style={[styles.actionButton, isLayoutMode ? styles.layoutActiveButton : null]}
        >
          <MaterialCommunityIcons color={palette.text} name="pencil-outline" size={18} />
        </Pressable>
        <Pressable
          onPress={() => {
            playConfiguredUiSound(addWidgetSounds, "tap", "topbar:addWidget");
            onAddWidget();
          }}
          style={styles.actionButton}
        >
          <MaterialCommunityIcons color={palette.text} name="plus" size={18} />
        </Pressable>
        <Pressable
          onPress={() => {
            playConfiguredUiSound(openSettingsSounds, "open", "topbar:openSettings");
            onOpenSettings();
          }}
          style={styles.actionButton}
        >
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
  pageTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    flexShrink: 1,
  },
  pageTab: {
    maxWidth: 168,
    borderRadius: 999,
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTabActive: {
    backgroundColor: palette.accent,
    borderColor: "rgba(77, 226, 177, 0.55)",
  },
  pageTabLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  pageTabLabelActive: {
    color: "#041019",
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 99,
  },
  statusOnline: {
    backgroundColor: "#34d399",
  },
  statusOffline: {
    backgroundColor: palette.danger,
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
