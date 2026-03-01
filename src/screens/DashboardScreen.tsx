import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { GridCanvas } from "../components/GridCanvas";
import { SettingsModal } from "../components/SettingsModal";
import { TopBar } from "../components/TopBar";
import { WidgetEditorModal } from "../components/WidgetEditorModal";
import { WidgetLibraryModal } from "../components/WidgetLibraryModal";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { useIoBrokerStates } from "../hooks/useIoBrokerStates";
import { BackgroundMode, WidgetConfig, WidgetType } from "../types/dashboard";
import { constrainToPrimarySections, normalizeWidgetLayout, resolveWidgetPosition } from "../utils/gridLayout";
import { buildWidgetTemplate } from "../utils/widgetFactory";
import { palette } from "../utils/theme";

export function DashboardScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < 700;
  const { addWidget, config, removeWidget, replaceWidgets, updateWidget } = useDashboardConfig();
  const { client, error, isOnline, states } = useIoBrokerStates();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState(false);

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

    const nextWidgets = normalizeWidgetLayout(
      config.widgets.map((widget) =>
        widget.id === widgetId
          ? ({
              ...widget,
              ...partial,
              position: partial.position
                ? resolveWidgetPosition(
                    config.widgets,
                    widgetId,
                    constrainToPrimarySections(partial.position, config.grid.columns),
                    config.grid.columns
                  )
                : widget.position,
            } as WidgetConfig)
          : widget
      ),
      config.grid.columns
    );

    replaceWidgets(nextWidgets);
  };

  useEffect(() => {
    const constrained = config.widgets.map((widget) => ({
      ...widget,
      position: constrainToPrimarySections(widget.position, config.grid.columns),
    }));
    const normalized = normalizeWidgetLayout(constrained, config.grid.columns);
    const changed = normalized.some((widget, index) => {
      const current = config.widgets[index];
      return (
        current &&
        (current.position.x !== widget.position.x ||
          current.position.y !== widget.position.y ||
          current.position.w !== widget.position.w ||
          current.position.h !== widget.position.h)
      );
    });

    if (changed) {
      replaceWidgets(normalized);
    }
  }, [config.grid.columns, config.widgets, replaceWidgets]);

  const editingWidget: WidgetConfig | null =
    config.widgets.find((widget) => widget.id === editingWidgetId) || null;

  return (
    <View style={styles.root}>
      <BackgroundLayer
        accent={config.backgroundAccent}
        color={config.backgroundColor}
        mode={config.backgroundMode}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={[styles.scroll, isCompact ? styles.scrollCompact : null]}
      >
        <TopBar
          isOnline={isOnline}
          isLayoutMode={layoutMode}
          statusDetail={error || config.iobroker.baseUrl}
          onAddWidget={() => setLibraryOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleLayoutMode={() => setLayoutMode((current) => !current)}
          title={config.title}
        />
        <GridCanvas
          client={client}
          config={config}
          isLayoutMode={layoutMode}
          onEditWidget={setEditingWidgetId}
          onRemoveWidget={removeWidget}
          onUpdateWidget={handleUpdateWidget}
          states={states}
        />
      </ScrollView>
      <WidgetLibraryModal
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

function BackgroundLayer({
  mode,
  color,
  accent,
}: {
  mode: BackgroundMode;
  color: string;
  accent: string;
}) {
  if (mode === "solid") {
    return <View style={[styles.background, { backgroundColor: color }]} />;
  }

  if (mode === "gradient") {
    return (
      <>
        <View style={[styles.background, { backgroundColor: color }]} />
        <View style={[styles.gradientTop, { backgroundColor: accent }]} />
        <View style={[styles.gradientBottom, { backgroundColor: "#000000" }]} />
      </>
    );
  }

  return (
    <>
      <View style={[styles.background, { backgroundColor: color }]} />
      <View style={[styles.meshA, { backgroundColor: accent }]} />
      <View style={[styles.meshB, { backgroundColor: palette.accentWarm }]} />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
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
    paddingTop: 6,
  },
});
