import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { IoBrokerClient } from "../services/iobroker";
import { DashboardSettings, StateSnapshot, WidgetConfig } from "../types/dashboard";
import { GRID_SNAP } from "../utils/gridLayout";
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
  const canvasInset = Platform.OS === "web" ? 64 : 60;
  const availableWidth = containerWidth > 0 ? containerWidth : windowWidth;
  const canvasWidth = Math.max(320, availableWidth - canvasInset);
  const cellWidth = useMemo(() => {
    const totalGap = (config.grid.columns - 1) * config.grid.gap;
    return (canvasWidth - totalGap) / config.grid.columns;
  }, [canvasWidth, config.grid.columns, config.grid.gap]);

  const canvasHeight = useMemo(() => {
    const maxRow = config.widgets.reduce((largest, widget) => {
      const bottom = widget.position.y + widget.position.h;
      return Math.max(largest, bottom);
    }, 0);
    return maxRow * (config.grid.rowHeight + config.grid.gap) + 120;
  }, [config.grid.gap, config.grid.rowHeight, config.widgets]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setContainerWidth(nextWidth);
    onLayoutMeasured?.(nextWidth);
  };

  const content =
    Platform.OS === "web" ? (
      <WebGridCanvas
        canvasHeight={canvasHeight}
        cellWidth={cellWidth}
        client={client}
        config={config}
        theme={resolveThemeSettings(config.theme)}
        isLayoutMode={isLayoutMode}
        onEditWidget={onEditWidget}
        onRemoveWidget={onRemoveWidget}
        onUpdateWidget={onUpdateWidget}
        states={states}
      />
    ) : (
      <View style={[styles.canvas, { minHeight: canvasHeight }]}>
        <View pointerEvents="none" style={styles.gridOverlay}>
          {Array.from({ length: Math.round(config.grid.columns / GRID_SNAP) + 1 }).map((_, index) => (
            <View
              key={`col-${index}`}
              style={[
                styles.gridLine,
                {
                  left: fineGridOffset(index, cellWidth, config.grid.gap),
                },
              ]}
            />
          ))}
          {Array.from({ length: Math.round(canvasHeight / ((config.grid.rowHeight + config.grid.gap) * GRID_SNAP)) + 1 }).map(
            (_, index) => (
              <View
                key={`row-${index}`}
                style={[
                  styles.gridRowLine,
                  {
                    top: fineGridOffset(index, config.grid.rowHeight, config.grid.gap),
                  },
                ]}
              />
            )
          )}
        </View>
        {config.widgets.map((widget) => {
          const style = {
            left: widget.position.x * (cellWidth + config.grid.gap),
            top: widget.position.y * (config.grid.rowHeight + config.grid.gap),
            width: widget.position.w * cellWidth + (widget.position.w - 1) * config.grid.gap,
            height: widget.position.h * config.grid.rowHeight + (widget.position.h - 1) * config.grid.gap,
          };

          return (
            <View key={widget.id} style={[styles.widget, style]}>
              <WidgetFrame
                cellWidth={cellWidth}
                columns={config.grid.columns}
                gap={config.grid.gap}
                isLayoutMode={isLayoutMode}
                onCommitPosition={(widgetId, position) => onUpdateWidget(widgetId, { position })}
                onEdit={onEditWidget}
                onRemove={onRemoveWidget}
                rowHeight={config.grid.rowHeight}
                widget={widget}
              >
                {renderWidget(widget, states, client, onUpdateWidget, config.theme)}
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

function WebGridCanvas({
  config,
  theme,
  states,
  client,
  cellWidth,
  canvasHeight,
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
  isLayoutMode: boolean;
  onEditWidget: (widgetId: string) => void;
  onUpdateWidget: (widgetId: string, partial: Partial<WidgetConfig>) => void;
  onRemoveWidget: (widgetId: string) => void;
}) {
  const stepX = cellWidth + config.grid.gap;
  const stepY = config.grid.rowHeight + config.grid.gap;

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
            top: fineGridOffset(index, config.grid.rowHeight, config.grid.gap),
          }}
        />
      ))}
      {config.widgets.map((widget) => (
        <WebWidgetShell
          key={widget.id}
          cellWidth={cellWidth}
          client={client}
          config={config}
          theme={theme}
          isLayoutMode={isLayoutMode}
          onEditWidget={onEditWidget}
          onRemoveWidget={onRemoveWidget}
          onUpdateWidget={onUpdateWidget}
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
}: {
  widget: WidgetConfig;
  config: DashboardSettings;
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
}) {
  const [preview, setPreview] = useState(widget.position);
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

      if (active.mode === "drag") {
        setPreview({
          ...active.startPosition,
          x: clamp(active.startPosition.x + dx, 0, config.grid.columns - active.startPosition.w),
          y: Math.max(0, active.startPosition.y + dy),
        });
      } else {
        setPreview({
          ...active.startPosition,
          w: clamp(active.startPosition.w + dx, 1, config.grid.columns - active.startPosition.x),
          h: Math.max(1, active.startPosition.h + dy),
        });
      }
    };

    const handleUp = () => {
      const active = interaction.current;
      if (!active) {
        return;
      }
      interaction.current = null;
      onUpdateWidget(widget.id, { position: preview });
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
    left: preview.x * stepX,
    top: preview.y * stepY,
    width: preview.w * cellWidth + (preview.w - 1) * config.grid.gap,
    height: preview.h * config.grid.rowHeight + (preview.h - 1) * config.grid.gap,
    boxShadow: isLayoutMode ? "inset 0 0 0 1px rgba(77, 226, 177, 0.22)" : undefined,
  };

  return (
    <div style={shellStyle}>
      <div style={webHeaderStyle}>
        <div>
          <div style={{ ...webTitleStyle, color: widget.appearance?.textColor || palette.text }}>{widget.title}</div>
          <div style={{ ...webSubtitleStyle, color: widget.appearance?.mutedTextColor || palette.textMuted }}>
            {widget.type.toUpperCase()}
          </div>
        </div>
        <div style={webHeaderActionsStyle}>
          {isLayoutMode ? (
            <div onMouseDown={begin("drag")} style={webDragHandleStyle} title="Verschieben">
              <span style={webGripDotStyle} />
              <span style={webGripDotStyle} />
              <span style={webGripDotStyle} />
              <span style={webGripDotStyle} />
              <span style={webGripDotStyle} />
              <span style={webGripDotStyle} />
            </div>
          ) : null}
          <button onClick={() => onEditWidget(widget.id)} style={webPrimaryButtonStyle} type="button">
            Bearbeiten
          </button>
          <button onClick={() => onRemoveWidget(widget.id)} style={webIconButtonStyle} type="button">
            ×
          </button>
        </div>
      </div>
      <View style={styles.webContent}>
        {renderWidget(widget, states, client, onUpdateWidget, config.theme)}
      </View>
      {isLayoutMode ? (
        <div style={webFooterStyle}>
          <span style={webHintStyle}>Snap: 0.5 Raster</span>
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
  padding: 16,
  background: "linear-gradient(180deg, rgba(29,35,55,0.94), rgba(20,24,40,0.96))",
  border: `1px solid ${palette.border}`,
  boxSizing: "border-box",
  gap: 10,
  overflow: "hidden",
  boxShadow: "0 16px 24px rgba(0,0,0,0.22)",
  backdropFilter: "blur(12px)",
};

const webHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 8,
};

const webTitleStyle: CSSProperties = {
  color: palette.text,
  fontSize: 17,
  fontWeight: 700,
};

const webSubtitleStyle: CSSProperties = {
  color: palette.textMuted,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.7,
  marginTop: 2,
};

const webHeaderActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const webPrimaryButtonStyle: CSSProperties = {
  borderRadius: 14,
  padding: "8px 12px",
  border: "1px solid rgba(92, 124, 255, 0.24)",
  background: "rgba(92, 124, 255, 0.14)",
  color: palette.text,
  fontWeight: 700,
  cursor: "pointer",
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
};

const webDragHandleStyle: CSSProperties = {
  width: 32,
  height: 32,
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 3,
  padding: 6,
  borderRadius: 16,
  border: `1px solid ${palette.border}`,
  background: "rgba(255,255,255,0.04)",
  cursor: "grab",
  userSelect: "none",
  WebkitUserSelect: "none",
  boxSizing: "border-box",
  alignItems: "center",
  justifyItems: "center",
};

const webGripDotStyle: CSSProperties = {
  width: 4,
  height: 4,
  borderRadius: 999,
  background: palette.textMuted,
  opacity: 0.7,
};

const webFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginTop: "auto",
  paddingTop: 10,
  borderTop: `1px solid ${palette.border}`,
};

const webHintStyle: CSSProperties = {
  color: palette.textMuted,
  fontSize: 11,
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
      background: `linear-gradient(135deg, ${theme.widgetTones.stateStart} 0%, ${theme.widgetTones.stateEnd} 100%)`,
      border: "1px solid rgba(255,255,255,0.1)",
      boxShadow: "0 18px 30px rgba(98, 10, 46, 0.32)",
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
