import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { CSSProperties } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useDashboardConfig } from "../context/DashboardConfigContext";
import { WidgetConfig } from "../types/dashboard";
import { constrainToPrimarySections, GRID_SNAP, GRID_VERTICAL_SNAP } from "../utils/gridLayout";
import { playConfiguredUiSound } from "../utils/uiSounds";
import { palette } from "../utils/theme";

type WidgetFrameProps = {
  widget: WidgetConfig;
  cellWidth: number;
  rowHeight: number;
  gap: number;
  columns: number;
  isLayoutMode: boolean;
  allowManualLayout?: boolean;
  allowResize?: boolean;
  onCommitPosition: (widgetId: string, next: WidgetConfig["position"]) => void;
  onEdit: (widgetId: string) => void;
  onRemove: (widgetId: string) => void;
  children: React.ReactNode;
};

export function WidgetFrame({
  widget,
  cellWidth,
  rowHeight,
  gap,
  columns,
  isLayoutMode,
  allowManualLayout = true,
  allowResize = true,
  onCommitPosition,
  onEdit,
  onRemove,
  children,
}: WidgetFrameProps) {
  const { config } = useDashboardConfig();
  const linkBorderless =
    widget.type === "link" &&
    Boolean(widget.iconImage) &&
    widget.iconImageSizeMode === "maximized" &&
    widget.iconImageBorderless === true;
  const showHeaderTitle =
    widget.type !== "camera" &&
    widget.type !== "wallbox" &&
    widget.type !== "goe" &&
    widget.type !== "heating" &&
    widget.type !== "heatingV2" &&
    widget.showTitle !== false &&
    Boolean(widget.title.trim());
  const interaction = useRef<{
    mode: "drag" | "resize";
    startX: number;
    startY: number;
    startPosition: WidgetConfig["position"];
  } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [interactionMode, setInteractionMode] = useState<"drag" | "resize" | null>(null);
  const useFreeGridConstraint = columns <= 3;
  const isVerticalResizeWidget =
    widget.type === "camera" ||
    widget.type === "solar" ||
    widget.type === "weather" ||
    widget.type === "grafana" ||
    widget.type === "log" ||
    widget.type === "script" ||
    widget.type === "host" ||
    widget.type === "raspberryPiStats" ||
    widget.type === "wallbox" ||
    widget.type === "goe" ||
    widget.type === "heating" ||
    widget.type === "heatingV2";

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const current = interaction.current;
      if (!current) {
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }

      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;

      if (current.mode === "drag") {
        setDragOffset({ x: dx, y: dy });
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = interaction.current;
      if (!current) {
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }

      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      const xSteps = snap(dx / (cellWidth + gap));
      const ySteps = snapWithStep(
        dy / (rowHeight + gap),
        current.mode === "resize" && isVerticalResizeWidget ? 0.1 : GRID_VERTICAL_SNAP
      );

      if (current.mode === "drag") {
        onCommitPosition(widget.id, constrainPositionForLayout({
          ...current.startPosition,
          x: clamp(current.startPosition.x + xSteps, 0, columns - current.startPosition.w),
          y: Math.max(0, current.startPosition.y + ySteps),
        }, columns, widget.type, useFreeGridConstraint, widget.type === "camera" ? { minHeight: 0.5, heightSnap: 0.1 } : widget.type === "solar" ? { minHeight: 2.5, heightSnap: 0.1 } : undefined));
      } else {
        if (isVerticalResizeWidget) {
          const minHeight = widget.type === "camera" ? 0.5 : widget.type === "solar" ? 2.5 : 1;
          onCommitPosition(widget.id, constrainPositionForLayout({
            ...current.startPosition,
            w: current.startPosition.w,
            h: Math.max(minHeight, current.startPosition.h + ySteps),
          }, columns, widget.type, useFreeGridConstraint, { minHeight, heightSnap: 0.1 }));
        } else {
          onCommitPosition(widget.id, constrainPositionForLayout({
            ...current.startPosition,
            w: clamp(current.startPosition.w + xSteps, 1, columns),
            h: Math.max(1, current.startPosition.h + ySteps),
          }, columns, widget.type, useFreeGridConstraint));
        }
      }

      interaction.current = null;
      setInteractionMode(null);
      setDragOffset({ x: 0, y: 0 });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [cellWidth, columns, gap, isVerticalResizeWidget, onCommitPosition, rowHeight, useFreeGridConstraint, widget]);

  const beginInteraction = (mode: "drag" | "resize", clientX: number, clientY: number) => {
    interaction.current = {
      mode,
      startX: clientX,
      startY: clientY,
      startPosition: widget.position,
    };
    setInteractionMode(mode);
  };

  const handleWebPointerDown =
    (mode: "drag" | "resize") =>
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      beginInteraction(mode, event.clientX, event.clientY);
    };

  return (
    <View
      style={[
        styles.shell,
        widget.type === "state" || widget.type === "camera" || linkBorderless ? styles.shellTransparent : null,
        interactionMode === "drag"
          ? {
              transform: [{ translateX: dragOffset.x }, { translateY: dragOffset.y }],
              zIndex: 50,
            }
          : null,
      ]}
    >
      {showHeaderTitle ? (
        <View style={styles.titleBadge}>
          <Text style={styles.title}>{widget.title}</Text>
        </View>
      ) : null}
      {isLayoutMode ? (
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => {
              playConfiguredUiSound(config.uiSounds?.pageSounds?.widgetEdit, "panel", `widget-edit:${widget.id}`);
              onEdit(widget.id);
            }}
            style={styles.iconButton}
          >
            <MaterialCommunityIcons color={palette.text} name="dots-horizontal" size={18} />
          </Pressable>
          <Pressable onPress={() => onRemove(widget.id)} style={styles.iconButton}>
            <MaterialCommunityIcons color={palette.textMuted} name="close" size={18} />
          </Pressable>
        </View>
      ) : null}
      {Platform.OS === "web" && isLayoutMode && allowManualLayout ? (
        <div
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onPointerDown={handleWebPointerDown("drag")}
          style={webDragLayerStyle}
        />
      ) : null}
      <View
        style={[
          styles.content,
          widget.type !== "camera" &&
          widget.type !== "solar" &&
          widget.type !== "state" &&
          widget.type !== "wallbox" &&
          widget.type !== "goe" &&
          widget.type !== "heating" &&
          widget.type !== "heatingV2" &&
          widget.type !== "grafana" &&
          !linkBorderless
            ? styles.contentInset
            : null,
        ]}
      >
        {children}
      </View>
      {isLayoutMode && allowManualLayout && allowResize ? (
        <View pointerEvents="box-none" style={styles.resizeWrap}>
          <View style={styles.resizeHandle}>
            <MaterialCommunityIcons color={palette.textMuted} name="resize-bottom-right" size={18} />
          </View>
          {Platform.OS === "web" ? (
            <div
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              onPointerDown={handleWebPointerDown("resize")}
              style={webResizeLayerStyle}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const snap = (value: number) => Math.round(value / GRID_SNAP) * GRID_SNAP;
const snapWithStep = (value: number, step: number) => Math.round(value / step) * step;

function constrainPositionForLayout(
  position: WidgetConfig["position"],
  columns: number,
  widgetType: WidgetConfig["type"],
  useFreeGridConstraint: boolean,
  options?: {
    minHeight?: number;
    heightSnap?: number;
  }
) {
  if (!useFreeGridConstraint) {
    return constrainToPrimarySections(position, columns, options);
  }

  const minHeight = options?.minHeight ?? 1;
  const heightSnap = options?.heightSnap ?? (widgetType === "camera" || widgetType === "solar" ? 0.1 : GRID_SNAP);
  const w = clamp(snap(position.w), 1, columns);
  const h = Math.max(minHeight, snapWithStep(position.h, heightSnap));
  const x = clamp(snap(position.x), 0, Math.max(0, columns - w));
  const y = Math.max(0, snapWithStep(position.y, GRID_VERTICAL_SNAP));

  return { x, y, w, h };
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: palette.panel,
    borderWidth: 0,
    overflow: "hidden",
  },
  shellTransparent: {
    backgroundColor: "transparent",
  },
  headerActions: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    zIndex: 10,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  title: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
  titleBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    maxWidth: "74%",
    zIndex: 10,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(4, 8, 14, 0.34)",
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  contentInset: {
    padding: 16,
  },
  resizeWrap: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 50,
    height: 50,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    zIndex: 18,
  },
  resizeHandle: {
    position: "absolute",
    right: 0,
    bottom: 0,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 19,
  },
});

const webDragLayerStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  cursor: "grab",
  zIndex: 8,
  userSelect: "none",
  WebkitUserSelect: "none",
  touchAction: "none",
};

const webResizeLayerStyle: CSSProperties = {
  position: "absolute",
  top: "auto",
  right: 0,
  bottom: 0,
  left: "auto",
  width: "50px",
  height: "50px",
  cursor: "nwse-resize",
  zIndex: 30,
  userSelect: "none",
  WebkitUserSelect: "none",
  touchAction: "none",
};
