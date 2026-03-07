import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { StateWriteFeedback } from "../hooks/useIoBrokerStates";
import { IoBrokerClient } from "../services/iobroker";
import { DashboardSettings, StateSnapshot, WidgetConfig, WidgetInteractionSounds, WidgetType } from "../types/dashboard";
import { constrainToPrimarySections, GRID_SNAP } from "../utils/gridLayout";
import { playConfiguredUiSound } from "../utils/uiSounds";
import { resolveThemeSettings } from "../utils/themeConfig";
import { palette } from "../utils/theme";
import { WidgetFrame } from "./WidgetFrame";
import { CameraWidget } from "./widgets/CameraWidget";
import { EnergyWidget } from "./widgets/EnergyWidget";
import { GrafanaWidget } from "./widgets/GrafanaWidget";
import { LinkWidget } from "./widgets/LinkWidget";
import { NumpadWidget } from "./widgets/NumpadWidget";
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
  onWriteState: (stateId: string, value: unknown) => void | Promise<void>;
  stateWrites?: Record<string, StateWriteFeedback>;
  onLayoutMeasured?: (width: number) => void;
  onCameraFullscreenSwipeClose?: () => void;
  onCameraFullscreenVisibilityChange?: (widgetId: string, open: boolean) => void;
  onDragAcrossPageEdge?: (direction: "left" | "right", widgetId: string, position: WidgetConfig["position"]) => void;
};

export function GridCanvas({
  config,
  states,
  client,
  isLayoutMode,
  onEditWidget,
  onUpdateWidget,
  onRemoveWidget,
  onWriteState,
  stateWrites,
  onLayoutMeasured,
  onCameraFullscreenSwipeClose,
  onCameraFullscreenVisibilityChange,
  onDragAcrossPageEdge,
}: GridCanvasProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const isCompactWeb = Platform.OS === "web" && windowWidth < 700;
  const isTabletLikeWeb = Platform.OS === "web" && windowWidth >= 700 && windowWidth < 1100;
  const displayColumns = isCompactWeb ? 1 : 9;
  const effectiveLayoutMode = isLayoutMode;
  const displayGap = Platform.OS === "web" && !isCompactWeb ? Math.max(config.grid.gap, 18) : config.grid.gap;
  const mainColumnExtraGap = Platform.OS === "web" && !isCompactWeb ? displayGap * 2 : 0;
  const displayConfig = useMemo(
    () => {
      const next = buildResponsiveAutoLayoutConfig(config, displayColumns, {
        isTabletLikeWeb,
      });
      return {
        ...next,
        grid: {
          ...next.grid,
          gap: displayGap,
        },
      };
    },
    [config, displayColumns, displayGap, isTabletLikeWeb]
  );
  const useStructuredGridSizing = true;
  const canvasInset = Platform.OS === "web" ? 64 : 60;
  const availableWidth = containerWidth > 0 ? containerWidth : windowWidth;
  const canvasWidth = Math.max(320, availableWidth - canvasInset);
  const cellWidth = useMemo(() => {
    const totalGap = (displayConfig.grid.columns - 1) * displayConfig.grid.gap;
    const totalMainExtraGap = mainColumnExtraGap * 2;
    return (canvasWidth - totalGap - totalMainExtraGap) / displayConfig.grid.columns;
  }, [canvasWidth, displayConfig.grid.columns, displayConfig.grid.gap, mainColumnExtraGap]);
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
        mainColumnExtraGap={mainColumnExtraGap}
        sourceColumns={config.grid.columns}
        rowHeight={renderRowHeight}
        theme={resolveThemeSettings(displayConfig.theme)}
        isLayoutMode={effectiveLayoutMode}
        onEditWidget={onEditWidget}
        onRemoveWidget={onRemoveWidget}
        onUpdateWidget={onUpdateWidget}
        onWriteState={onWriteState}
        onDragAcrossPageEdge={onDragAcrossPageEdge}
        stateWrites={stateWrites}
        states={states}
      />
    ) : (
      <View style={[styles.canvas, { height: canvasHeight }]}>
        {displayConfig.widgets.map((widget) => {
          const style = {
            left: displayOffset(widget.position.x, cellWidth, displayConfig.grid.gap, mainColumnExtraGap),
            top: widget.position.y * (renderRowHeight + displayConfig.grid.gap),
            width: displaySpan(widget.position.x, widget.position.w, cellWidth, displayConfig.grid.gap, mainColumnExtraGap),
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
                onCommitPosition={(widgetId, position) =>
                  onUpdateWidget(widgetId, {
                    position: mapDisplayPositionToSourceHint(position, displayConfig.grid.columns, config.grid.columns),
                  })
                }
                onEdit={onEditWidget}
                onRemove={onRemoveWidget}
                rowHeight={renderRowHeight}
                widget={widget}
              >
                {renderWidget(
                  widget,
                  states,
                  client,
                  onUpdateWidget,
                  onWriteState,
                  displayConfig.theme,
                  stateWrites,
                  displayConfig.uiSounds?.widgetTypeDefaults,
                  onCameraFullscreenSwipeClose,
                  onCameraFullscreenVisibilityChange
                )}
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

function buildResponsiveAutoLayoutConfig(
  config: DashboardSettings,
  columns: number,
  options?: {
    isTabletLikeWeb?: boolean;
  }
): DashboardSettings {
  if (columns === 9) {
    return buildDesktopAutoLayoutConfig(config, options);
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
    const spec = getAutoLayoutSpec(widget, columns, options);
    const desiredStart = clamp(Math.round(widget.position.x), 0, Math.max(0, columns - spec.w));
    const desiredY = Math.max(0, widget.position.y);
    const bestStart = desiredStart;
    const bestY = Math.max(desiredY, ...columnHeights.slice(bestStart, bestStart + spec.w));
    const snappedBottom = ceilGridUnit(bestY + spec.h);

    for (let index = bestStart; index < bestStart + spec.w; index += 1) {
      columnHeights[index] = snappedBottom;
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

function buildDesktopAutoLayoutConfig(
  config: DashboardSettings,
  options?: {
    isTabletLikeWeb?: boolean;
  }
): DashboardSettings {
  const sourceColumns = Math.max(1, config.grid.columns);
  const mainColumnWidth = 3;
  const subColumnHeights = Array.from({ length: 9 }, () => 0);
  const sortedWidgets = [...config.widgets].sort((a, b) => {
    if (a.position.y !== b.position.y) {
      return a.position.y - b.position.y;
    }
    if (a.position.x !== b.position.x) {
      return a.position.x - b.position.x;
    }
    return a.id.localeCompare(b.id);
  });

  const widgets = sortedWidgets.map((widget) => {
    const spec = getAutoLayoutSpec(widget, 9, options);
    const desiredY = Math.max(0, widget.position.y);

    if (spec.w === 1) {
      const preferredSection = getPreferredDesktopSection(widget, sourceColumns);
      const sectionStart = preferredSection * mainColumnWidth;
      const localHint = clamp(
        Math.round(widget.position.x - preferredSection * sourceColumns / 3),
        0,
        mainColumnWidth - 1
      );
      const bestLocal = localHint;
      const bestY = Math.max(desiredY, subColumnHeights[sectionStart + bestLocal]);
      const snappedBottom = ceilGridUnit(bestY + spec.h);

      const targetIndex = sectionStart + bestLocal;
      subColumnHeights[targetIndex] = snappedBottom;

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
    const bestStartSection = preferredSection;

    const startIndex = bestStartSection * mainColumnWidth;
    const endIndex = startIndex + sectionSpan * mainColumnWidth;
    const bestY = Math.max(desiredY, ...subColumnHeights.slice(startIndex, endIndex));
    const snappedBottom = ceilGridUnit(bestY + spec.h);
    for (let index = startIndex; index < endIndex; index += 1) {
      subColumnHeights[index] = snappedBottom;
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
  const sectionWidth = sourceColumns / 3;
  const center = widget.position.x + widget.position.w / 2;
  return clamp(Math.floor(center / Math.max(1, sectionWidth)), 0, 2);
}

function getAutoLayoutSpec(
  widget: WidgetConfig,
  columns: number,
  options?: {
    isTabletLikeWeb?: boolean;
  }
) {
  const fallbackHeight = widget.position.h;

  if (columns === 1) {
    switch (widget.type) {
      case "state":
        return { w: 1, h: 1 };
      case "camera": {
        const ratio = normalizeAspectRatio(widget.snapshotAspectRatio);
        return { w: 1, h: Math.max(0.6, roundGridUnit(1 / ratio)) };
      }
      case "solar":
        return { w: 1, h: roundGridUnit(3.8) };
      case "grafana":
        return { w: 1, h: roundGridUnit(2.8) };
      case "weather":
        return { w: 1, h: roundGridUnit(1.8) };
      case "energy":
        return { w: 1, h: roundGridUnit(2) };
      case "numpad":
        return { w: 1, h: roundGridUnit(3) };
      case "link":
        return { w: 1, h: 1 };
    }

    return { w: 1, h: Math.max(1.5, roundGridUnit(fallbackHeight)) };
  }

  const mainColumnWidth = 3;
  const wideWidgetWidth = Math.min(mainColumnWidth * 2, columns);

  switch (widget.type) {
    case "state":
      return { w: 1, h: 1 };
    case "camera": {
      const ratio = normalizeAspectRatio(widget.snapshotAspectRatio);
      return { w: mainColumnWidth, h: Math.max(1, roundGridUnit(mainColumnWidth / ratio)) };
    }
    case "solar":
      return { w: mainColumnWidth, h: roundGridUnit(options?.isTabletLikeWeb ? 5.5 : 3.2) };
    case "grafana":
      return { w: mainColumnWidth, h: roundGridUnit(2.2) };
    case "weather":
      return { w: mainColumnWidth, h: roundGridUnit(2.2) };
    case "energy":
      return { w: mainColumnWidth, h: roundGridUnit(2.4) };
    case "numpad":
      return { w: mainColumnWidth, h: roundGridUnit(3.2) };
    case "link":
      return { w: 1, h: 1 };
  }

  return { w: 1, h: Math.max(1, roundGridUnit(fallbackHeight)) };
}

function normalizeAspectRatio(value?: number) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return 16 / 9;
  }
  return value;
}

function roundGridUnit(value: number) {
  return Math.round(value / GRID_SNAP) * GRID_SNAP;
}

function ceilGridUnit(value: number) {
  return Math.ceil(value / GRID_SNAP) * GRID_SNAP;
}

function mapDisplayPositionToSourceHint(position: WidgetConfig["position"], displayColumns: number, sourceColumns: number) {
  if (displayColumns <= 1 || sourceColumns <= 1 || displayColumns === sourceColumns) {
    return position;
  }

  const sectionCount = 3;
  const displaySectionWidth = displayColumns / sectionCount;
  const sourceSectionWidth = sourceColumns / sectionCount;
  const center = position.x + position.w / 2;
  const sectionIndex = clamp(Math.floor(center / Math.max(1, displaySectionWidth)), 0, sectionCount - 1);
  const displaySectionStart = sectionIndex * displaySectionWidth;
  const localX = clamp(position.x - displaySectionStart, 0, Math.max(0, displaySectionWidth - 0.5));
  const mappedX = sectionIndex * sourceSectionWidth + (localX / Math.max(1, displaySectionWidth)) * sourceSectionWidth;

  return {
    ...position,
    x: mappedX,
  };
}

function displayOffset(x: number, cellWidth: number, gap: number, mainColumnExtraGap: number) {
  const fullUnits = Math.floor(x);
  const partial = x - fullUnits;
  let offset = fullUnits * cellWidth + Math.max(0, fullUnits) * gap;

  if (mainColumnExtraGap > 0) {
    if (x >= 3) {
      offset += mainColumnExtraGap;
    }
    if (x >= 6) {
      offset += mainColumnExtraGap;
    }
  }

  return offset + partial * (cellWidth + gap);
}

function displaySpan(x: number, w: number, cellWidth: number, gap: number, mainColumnExtraGap: number) {
  const baseWidth = w * cellWidth + Math.max(0, w - 1) * gap;
  if (mainColumnExtraGap <= 0) {
    return baseWidth;
  }

  const startBoundary = x;
  const endBoundary = x + w;
  let extraInside = 0;

  for (const boundary of [3, 6]) {
    if (boundary > startBoundary && boundary < endBoundary) {
      extraInside += mainColumnExtraGap;
    }
  }

  return Math.max(cellWidth, baseWidth + extraInside);
}

function WebGridCanvas({
  config,
  mainColumnExtraGap,
  sourceColumns,
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
  onWriteState,
  onDragAcrossPageEdge,
  stateWrites,
}: {
  config: DashboardSettings;
  mainColumnExtraGap: number;
  sourceColumns: number;
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
  onWriteState: (stateId: string, value: unknown) => void | Promise<void>;
  onDragAcrossPageEdge?: (direction: "left" | "right", widgetId: string, position: WidgetConfig["position"]) => void;
  stateWrites?: Record<string, StateWriteFeedback>;
}) {
  const stepX = cellWidth + config.grid.gap;
  const stepY = rowHeight + config.grid.gap;

  return (
    <div style={{ ...webCanvasStyle, height: canvasHeight }}>
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
          onWriteState={onWriteState}
          onDragAcrossPageEdge={onDragAcrossPageEdge}
          stateWrites={stateWrites}
          allowManualLayout={true}
          allowResize={false}
          mainColumnExtraGap={mainColumnExtraGap}
          sourceColumns={sourceColumns}
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
  onWriteState,
  onDragAcrossPageEdge,
  stateWrites,
  allowManualLayout = true,
  allowResize = true,
  mainColumnExtraGap,
  sourceColumns,
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
  onWriteState: (stateId: string, value: unknown) => void | Promise<void>;
  onDragAcrossPageEdge?: (direction: "left" | "right", widgetId: string, position: WidgetConfig["position"]) => void;
  stateWrites?: Record<string, StateWriteFeedback>;
  allowManualLayout?: boolean;
  allowResize?: boolean;
  mainColumnExtraGap: number;
  sourceColumns: number;
}) {
  const [preview, setPreview] = useState(widget.position);
  const showHeaderTitle = widget.type !== "camera" && widget.showTitle !== false && Boolean(widget.title.trim());
  const interaction = useRef<{
    mode: "drag" | "resize";
    startX: number;
    startY: number;
    startPosition: WidgetConfig["position"];
  } | null>(null);
  const edgeDirectionRef = useRef<"left" | "right" | null>(null);

  useEffect(() => {
    setPreview(widget.position);
  }, [widget.position]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
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
        const nextPreview = constrainToPrimarySections({
          ...active.startPosition,
          x: clamp(active.startPosition.x + dx, 0, config.grid.columns - active.startPosition.w),
          y: Math.max(0, active.startPosition.y + dy),
        }, config.grid.columns);
        setPreview(nextPreview);

        if (isLayoutMode && onDragAcrossPageEdge) {
          const edgeThresholdPx = 72;
          const nextDirection =
            event.clientX <= edgeThresholdPx
              ? "left"
              : event.clientX >= window.innerWidth - edgeThresholdPx
                ? "right"
                : null;

          if (!nextDirection) {
            edgeDirectionRef.current = null;
          } else if (edgeDirectionRef.current !== nextDirection) {
            edgeDirectionRef.current = nextDirection;
            onDragAcrossPageEdge(
              nextDirection,
              widget.id,
              mapDisplayPositionToSourceHint(nextPreview, config.grid.columns, sourceColumns)
            );
          }
        }
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
      edgeDirectionRef.current = null;
      if (allowManualLayout) {
        onUpdateWidget(widget.id, {
          position: mapDisplayPositionToSourceHint(preview, config.grid.columns, sourceColumns),
        });
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [config.grid.columns, isLayoutMode, onDragAcrossPageEdge, onUpdateWidget, preview, sourceColumns, stepX, stepY, widget.id]);

  const begin =
    (mode: "drag" | "resize") =>
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      interaction.current = {
        mode,
        startX: event.clientX,
        startY: event.clientY,
        startPosition: preview,
      };
      edgeDirectionRef.current = null;
    };

  const shellStyle: CSSProperties = {
    ...webWidgetStyle,
    ...getWidgetTone(widget, theme),
    ...(widget.type === "camera"
      ? {
          border: "none",
          background: "#000000",
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
          contain: "layout paint style",
          isolation: "isolate",
        }
      : null),
    ...(widget.type === "grafana"
      ? {
          border: "none",
          background: "transparent",
          backdropFilter: "none",
          WebkitBackdropFilter: "none",
          boxShadow: "none",
          contain: "layout paint style",
          isolation: "isolate",
        }
      : null),
    left: displayOffset(preview.x, cellWidth, config.grid.gap, mainColumnExtraGap),
    top: preview.y * stepY,
    width: displaySpan(preview.x, preview.w, cellWidth, config.grid.gap, mainColumnExtraGap),
    height: preview.h * rowHeight + (preview.h - 1) * config.grid.gap,
    boxShadow: isLayoutMode ? "inset 0 0 0 1px rgba(77, 226, 177, 0.22)" : undefined,
  };

  const contentStyle = [
    styles.webContent,
    widget.type === "camera" || widget.type === "grafana" ? styles.webContentBleed : null,
    widget.type !== "camera" &&
    widget.type !== "solar" &&
    widget.type !== "state" &&
    widget.type !== "numpad" &&
    widget.type !== "grafana"
      ? styles.webContentInset
      : null,
    widget.type === "grafana" ? styles.webContentGrafana : null,
  ];

  return (
    <div style={shellStyle}>
      {isLayoutMode && allowManualLayout ? <div onPointerDown={begin("drag")} style={webWidgetDragSurfaceStyle} /> : null}
      {showHeaderTitle ? (
        <div style={webTitleBadgeStyle}>
          <div style={{ ...webTitleStyle, color: widget.appearance?.textColor || palette.text }}>{widget.title}</div>
        </div>
      ) : null}
      {isLayoutMode ? (
        <div style={webControlsStyle}>
          <button
            onClick={() => {
              playConfiguredUiSound(config.uiSounds?.pageSounds?.widgetEdit, "panel", `widget-edit:${widget.id}`);
              onEditWidget(widget.id);
            }}
            style={webIconButtonStyle}
            type="button"
          >
            ⋯
          </button>
          <button onClick={() => onRemoveWidget(widget.id)} style={webIconButtonStyle} type="button">
            ×
          </button>
        </div>
      ) : null}
      <View style={contentStyle}>
        {renderWidget(
          widget,
          states,
          client,
          onUpdateWidget,
          onWriteState,
          config.theme,
          stateWrites,
          config.uiSounds?.widgetTypeDefaults
        )}
      </View>
      {isLayoutMode && allowManualLayout && allowResize ? (
        <div style={webFooterOverlayStyle}>
          <div onPointerDown={begin("resize")} style={webResizeHandleStyle} title="Skalieren" />
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
  onWriteState: (stateId: string, value: unknown) => void | Promise<void>,
  theme?: DashboardSettings["theme"],
  stateWrites?: Record<string, StateWriteFeedback>,
  widgetTypeDefaults?: Partial<Record<WidgetType, WidgetInteractionSounds>>,
  onCameraFullscreenSwipeClose?: () => void,
  onCameraFullscreenVisibilityChange?: (widgetId: string, open: boolean) => void
) {
  const effectiveWidget = mergeWidgetInteractionSounds(widget, widgetTypeDefaults?.[widget.type]);

  if (effectiveWidget.type === "state") {
    return (
      <StateWidget
        addonValue={effectiveWidget.addonStateId ? states[effectiveWidget.addonStateId] : undefined}
        config={effectiveWidget}
        interactionState={stateWrites?.[effectiveWidget.stateId]?.status || "idle"}
        value={states[effectiveWidget.stateId]}
        onToggle={() =>
          onWriteState(
            effectiveWidget.stateId,
            resolveStateNextValue(effectiveWidget, states[effectiveWidget.stateId])
          )
        }
      />
    );
  }

  if (effectiveWidget.type === "camera") {
    return (
      <CameraWidget
        config={effectiveWidget}
        maximizeStateValue={effectiveWidget.maximizeStateId ? states[effectiveWidget.maximizeStateId] : undefined}
        onFullscreenSwipeClose={onCameraFullscreenSwipeClose}
        onFullscreenVisibilityChange={(open) => onCameraFullscreenVisibilityChange?.(effectiveWidget.id, open)}
        onAspectRatioDetected={(ratio) => {
          if (!Number.isFinite(ratio) || ratio <= 0) {
            return;
          }

          const currentRatio = normalizeAspectRatio(effectiveWidget.snapshotAspectRatio);
          if (Math.abs(currentRatio - ratio) < 0.02) {
            return;
          }

          onUpdateWidget(effectiveWidget.id, { snapshotAspectRatio: ratio });
        }}
      />
    );
  }

  if (effectiveWidget.type === "energy") {
    return <EnergyWidget config={effectiveWidget} states={states} />;
  }

  if (effectiveWidget.type === "solar") {
    return <SolarWidget config={effectiveWidget} states={states} theme={theme} />;
  }

  if (effectiveWidget.type === "grafana") {
    return <GrafanaWidget config={effectiveWidget} />;
  }

  if (effectiveWidget.type === "weather") {
    return <WeatherWidget config={effectiveWidget} />;
  }

  if (effectiveWidget.type === "numpad") {
    return <NumpadWidget config={effectiveWidget} />;
  }

  if (effectiveWidget.type === "link") {
    return <LinkWidget config={effectiveWidget} />;
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
    borderRadius: 0,
    padding: 10,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
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

function mergeWidgetInteractionSounds(
  widget: WidgetConfig,
  defaults?: WidgetInteractionSounds
): WidgetConfig {
  if (!defaults) {
    return widget;
  }

  return {
    ...widget,
    interactionSounds: {
      press: widget.interactionSounds?.press?.length ? widget.interactionSounds.press : defaults.press,
      confirm: widget.interactionSounds?.confirm?.length ? widget.interactionSounds.confirm : defaults.confirm,
      open: widget.interactionSounds?.open?.length ? widget.interactionSounds.open : defaults.open,
      close: widget.interactionSounds?.close?.length ? widget.interactionSounds.close : defaults.close,
      scroll: widget.interactionSounds?.scroll?.length ? widget.interactionSounds.scroll : defaults.scroll,
    },
  } as WidgetConfig;
}

function snapUnits(value: number) {
  return Math.round(value / GRID_SNAP) * GRID_SNAP;
}

const webCanvasStyle: CSSProperties = {
  position: "relative",
  margin: 20,
  borderRadius: 0,
  padding: 12,
  background: "transparent",
  border: "none",
  overflow: "visible",
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
  if (type === "numpad") {
    return {
      background: "linear-gradient(135deg, rgba(214, 188, 166, 0.94), rgba(173, 122, 82, 0.92))",
      border: "1px solid rgba(255, 220, 184, 0.24)",
      boxShadow: "0 16px 26px rgba(54, 28, 10, 0.28)",
    };
  }
  if (type === "link") {
    return {
      background: "linear-gradient(135deg, rgba(16, 34, 66, 0.94), rgba(10, 20, 40, 0.96))",
      border: "1px solid rgba(126, 168, 255, 0.24)",
      boxShadow: "0 14px 24px rgba(6, 16, 32, 0.32)",
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
