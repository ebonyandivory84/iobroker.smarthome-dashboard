import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { CSSProperties } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WidgetConfig } from "../types/dashboard";
import { GRID_SNAP } from "../utils/gridLayout";
import { palette } from "../utils/theme";

type WidgetFrameProps = {
  widget: WidgetConfig;
  cellWidth: number;
  rowHeight: number;
  gap: number;
  columns: number;
  isLayoutMode: boolean;
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
  onCommitPosition,
  onEdit,
  onRemove,
  children,
}: WidgetFrameProps) {
  const showHeaderTitle = widget.showTitle !== false && Boolean(widget.title.trim());
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
        onCommitPosition(widget.id, {
          ...widget.position,
          x: clamp(current.startPosition.x + xSteps, 0, columns - current.startPosition.w),
          y: Math.max(0, current.startPosition.y + ySteps),
        });
      } else {
        onCommitPosition(widget.id, {
          ...widget.position,
          w: clamp(current.startPosition.w + xSteps, 1, columns - current.startPosition.x),
          h: Math.max(1, current.startPosition.h + ySteps),
        });
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
        interactionMode === "drag"
          ? {
              transform: [{ translateX: dragOffset.x }, { translateY: dragOffset.y }],
              zIndex: 50,
            }
          : null,
      ]}
    >
      {showHeaderTitle || isLayoutMode ? (
        <View style={styles.header}>
          <View>{showHeaderTitle ? <Text style={styles.title}>{widget.title}</Text> : null}</View>
          {isLayoutMode ? (
            <View style={styles.headerActions}>
              <Pressable onPress={() => onEdit(widget.id)} style={styles.editButton}>
                <MaterialCommunityIcons color={palette.text} name="tune-variant" size={16} />
                <Text style={styles.editButtonLabel}>Bearbeiten</Text>
              </Pressable>
              <Pressable onPress={() => onRemove(widget.id)} style={styles.iconButton}>
                <MaterialCommunityIcons color={palette.textMuted} name="close" size={18} />
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
      {isLayoutMode ? (
        <View style={styles.dragStrip}>
          <MaterialCommunityIcons color={palette.textMuted} name="drag-horizontal-variant" size={18} />
          <Text style={styles.dragStripText}>Ziehen zum Verschieben</Text>
        </View>
      ) : null}
      {Platform.OS === "web" ? (
        <div
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onMouseDown={handleWebMouseDown("drag")}
          style={webDragLayerStyle}
        />
      ) : null}
      <View style={styles.content}>{children}</View>
      <View style={styles.footerRow}>
        {isLayoutMode ? <Text style={styles.layoutHint}>Snap: 0.5 Raster</Text> : <View />}
        {isLayoutMode ? (
          <View style={styles.resizeHandle}>
            <MaterialCommunityIcons color={palette.textMuted} name="resize-bottom-right" size={18} />
            <Text style={styles.resizeText}>Skalieren</Text>
          </View>
        ) : null}
        {Platform.OS === "web" ? (
          <div
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onMouseDown={isLayoutMode ? handleWebMouseDown("resize") : undefined}
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
    padding: 16,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
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
    fontSize: 17,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(77, 226, 177, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(77, 226, 177, 0.25)",
  },
  editButtonLabel: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "700",
  },
  dragStrip: {
    marginBottom: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    position: "relative",
  },
  dragStripText: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  footerRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  layoutHint: {
    color: palette.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  resizeHandle: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    position: "relative",
  },
  resizeText: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: "700",
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
