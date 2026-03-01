import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { CSSProperties } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WidgetConfig } from "../types/dashboard";
import { constrainToPrimarySections, GRID_SNAP } from "../utils/gridLayout";
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
  const showHeaderTitle = widget.type !== "camera" && widget.showTitle !== false && Boolean(widget.title.trim());
  const interaction = useRef<{
    mode: "drag" | "resize";
    startX: number;
    startY: number;
    startPosition: WidgetConfig["position"];
  } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [interactionMode, setInteractionMode] = useState<"drag" | "resize" | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || !interaction.current) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const current = interaction.current;
      if (!current) {
        return;
      }

      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;

      if (current.mode === "drag") {
        setDragOffset({ x: dx, y: dy });
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      const current = interaction.current;
      if (!current) {
        return;
      }

      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      const xSteps = snap(dx / (cellWidth + gap));
      const ySteps = snap(dy / (rowHeight + gap));

      if (current.mode === "drag") {
        onCommitPosition(widget.id, constrainToPrimarySections({
          ...widget.position,
          x: clamp(current.startPosition.x + xSteps, 0, columns - current.startPosition.w),
          y: Math.max(0, current.startPosition.y + ySteps),
        }, columns));
      } else {
        onCommitPosition(widget.id, constrainToPrimarySections({
          ...widget.position,
          w: clamp(current.startPosition.w + xSteps, 1, columns),
          h: Math.max(1, current.startPosition.h + ySteps),
        }, columns));
      }

      interaction.current = null;
      setInteractionMode(null);
      setDragOffset({ x: 0, y: 0 });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [cellWidth, columns, gap, onCommitPosition, rowHeight, widget]);

  const beginInteraction = (mode: "drag" | "resize", clientX: number, clientY: number) => {
    interaction.current = {
      mode,
      startX: clientX,
      startY: clientY,
      startPosition: widget.position,
    };
    setInteractionMode(mode);
  };

  const handleWebMouseDown =
    (mode: "drag" | "resize") =>
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      beginInteraction(mode, event.clientX, event.clientY);
    };

  return (
    <View
      style={[
        styles.shell,
        widget.type === "state" ? styles.shellTransparent : null,
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
          <Pressable onPress={() => onEdit(widget.id)} style={styles.iconButton}>
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
          onMouseDown={handleWebMouseDown("drag")}
          style={webDragLayerStyle}
        />
      ) : null}
      <View
        style={[
          styles.content,
          widget.type !== "camera" && widget.type !== "solar" && widget.type !== "state" ? styles.contentInset : null,
        ]}
      >
        {children}
      </View>
      <View pointerEvents="box-none" style={styles.footerRow}>
        <View />
        {isLayoutMode && allowManualLayout && allowResize ? (
          <View style={styles.resizeHandle}>
            <MaterialCommunityIcons color={palette.textMuted} name="resize-bottom-right" size={18} />
          </View>
        ) : null}
        {Platform.OS === "web" && isLayoutMode && allowManualLayout && allowResize ? (
          <div
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onMouseDown={handleWebMouseDown("resize")}
            style={webResizeLayerStyle}
          />
        ) : null}
      </View>
    </View>
  );
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const snap = (value: number) => Math.round(value / GRID_SNAP) * GRID_SNAP;

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
  footerRow: {
    position: "absolute",
    right: 12,
    bottom: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  resizeHandle: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
});

const webDragLayerStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  cursor: "grab",
  zIndex: 5,
  userSelect: "none",
  WebkitUserSelect: "none",
  touchAction: "none",
};

const webResizeLayerStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  cursor: "nwse-resize",
  zIndex: 5,
  userSelect: "none",
  WebkitUserSelect: "none",
  touchAction: "none",
};
