import { GridPosition, WidgetConfig } from "../types/dashboard";

export const GRID_SNAP = 0.5;
export const PRIMARY_SECTION_COUNT = 3;

export function resolveWidgetPosition(
  widgets: WidgetConfig[],
  widgetId: string,
  proposed: GridPosition,
  columns: number
): GridPosition {
  const sanitized = sanitizePosition(proposed, columns);
  const others = widgets.filter((widget) => widget.id !== widgetId);
  if (!others.some((widget) => overlaps(sanitized, widget.position))) {
    return sanitized;
  }

  return findNearestFreeSlot(others, sanitized, columns);
}

export function normalizeWidgetLayout(widgets: WidgetConfig[], columns: number): WidgetConfig[] {
  const placed: WidgetConfig[] = [];

  for (const widget of widgets) {
    const nextPosition = resolveWidgetPosition(placed, widget.id, widget.position, columns);
    placed.push({
      ...widget,
      position: nextPosition,
    });
  }

  return placed;
}

export function constrainToPrimarySections(position: GridPosition, columns: number): GridPosition {
  const sectionWidth = getPrimarySectionWidth(columns);
  const subColumnWidth = sectionWidth / PRIMARY_SECTION_COUNT;
  const maxWidth = sectionWidth;
  const minWidth = Math.min(maxWidth, subColumnWidth);
  const snappedWidth = snapToSubColumns(position.w, subColumnWidth, 1);
  const w = clamp(snappedWidth, minWidth, maxWidth);
  const h = Math.max(1, snap(position.h));
  const y = Math.max(0, snap(position.y));
  const tentativeX = Math.max(0, position.x);
  const center = tentativeX + w / 2;
  const sectionIndex = clamp(Math.floor(center / sectionWidth), 0, PRIMARY_SECTION_COUNT - 1);
  const sectionStart = sectionIndex * sectionWidth;
  const sectionEnd = Math.min(columns, (sectionIndex + 1) * sectionWidth);
  const localX = clamp(tentativeX - sectionStart, 0, Math.max(0, sectionEnd - sectionStart - w));
  const snappedLocalX = snapToSubColumns(localX, subColumnWidth, 0);
  const x = clamp(sectionStart + snappedLocalX, sectionStart, Math.max(sectionStart, sectionEnd - w));

  return { x, y, w, h };
}

export function getPrimarySectionWidth(columns: number) {
  return Math.max(1, columns / PRIMARY_SECTION_COUNT);
}

function sanitizePosition(position: GridPosition, columns: number): GridPosition {
  const w = clamp(snap(position.w), 1, columns);
  const h = Math.max(1, snap(position.h));
  const x = clamp(snap(position.x), 0, Math.max(0, columns - w));
  const y = Math.max(0, snap(position.y));

  return { x, y, w, h };
}

function overlaps(a: GridPosition, b: GridPosition) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function findNearestFreeSlot(
  widgets: WidgetConfig[],
  proposed: GridPosition,
  columns: number
): GridPosition {
  const maxX = Math.max(0, columns - proposed.w);
  const startY = proposed.y;
  const scanDepth = Math.max(startY + 40, getMaxRow(widgets) + 20);

  for (let y = startY; y <= scanDepth; y += GRID_SNAP) {
    for (let x = 0; x <= maxX; x += GRID_SNAP) {
      const candidate = { ...proposed, x, y };
      if (!widgets.some((widget) => overlaps(candidate, widget.position))) {
        return candidate;
      }
    }
  }

  return {
    ...proposed,
    x: 0,
    y: scanDepth + 1,
  };
}

function getMaxRow(widgets: WidgetConfig[]) {
  return widgets.reduce((max, widget) => Math.max(max, widget.position.y + widget.position.h), 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function snap(value: number) {
  return Math.round(value / GRID_SNAP) * GRID_SNAP;
}

function snapToSubColumns(value: number, subColumnWidth: number, minSteps: number) {
  const steps = Math.max(minSteps, Math.round(value / subColumnWidth));
  return steps * subColumnWidth;
}
