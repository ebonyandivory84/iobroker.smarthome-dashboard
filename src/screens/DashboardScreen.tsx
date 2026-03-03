import { useEffect, useMemo, useRef, useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { GridCanvas } from "../components/GridCanvas";
import { SettingsModal } from "../components/SettingsModal";
import { TopBar } from "../components/TopBar";
import { WidgetEditorModal } from "../components/WidgetEditorModal";
import { WidgetLibraryModal } from "../components/WidgetLibraryModal";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { useIoBrokerStates } from "../hooks/useIoBrokerStates";
import { BackgroundMode, WidgetConfig, WidgetType } from "../types/dashboard";
import { constrainToPrimarySections, normalizeWidgetLayout, resolveWidgetPosition } from "../utils/gridLayout";
import { configureUiSounds, playConfiguredUiSound, primeConfiguredSounds } from "../utils/uiSounds";
import { buildWidgetTemplate } from "../utils/widgetFactory";
import { palette } from "../utils/theme";

export function DashboardScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < 700;
  const isTouchLayout = width < 1100;
  const horizontalPagerRef = useRef<ScrollView | null>(null);
  const pageOffsetsRef = useRef<Record<string, number>>({});
  const pullGestureRef = useRef<{ pageId: string | null; startY: number | null }>({
    pageId: null,
    startY: null,
  });
  const {
    addWidget,
    config,
    dashboardPages,
    activePageId,
    createDashboardPage,
    removeWidget,
    replaceWidgets,
    setActivePage,
    updateWidget,
  } = useDashboardConfig();
  const { client, error, isOnline, states, stateWrites, writeStateTracked } = useIoBrokerStates();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState(false);
  const [visiblePageId, setVisiblePageId] = useState(activePageId);
  const lastContentScrollAt = useRef(0);
  const activePageIndex = Math.max(0, dashboardPages.findIndex((page) => page.id === activePageId));

  const pageConfigs = useMemo(
    () =>
      dashboardPages.map((page) => ({
        ...config,
        title: page.title,
        widgets: page.widgets,
        activePageId: page.id,
      })),
    [config, dashboardPages]
  );

  useEffect(() => {
    if (!horizontalPagerRef.current) {
      return;
    }

    horizontalPagerRef.current.scrollTo({ x: width * activePageIndex, animated: true });
  }, [activePageIndex, width]);

  useEffect(() => {
    setVisiblePageId(activePageId);
  }, [activePageId]);

  useEffect(() => {
    configureUiSounds(config.uiSounds);
  }, [config.uiSounds]);

  useEffect(() => {
    const configuredSoundIds = [
      ...(config.uiSounds?.widgetTypeDefaults?.state?.press || []),
      ...(config.uiSounds?.widgetTypeDefaults?.state?.confirm || []),
      ...(config.uiSounds?.widgetTypeDefaults?.camera?.press || []),
      ...(config.uiSounds?.widgetTypeDefaults?.camera?.open || []),
      ...(config.uiSounds?.widgetTypeDefaults?.camera?.close || []),
      ...(config.uiSounds?.widgetTypeDefaults?.camera?.scroll || []),
      ...(config.uiSounds?.widgetTypeDefaults?.grafana?.press || []),
      ...(config.uiSounds?.pageSounds?.tabPress || []),
      ...(config.uiSounds?.pageSounds?.swipe || []),
      ...(config.uiSounds?.pageSounds?.contentScroll || []),
      ...(config.uiSounds?.pageSounds?.layoutToggle || []),
      ...(config.uiSounds?.pageSounds?.addWidget || []),
      ...(config.uiSounds?.pageSounds?.openSettings || []),
      ...dashboardPages.flatMap((page) =>
        page.widgets.flatMap((widget) => [
          ...(widget.interactionSounds?.press || []),
          ...(widget.interactionSounds?.confirm || []),
          ...(widget.interactionSounds?.open || []),
          ...(widget.interactionSounds?.close || []),
          ...(widget.interactionSounds?.scroll || []),
        ])
      ),
    ];

    primeConfiguredSounds(configuredSoundIds);
  }, [config.uiSounds, dashboardPages]);

  const addWidgetByType = (type: WidgetType) => {
    const widget = buildWidgetTemplate(type, config.widgets.length, { columns: config.grid.columns });
    const constrainedPosition = constrainToPrimarySections(widget.position, config.grid.columns);
    const nextWidgets = normalizeWidgetLayout([
      ...config.widgets,
      {
        ...widget,
        position: resolveWidgetPosition(config.widgets, widget.id, constrainedPosition, config.grid.columns),
      },
    ], config.grid.columns);
    addWidget(nextWidgets[nextWidgets.length - 1]);
  };

  const handleUpdateWidget = (widgetId: string, partial: Partial<WidgetConfig>) => {
    const currentWidget = config.widgets.find((widget) => widget.id === widgetId);
    if (!currentWidget) {
      return;
    }
    if (partial.position) {
      updateWidget(widgetId, {
        ...partial,
        position: constrainToPrimarySections(partial.position, config.grid.columns),
      });
      return;
    }

    updateWidget(widgetId, partial);
  };

  const editingWidget: WidgetConfig | null =
    config.widgets.find((widget) => widget.id === editingWidgetId) || null;

  const resolvePageFromOffset = (offsetX: number) => {
    if (!width) {
      return null;
    }

    const nextIndex = Math.round(offsetX / width);
    return dashboardPages[nextIndex] || null;
  };

  const handlePageScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextPage = resolvePageFromOffset(event.nativeEvent.contentOffset.x);
    if (nextPage && nextPage.id !== visiblePageId) {
      setVisiblePageId(nextPage.id);
    }
  };

  const handlePageScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextPage = resolvePageFromOffset(event.nativeEvent.contentOffset.x);
    if (nextPage) {
      if (nextPage.id !== activePageId) {
        playConfiguredUiSound(config.uiSounds?.pageSounds?.swipe, "swipe", "global:pageSwipe");
      }
      setVisiblePageId(nextPage.id);
      setActivePage(nextPage.id);
    }
  };

  const handleContentScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (event.nativeEvent.contentOffset.y <= 12) {
      return;
    }

    const now = Date.now();
    if (now - lastContentScrollAt.current < 280) {
      return;
    }

    lastContentScrollAt.current = now;
    playConfiguredUiSound(config.uiSounds?.pageSounds?.contentScroll, "tap", "global:pageContentScroll");
  };

  const handlePageContentScroll =
    (pageId: string) =>
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      pageOffsetsRef.current[pageId] = event.nativeEvent.contentOffset.y;
    };

  const handlePageTouchStart =
    (pageId: string) =>
    (event: unknown) => {
      if (!isTouchLayout) {
        return;
      }

      const currentOffset = pageOffsetsRef.current[pageId] || 0;
      if (currentOffset > 0) {
        pullGestureRef.current = { pageId: null, startY: null };
        return;
      }

      pullGestureRef.current = {
        pageId,
        startY: extractTouchPageY(event),
      };
    };

  const handlePageTouchEnd =
    (pageId: string) =>
    (event: unknown) => {
      if (!isTouchLayout || Platform.OS !== "web" || typeof window === "undefined") {
        return;
      }

      const activeGesture = pullGestureRef.current;
      const currentOffset = pageOffsetsRef.current[pageId] || 0;
      const endY = extractTouchPageY(event);

      if (
        activeGesture.pageId === pageId &&
        activeGesture.startY !== null &&
        endY !== null &&
        currentOffset <= 0 &&
        endY - activeGesture.startY > 96
      ) {
        window.location.reload();
      }

      pullGestureRef.current = { pageId: null, startY: null };
    };

  return (
    <View style={styles.root}>
      <BackgroundLayer
        accent={config.backgroundAccent}
        color={config.backgroundColor}
        mode={config.backgroundMode}
      />
      <TopBar
        homeLabel={config.homeLabel || "My Home"}
        activePageId={visiblePageId}
        isOnline={isOnline}
        isLayoutMode={layoutMode}
        pageTabSounds={config.uiSounds?.pageSounds?.tabPress}
        layoutToggleSounds={config.uiSounds?.pageSounds?.layoutToggle}
        addWidgetSounds={config.uiSounds?.pageSounds?.addWidget}
        openSettingsSounds={config.uiSounds?.pageSounds?.openSettings}
        pageTitles={dashboardPages.map((page) => ({ id: page.id, title: page.title }))}
        onAddWidget={() => setLibraryOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onSelectPage={(pageId) => {
          setVisiblePageId(pageId);
          setActivePage(pageId);
        }}
        onToggleLayoutMode={() => setLayoutMode((current) => !current)}
      />
      <ScrollView
        style={[styles.scroll, isCompact ? styles.scrollCompact : null]}
        horizontal
        pagingEnabled
        ref={horizontalPagerRef}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        onScroll={handlePageScroll}
        onMomentumScrollEnd={handlePageScrollEnd}
        onScrollEndDrag={handlePageScrollEnd}
      >
        {pageConfigs.map((pageConfig) => (
          <View key={pageConfig.activePageId} style={[styles.page, { width }]}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              style={styles.pageScroll}
              onScroll={handlePageContentScroll(pageConfig.activePageId)}
              onMomentumScrollEnd={handleContentScrollEnd}
              onScrollEndDrag={handleContentScrollEnd}
              onTouchStart={handlePageTouchStart(pageConfig.activePageId)}
              onTouchEnd={handlePageTouchEnd(pageConfig.activePageId)}
            >
              <GridCanvas
                client={client}
                config={pageConfig}
                isLayoutMode={layoutMode}
                onEditWidget={setEditingWidgetId}
                onRemoveWidget={removeWidget}
                onUpdateWidget={handleUpdateWidget}
                onWriteState={writeStateTracked}
                stateWrites={stateWrites}
                states={states}
              />
            </ScrollView>
          </View>
        ))}
      </ScrollView>
      <WidgetLibraryModal
        onCreateDashboard={createDashboardPage}
        onClose={() => setLibraryOpen(false)}
        onSelectType={addWidgetByType}
        visible={libraryOpen}
      />
      <WidgetEditorModal
        client={client}
        onClose={() => setEditingWidgetId(null)}
        onSave={handleUpdateWidget}
        visible={Boolean(editingWidget)}
        widget={editingWidget}
      />
      <SettingsModal onClose={() => setSettingsOpen(false)} visible={settingsOpen} />
    </View>
  );
}

function extractTouchPageY(event: unknown) {
  if (!event || typeof event !== "object" || !("nativeEvent" in event)) {
    return null;
  }

  const nativeEvent = (event as { nativeEvent?: unknown }).nativeEvent;
  if (!nativeEvent || typeof nativeEvent !== "object") {
    return null;
  }

  const touches = "touches" in nativeEvent ? (nativeEvent as { touches?: Array<{ pageY?: number }> }).touches : undefined;
  const changedTouches =
    "changedTouches" in nativeEvent
      ? (nativeEvent as { changedTouches?: Array<{ pageY?: number }> }).changedTouches
      : undefined;

  const directPageY = "pageY" in nativeEvent ? (nativeEvent as { pageY?: number }).pageY : undefined;

  return (
    touches?.[0]?.pageY ??
    changedTouches?.[0]?.pageY ??
    (typeof directPageY === "number" ? directPageY : null)
  );
}

function BackgroundLayer({
  mode,
  color,
  accent,
}: {
  mode: BackgroundMode;
  color: string;
  accent: string;
}) {
  void mode;
  void color;
  void accent;
  return <View style={[styles.background, { backgroundColor: "#000000" }]} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scroll: {
    flex: 1,
    margin: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  scrollCompact: {
    margin: 0,
    borderRadius: 0,
    borderWidth: 0,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
  },
  gradientTop: {
    position: "absolute",
    inset: 0,
    opacity: 0.18,
  },
  gradientBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -180,
    height: 360,
    borderRadius: 999,
    opacity: 0.22,
  },
  meshA: {
    position: "absolute",
    left: -80,
    bottom: 80,
    width: 240,
    height: 240,
    borderRadius: 999,
    opacity: 0.08,
  },
  meshB: {
    position: "absolute",
    right: 80,
    bottom: -30,
    width: 180,
    height: 180,
    borderRadius: 999,
    opacity: 0.07,
  },
  scrollContent: {
    paddingBottom: 96,
    paddingTop: 2,
  },
  page: {
    flex: 1,
  },
  pageScroll: {
    flex: 1,
  },
});
