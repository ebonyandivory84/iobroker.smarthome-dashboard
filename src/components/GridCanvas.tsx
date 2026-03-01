import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { IoBrokerClient } from "../services/iobroker";
import { DashboardSettings, StateSnapshot, WidgetConfig } from "../types/dashboard";
import { constrainToPrimarySections, GRID_SNAP } from "../utils/gridLayout";
import { resolveThemeSettings } from "../utils/themeConfig";
import { palette } from "../utils/theme";
import { WidgetFrame } from "./WidgetFrame";
import { CameraWidget } from "./widgets/CameraWidget";
import { EnergyWidget } from "./widgets/EnergyWidget";
import { GrafanaWidget } from "./widgets/GrafanaWidget";
import { SolarWidget } from "./widgets/SolarWidget";
import { resolveStateNextValue, StateWidget } from "./widgets/StateWidget";
import { WeatherWidget } from "./widgets/WeatherWidget";

type GridCanvasProps = {
  config: DashboardSettings;
  states: StateSnapshot;
  client: IoBrokerClient;
  isLayoutMode: boolean;
  onEditWidget: (widgetId: string) => void;
  onUpdateWidget: (widgetId: string, partial: Partial<WidgetConfig>) => void;
  onRemoveWidget: (widgetId: string) => void;
  onLayoutMeasured?: (width: number) => void;
};

export function GridCanvas({
  config,
  states,
  client,
  isLayoutMode,
  onEditWidget,
  onUpdateWidget,
  onRemoveWidget,
  onLayoutMeasured,
}: GridCanvasProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const isCompactWeb = Platform.OS === "web" && windowWidth < 700;
  const displayColumns = isCompactWeb ? 1 : 9;
  const effectiveLayoutMode = isLayoutMode;
  const displayConfig = useMemo(
    () => buildResponsiveAutoLayoutConfig(config, displayColumns),
    [config, displayColumns]
  );
  const useStructuredGridSizing = true;
  const canvasInset = Platform.OS === "web" ? 64 : 60;
  const availableWidth = containerWidth > 0 ? containerWidth : windowWidth;
  const canvasWidth = Math.max(320, availableWidth - canvasInset);
  const cellWidth = useMemo(() => {
    const totalGap = (displayConfig.grid.columns - 1) * displayConfig.grid.gap;
    return (canvasWidth - totalGap) / displayConfig.grid.columns;
  }, [canvasWidth, displayConfig.grid.columns, displayConfig.grid.gap]);
  const renderRowHeight = useStructuredGridSizing ? cellWidth : displayConfig.grid.rowHeight;

  const canvasHeight = useMemo(() => {
    const maxRow = displayConfig.widgets.reduce((largest, widget) => {
      const bottom = widget.position.y + widget.position.h;
      return Math.max(largest, bottom);
    }, 0);
    return maxRow * (renderRowHeight + displayConfig.grid.gap) + 120;
  }, [displayConfig.grid.gap, displayConfig.widgets, renderRowHeight]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setContainerWidth(nextWidth);
    onLayoutMeasured?.(nextWidth);
  };

  const content =
    Platform.OS === "web" && !isCompactWeb ? (
      <WebGridCanvas
        canvasHeight={canvasHeight}
        cellWidth={cellWidth}
        client={client}
        config={displayConfig}
        rowHeight={renderRowHeight}
        theme={resolveThemeSettings(displayConfig.theme)}
        isLayoutMode={effectiveLayoutMode}
        onEditWidget={onEditWidget}
        onRemoveWidget={onRemoveWidget}
        onUpdateWidget={onUpdateWidget}
        states={states}
      />
    ) : (
      <View style={[styles.canvas, { minHeight: canvasHeight }]}>
        <View pointerEvents="none" style={styles.gridOverlay}>
          {Array.from({ length: Math.round(displayConfig.grid.columns / GRID_SNAP) + 1 }).map((_, index) => (
            <View
              key={`col-${index}`}
              style={[
                styles.gridLine,
                {
                  left: fineGridOffset(index, cellWidth, displayConfig.grid.gap),
                },
              ]}
            />
          ))}
          {Array.from({ length: Math.round(canvasHeight / ((renderRowHeight + displayConfig.grid.gap) * GRID_SNAP)) + 1 }).map(
            (_, index) => (
              <View
                key={`row-${index}`}
                style={[
                  styles.gridRowLine,
                  {
                    top: fineGridOffset(index, renderRowHeight, displayConfig.grid.gap),
                  },
                ]}
              />
            )
          )}
        </View>
        {displayConfig.widgets.map((widget) => {
          const style = {
            left: widget.position.x * (cellWidth + displayConfig.grid.gap),
            top: widget.position.y * (renderRowHeight + displayConfig.grid.gap),
            width: widget.position.w * cellWidth + (widget.position.w - 1) * displayConfig.grid.gap,
            height: widget.position.h * renderRowHeight + (widget.position.h - 1) * displayConfig.grid.gap,
          };

          return (
            <View key={widget.id} style={[styles.widget, style]}>
              <WidgetFrame
                cellWidth={cellWidth}
                columns={displayConfig.grid.columns}
                gap={displayConfig.grid.gap}
                isLayoutMode={effectiveLayoutMode}
                allowManualLayout={!isCompactWeb}
                allowResize={false}
                onCommitPosition={(widgetId, position) => onUpdateWidget(widgetId, { position })}
                onEdit={onEditWidget}
                onRemove={onRemoveWidget}
                rowHeight={renderRowHeight}
                widget={widget}
              >
                {renderWidget(widget, states, client, onUpdateWidget, displayConfig.theme)}
              </WidgetFrame>
            </View>
          );
        })}
      </View>
    );

  return (
    <View onLayout={handleLayout} style={styles.host}>
      {content}
    </View>
  );
}

function fineGridOffset(index: number, unitSize: number, gap: number) {
  const units = index * GRID_SNAP;
  const fullUnits = Math.floor(units);
  const halfUnit = units - fullUnits;
  return fullUnits * unitSize + Math.max(0, fullUnits - 1) * gap + halfUnit * unitSize;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildResponsiveAutoLayoutConfig(config: DashboardSettings, columns: number): DashboardSettings {
  if (columns === 9) {
    return buildDesktopAutoLayoutConfig(config);
  }

  const sortedWidgets = [...config.widgets].sort((a, b) => {
    if (a.position.y !== b.position.y) {
      return a.position.y - b.position.y;
    }
    if (a.position.x !== b.position.x) {
      return a.position.x - b.position.x;
    }
    return a.id.localeCompare(b.id);
  });

  const columnHeights = Array.from({ length: columns }, () => 0);
  const widgets = sortedWidgets.map((widget) => {
    const spec = getAutoLayoutSpec(widget, columns);
    let bestStart = 0;
    let bestY = Number.POSITIVE_INFINITY;

    for (let start = 0; start <= columns - spec.w; start += 1) {
      const y = Math.max(...columnHeights.slice(start, start + spec.w));
      if (y < bestY) {
        bestY = y;
        bestStart = start;
      }
    }

    for (let index = bestStart; index < bestStart + spec.w; index += 1) {
      columnHeights[index] = bestY + spec.h;
    }

    return {
      ...widget,
      position: {
        x: bestStart,
        y: bestY,
        w: spec.w,
        h: spec.h,
      },
    };
  });

  return {
    ...config,
    grid: {
      ...config.grid,
      columns,
    },
    widgets,
  };
}

function buildDesktopAutoLayoutConfig(config: DashboardSettings): DashboardSettings {
  const sourceColumns = Math.max(1, config.grid.columns);
  const mainColumnWidth = 3;
  const subColumnHeights = Array.from({ length: 9 }, () => 0);
  const sortedWidgets = [...config.widgets].sort((a, b) => {
    const aPriority = getDesktopWidgetPriority(a);
    const bPriority = getDesktopWidgetPriority(b);
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    if (a.position.y !== b.position.y) {
      return a.position.y - b.position.y;
    }
    if (a.position.x !== b.position.x) {
      return a.position.x - b.position.x;
    }
    return a.id.localeCompare(b.id);
  });

  const widgets = sortedWidgets.map((widget) => {
    const spec = getAutoLayoutSpec(widget, 9);

    if (spec.w === 1) {
      const preferredSection = getPreferredDesktopSection(widget, sourceColumns);
      const sectionStart = preferredSection * mainColumnWidth;
      let bestLocal = 0;
      let bestY = Number.POSITIVE_INFINITY;

      for (let offset = 0; offset < mainColumnWidth; offset += 1) {
        const y = subColumnHeights[sectionStart + offset];
        if (y < bestY) {
          bestY = y;
          bestLocal = offset;
        }
      }

      const targetIndex = sectionStart + bestLocal;
      subColumnHeights[targetIndex] = bestY + spec.h;

      return {
        ...widget,
        position: {
          x: targetIndex,
          y: bestY,
          w: 1,
          h: spec.h,
        },
      };
    }

    const sectionSpan = Math.max(1, Math.round(spec.w / mainColumnWidth));
    const maxStartSection = Math.max(0, 3 - sectionSpan);
    const preferredSection = clamp(getPreferredDesktopSection(widget, sourceColumns), 0, maxStartSection);

    let bestStartSection = preferredSection;
    let bestY = Number.POSITIVE_INFINITY;

    for (let section = 0; section <= maxStartSection; section += 1) {
      const candidateStart = section * mainColumnWidth;
      const candidateEnd = candidateStart + sectionSpan * mainColumnWidth;
      const y = Math.max(...subColumnHeights.slice(candidateStart, candidateEnd));

      if (y < bestY || (y === bestY && section === preferredSection)) {
        bestY = y;
        bestStartSection = section;
      }
    }

    const startIndex = bestStartSection * mainColumnWidth;
    const endIndex = startIndex + sectionSpan * mainColumnWidth;
    for (let index = startIndex; index < endIndex; index += 1) {
      subColumnHeights[index] = bestY + spec.h;
    }

    return {
      ...widget,
      position: {
        x: startIndex,
        y: bestY,
        w: sectionSpan * mainColumnWidth,
        h: spec.h,
      },
    };
  });

  return {
    ...config,
    grid: {
      ...config.grid,
      columns: 9,
    },
    widgets,
  };
}

function getPreferredDesktopSection(widget: WidgetConfig, sourceColumns: number) {
  if (widget.type === "state") {
    return 0;
  }

  const sectionWidth = sourceColumns / 3;
  const center = widget.position.x + widget.position.w / 2;
  return clamp(Math.floor(center / Math.max(1, sectionWidth)), 0, 2);
}

function getDesktopWidgetPriority(widget: WidgetConfig) {
  switch (widget.type) {
    case "state":
      return 0;
    case "weather":
      return 1;
    case "camera":
      return 2;
    case "energy":
      return 3;
    case "solar":
      return 4;
    case "grafana":
      return 5;
    default:
      return 10;
  }
}

function getAutoLayoutSpec(widget: WidgetConfig, columns: number) {
  const fallbackHeight = widget.position.h;

  if (columns === 1) {
    switch (widget.type) {
      case "state":
        return { w: 1, h: 1 };
      case "camera":
        return { w: 1, h: 2.2 };
      case "solar":
        return { w: 1, h: 3.8 };
      case "grafana":
        return { w: 1, h: 2.8 };
      case "weather":
        return { w: 1, h: 1.8 };
      case "energy":
        return { w: 1, h: 2 };
    }

    return { w: 1, h: Math.max(1.5, fallbackHeight) };
  }

  const mainColumnWidth = 3;
  const wideWidgetWidth = Math.min(mainColumnWidth * 2, columns);

  switch (widget.type) {
    case "state":
      return { w: 1, h: 1 };
    case "camera":
      return { w: mainColumnWidth, h: 2.1 };
    case "solar":
      return { w: wideWidgetWidth, h: 3.2 };
    case "grafana":
      return { w: wideWidgetWidth, h: 2.8 };
    case "weather":
      return { w: mainColumnWidth, h: 2.2 };
    case "energy":
      return { w: mainColumnWidth, h: 2.4 };
  }

  return { w: 1, h: Math.max(1, fallbackHeight) };
}

function WebGridCanvas({
  config,
  theme,
  states,
  client,
  cellWidth,
  canvasHeight,
  rowHeight,
  isLayoutMode,
  onEditWidget,
  onUpdateWidget,
  onRemoveWidget,
}: {
  config: DashboardSettings;
  theme: ReturnType<typeof resolveThemeSettings>;
  states: StateSnapshot;
  client: IoBrokerClient;
  cellWidth: number;
  canvasHeight: number;
  rowHeight: number;
  isLayoutMode: boolean;
  onEditWidget: (widgetId: string) => void;
  onUpdateWidget: (widgetId: string, partial: Partial<WidgetConfig>) => void;
  onRemoveWidget: (widgetId: string) => void;
}) {
  const stepX = cellWidth + config.grid.gap;
  const stepY = rowHeight + config.grid.gap;

  return (
    <div style={{ ...webCanvasStyle, minHeight: canvasHeight }}>
      {Array.from({ length: Math.round(config.grid.columns / GRID_SNAP) + 1 }).map((_, index) => (
        <div
          key={`v-${index}`}
          style={{
            ...webVerticalLineStyle,
            left: fineGridOffset(index, cellWidth, config.grid.gap),
          }}
        />
      ))}
      {Array.from({ length: Math.round(canvasHeight / (stepY * GRID_SNAP)) + 1 }).map((_, index) => (
        <div
          key={`h-${index}`}
          style={{
            ...webHorizontalLineStyle,
            top: fineGridOffset(index, rowHeight, config.grid.gap),
          }}
        />
      ))}
      {config.widgets.map((widget) => (
        <WebWidgetShell
          key={widget.id}
          cellWidth={cellWidth}
          client={client}
          config={config}
          rowHeight={rowHeight}
          theme={theme}
          isLayoutMode={isLayoutMode}
          onEditWidget={onEditWidget}
          onRemoveWidget={onRemoveWidget}
          onUpdateWidget={onUpdateWidget}
          allowManualLayout={true}
          allowResize={false}
          states={states}
          stepX={stepX}
          stepY={stepY}
          widget={widget}
        />
      ))}
    </div>
  );
}

function WebWidgetShell({
  widget,
  config,
  rowHeight,
  theme,
  states,
  client,
  stepX,
  stepY,
  cellWidth,
  isLayoutMode,
  onEditWidget,
  onUpdateWidget,
  onRemoveWidget,
  allowManualLayout = true,
  allowResize = true,
}: {
  widget: WidgetConfig;
  config: DashboardSettings;
  rowHeight: number;
  theme: ReturnType<typeof resolveThemeSettings>;
  states: StateSnapshot;
  client: IoBrokerClient;
  stepX: number;
  stepY: number;
  cellWidth: number;
  isLayoutMode: boolean;
  onEditWidget: (widgetId: string) => void;
  onUpdateWidget: (widgetId: string, partial: Partial<WidgetConfig>) => void;
  onRemoveWidget: (widgetId: string) => void;
  allowManualLayout?: boolean;
  allowResize?: boolean;
}) {
  const [preview, setPreview] = useState(widget.position);
  const showHeaderTitle = widget.type !== "camera" && widget.showTitle !== false && Boolean(widget.title.trim());
  const interaction = useRef<{
    mode: "drag" | "resize";
    startX: number;
    startY: number;
    startPosition: WidgetConfig["position"];
  } | null>(null);

  useEffect(() => {
    setPreview(widget.position);
  }, [widget.position]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      const active = interaction.current;
      if (!active) {
        return;
      }

      const dx = snapUnits((event.clientX - active.startX) / stepX);
      const dy = snapUnits((event.clientY - active.startY) / stepY);

      if (!allowManualLayout) {
        return;
      }

      if (active.mode === "drag") {
        setPreview(constrainToPrimarySections({
          ...active.startPosition,
          x: clamp(active.startPosition.x + dx, 0, config.grid.columns - active.startPosition.w),
          y: Math.max(0, active.startPosition.y + dy),
        }, config.grid.columns));
      } else {
        setPreview(constrainToPrimarySections({
          ...active.startPosition,
          w: clamp(active.startPosition.w + dx, 1, config.grid.columns),
          h: Math.max(1, active.startPosition.h + dy),
        }, config.grid.columns));
      }
    };

    const handleUp = () => {
      const active = interaction.current;
      if (!active) {
        return;
      }
      interaction.current = null;
      if (allowManualLayout) {
        onUpdateWidget(widget.id, { position: preview });
      }
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [config.grid.columns, onUpdateWidget, preview, stepX, stepY, widget.id]);

  const begin =
    (mode: "drag" | "resize") =>
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      interaction.current = {
        mode,
        startX: event.clientX,
        startY: event.clientY,
        startPosition: preview,
      };
    };

  const shellStyle: CSSProperties = {
    ...webWidgetStyle,
    ...getWidgetTone(widget, theme),
    ...(widget.type === "camera"
      ? {
          border: "none",
          background: "#000000",
        }
      : null),
    left: preview.x * stepX,
    top: preview.y * stepY,
    width: preview.w * cellWidth + (preview.w - 1) * config.grid.gap,
    height: preview.h * rowHeight + (preview.h - 1) * config.grid.gap,
    boxShadow: isLayoutMode ? "inset 0 0 0 1px rgba(77, 226, 177, 0.22)" : undefined,
  };

  const contentStyle = [
    styles.webContent,
    widget.type === "camera" ? styles.webContentBleed : null,
    widget.type !== "camera" && widget.type !== "solar" && widget.type !== "state" ? styles.webContentInset : null,
    widget.type === "grafana" ? styles.webContentGrafana : null,
  ];

  return (
    <div style={shellStyle}>
      {isLayoutMode && allowManualLayout ? <div onMouseDown={begin("drag")} style={webWidgetDragSurfaceStyle} /> : null}
      {showHeaderTitle ? (
        <div style={webTitleBadgeStyle}>
          <div style={{ ...webTitleStyle, color: widget.appearance?.textColor || palette.text }}>{widget.title}</div>
        </div>
      ) : null}
      {isLayoutMode ? (
        <div style={webControlsStyle}>
          <button onClick={() => onEditWidget(widget.id)} style={webIconButtonStyle} type="button">
            ⋯
          </button>
          <button onClick={() => onRemoveWidget(widget.id)} style={webIconButtonStyle} type="button">
            ×
          </button>
        </div>
      ) : null}
      <View style={contentStyle}>
        {renderWidget(widget, states, client, onUpdateWidget, config.theme)}
      </View>
      {isLayoutMode && allowManualLayout && allowResize ? (
        <div style={webFooterOverlayStyle}>
          <div onMouseDown={begin("resize")} style={webResizeHandleStyle} title="Skalieren" />
        </div>
      ) : null}
    </div>
  );
}

function renderWidget(
  widget: WidgetConfig,
  states: StateSnapshot,
  client: IoBrokerClient,
  onUpdateWidget: (widgetId: string, partial: Partial<WidgetConfig>) => void,
  theme?: DashboardSettings["theme"]
) {
  if (widget.type === "state") {
    return (
      <StateWidget
        addonValue={widget.addonStateId ? states[widget.addonStateId] : undefined}
        config={widget}
        value={states[widget.stateId]}
        onToggle={() => client.writeState(widget.stateId, resolveStateNextValue(widget, states[widget.stateId]))}
      />
    );
  }

  if (widget.type === "camera") {
    return <CameraWidget config={widget} />;
  }

  if (widget.type === "energy") {
    return <EnergyWidget config={widget} states={states} />;
  }

  if (widget.type === "solar") {
    return <SolarWidget config={widget} states={states} theme={theme} />;
  }

  if (widget.type === "grafana") {
    return <GrafanaWidget config={widget} />;
  }

  if (widget.type === "weather") {
    return <WeatherWidget config={widget} />;
  }

  return null;
}

const styles = StyleSheet.create({
  host: {
    width: "100%",
  },
  canvas: {
    position: "relative",
    margin: 20,
    borderRadius: 28,
    padding: 10,
    backgroundColor: "rgba(4, 8, 14, 0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
  },
  gridLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  gridRowLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  widget: {
    position: "absolute",
  },
  webContent: {
    flex: 1,
    minHeight: 0,
  },
  webContentInset: {
    padding: 16,
  },
  webContentGrafana: {
    paddingTop: 10,
  },
  webContentBleed: {
    width: "100%",
    height: "100%",
  },
});

function snapUnits(value: number) {
  return Math.round(value / GRID_SNAP) * GRID_SNAP;
}

const webCanvasStyle: CSSProperties = {
  position: "relative",
  margin: 20,
  borderRadius: 30,
  padding: 12,
  background: "linear-gradient(180deg, rgba(11,16,29,0.78), rgba(8,11,21,0.92))",
  border: "1px solid rgba(255,255,255,0.04)",
  overflow: "hidden",
};

const webVerticalLineStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: 1,
  background: "rgba(255,255,255,0.05)",
  pointerEvents: "none",
};

const webHorizontalLineStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  height: 1,
  background: "rgba(255,255,255,0.03)",
  pointerEvents: "none",
};

const webWidgetStyle: CSSProperties = {
  position: "absolute",
  display: "flex",
  flexDirection: "column",
  fontFamily: "Arial, sans-serif",
  borderRadius: 22,
  background: "linear-gradient(180deg, rgba(29,35,55,0.94), rgba(20,24,40,0.96))",
  border: "none",
  boxSizing: "border-box",
  overflow: "hidden",
  boxShadow: "none",
  backdropFilter: "blur(12px)",
};

const webTitleStyle: CSSProperties = {
  color: palette.text,
  fontSize: 15,
  fontWeight: 700,
};

const webControlsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 4,
};

const webIconButtonStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 16,
  border: "1px solid transparent",
  background: "rgba(255,255,255,0.04)",
  color: palette.textMuted,
  cursor: "pointer",
  fontSize: 20,
  lineHeight: "28px",
  fontWeight: 700,
};

const webTitleBadgeStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  maxWidth: "74%",
  padding: "8px 10px",
  borderRadius: 12,
  background: "rgba(4,8,14,0.34)",
  zIndex: 4,
};

const webFooterOverlayStyle: CSSProperties = {
  position: "absolute",
  bottom: 12,
  right: 12,
  zIndex: 6,
};

const webWidgetDragSurfaceStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  cursor: "grab",
  zIndex: 2,
  userSelect: "none",
  WebkitUserSelect: "none",
  touchAction: "none",
};

const webResizeHandleStyle: CSSProperties = {
  width: 18,
  height: 18,
  borderRight: `2px solid ${palette.textMuted}`,
  borderBottom: `2px solid ${palette.textMuted}`,
  cursor: "nwse-resize",
  userSelect: "none",
  WebkitUserSelect: "none",
  opacity: 0.7,
};

function getWidgetTone(widget: WidgetConfig, theme: ReturnType<typeof resolveThemeSettings>): CSSProperties {
  const appearance = widget.appearance;
  if (appearance?.widgetColor) {
    return {
      background: buildGradientBackground(appearance.widgetColor, appearance.widgetColor2),
      border: "1px solid rgba(255,255,255,0.1)",
    };
  }

  const type = widget.type;
  if (type === "state") {
    return {
      background: "transparent",
      border: "none",
      boxShadow: "none",
    };
  }
  if (type === "energy") {
    return {
      background: `linear-gradient(180deg, ${theme.widgetTones.energyStart}, ${theme.widgetTones.energyEnd})`,
      border: "1px solid rgba(90, 150, 255, 0.16)",
    };
  }
  if (type === "camera") {
    return {
      background: `linear-gradient(180deg, ${theme.widgetTones.cameraStart}, ${theme.widgetTones.cameraEnd})`,
      border: "1px solid rgba(255,255,255,0.06)",
    };
  }
  if (type === "solar") {
    return {
      background: `linear-gradient(135deg, ${theme.widgetTones.solarStart} 0%, ${theme.widgetTones.solarEnd} 100%)`,
      border: "1px solid rgba(105, 214, 189, 0.18)",
      boxShadow: "0 18px 30px rgba(10, 62, 82, 0.28)",
    };
  }
  if (type === "grafana") {
    return {
      background: "linear-gradient(180deg, rgba(12,18,30,0.96), rgba(9,13,24,0.98))",
      border: "1px solid rgba(255,255,255,0.06)",
    };
  }
  if (type === "weather") {
    return {
      background: "linear-gradient(135deg, rgba(34,128,214,0.92), rgba(21,73,167,0.96))",
      border: "1px solid rgba(173, 219, 255, 0.18)",
    };
  }
  return {};
}

function buildGradientBackground(start: string, end?: string) {
  if (end && end.trim()) {
    return `linear-gradient(135deg, ${start} 0%, ${end} 100%)`;
  }
  return start;
}
