import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { GridCanvas } from "../components/GridCanvas";
import { SettingsModal } from "../components/SettingsModal";
import { TopBar } from "../components/TopBar";
import { WidgetEditorModal } from "../components/WidgetEditorModal";
import { WidgetLibraryModal } from "../components/WidgetLibraryModal";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { useIoBrokerStates } from "../hooks/useIoBrokerStates";
import { BackgroundMode, WidgetConfig, WidgetType } from "../types/dashboard";
import { normalizeWidgetLayout, resolveWidgetPosition } from "../utils/gridLayout";
import { buildWidgetTemplate } from "../utils/widgetFactory";
import { palette } from "../utils/theme";

export function DashboardScreen() {
  const { addWidget, config, removeWidget, replaceWidgets, updateWidget } = useDashboardConfig();
  const { client, error, isOnline, states } = useIoBrokerStates();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState(false);

  const addWidgetByType = (type: WidgetType) => {
    const widget = buildWidgetTemplate(type, config.widgets.length, { columns: config.grid.columns });
    const nextWidgets = normalizeWidgetLayout([
      ...config.widgets,
      {
      ...widget,
      position: resolveWidgetPosition(config.widgets, widget.id, widget.position, config.grid.columns),
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
                ? resolveWidgetPosition(config.widgets, widgetId, partial.position, config.grid.columns)
                : widget.position,
            } as WidgetConfig)
          : widget
      ),
      config.grid.columns
    );

    replaceWidgets(nextWidgets);
  };

  useEffect(() => {
    const normalized = normalizeWidgetLayout(config.widgets, config.grid.columns);
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

  const normalizeLayout = () => {
    replaceWidgets(normalizeWidgetLayout(config.widgets, config.grid.columns));
  };

  return (
    <View style={styles.root}>
      <BackgroundLayer
        accent={config.backgroundAccent}
        color={config.backgroundColor}
        mode={config.backgroundMode}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
        <TopBar
          isOnline={isOnline}
          isLayoutMode={layoutMode}
          statusDetail={error || config.iobroker.baseUrl}
          onAddWidget={() => setLibraryOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleLayoutMode={() => setLayoutMode((current) => !current)}
          title={config.title}
        />
        <View style={styles.controlPanel}>
          <View style={styles.controlTextWrap}>
            <Text style={styles.controlTitle}>Dashboard Controls</Text>
            <Text style={styles.controlText}>
              Layout, Widget und Settings bleiben erreichbar, treten aber visuell in den Hintergrund.
            </Text>
          </View>
          <View style={styles.controlActions}>
            <Pressable onPress={() => setLibraryOpen(true)} style={styles.controlButton}>
              <Text style={styles.controlButtonLabel}>Widget hinzufuegen</Text>
            </Pressable>
            <Pressable onPress={normalizeLayout} style={styles.controlButton}>
              <Text style={styles.controlButtonLabel}>Layout bereinigen</Text>
            </Pressable>
            <Pressable
              onPress={() => setSettingsOpen(true)}
              style={[styles.controlButton, styles.controlPrimaryButton]}
            >
              <Text style={styles.controlPrimaryLabel}>Settings oeffnen</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.infoStrip}>
          <InfoPill label="Grid" value={`${config.grid.columns} Spalten`} />
          <InfoPill label="Polling" value={`${config.pollingMs} ms`} />
          <InfoPill label="Adapter" value={config.iobroker.adapterBasePath || "/api"} />
        </View>
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
        onClose={() => setEditingWidgetId(null)}
        onSave={handleUpdateWidget}
        visible={Boolean(editingWidget)}
        widget={editingWidget}
      />
      <SettingsModal onClose={() => setSettingsOpen(false)} visible={settingsOpen} />
    </View>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <Pressable style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={styles.pillValue}>{value}</Text>
    </Pressable>
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
      <View style={[styles.accentOrb, { backgroundColor: accent }]} />
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
    margin: 18,
    borderRadius: 52,
    backgroundColor: "#040811",
    borderWidth: 14,
    borderColor: "#000000",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
  },
  accentOrb: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 999,
    opacity: 0.18,
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
  },
  controlPanel: {
    marginHorizontal: 20,
    marginTop: 4,
    padding: 12,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    gap: 10,
  },
  controlTextWrap: {
    gap: 6,
  },
  controlTitle: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  controlText: {
    color: palette.textMuted,
    lineHeight: 18,
    fontSize: 12,
  },
  controlActions: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  controlButton: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  controlPrimaryButton: {
    backgroundColor: palette.accent,
    borderColor: "rgba(92, 124, 255, 0.3)",
  },
  controlButtonLabel: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12,
  },
  controlPrimaryLabel: {
    color: "#041019",
    fontWeight: "800",
    fontSize: 12,
  },
  infoStrip: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 20,
    marginTop: 10,
    flexWrap: "wrap",
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  pillLabel: {
    color: palette.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  pillValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
});
