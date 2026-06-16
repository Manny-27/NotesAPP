export type BoardViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type BoardPoint = {
  x: number;
  y: number;
};

export const minBoardZoom = 0.25;
export const maxBoardZoom = 3;
export const boardZoomStep = 0.1;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(maxBoardZoom, Math.max(minBoardZoom, zoom));
}

export function screenToWorld(
  point: BoardPoint,
  viewport: BoardViewport,
): BoardPoint {
  const zoom = clampZoom(viewport.zoom);
  return {
    x: (point.x - viewport.x) / zoom,
    y: (point.y - viewport.y) / zoom,
  };
}

export function worldToScreen(
  point: BoardPoint,
  viewport: BoardViewport,
): BoardPoint {
  const zoom = clampZoom(viewport.zoom);
  return {
    x: point.x * zoom + viewport.x,
    y: point.y * zoom + viewport.y,
  };
}

export function zoomAtPoint(
  viewport: BoardViewport,
  screenPoint: BoardPoint,
  nextZoom: number,
): BoardViewport {
  const zoom = clampZoom(nextZoom);
  const worldPoint = screenToWorld(screenPoint, viewport);

  return {
    x: screenPoint.x - worldPoint.x * zoom,
    y: screenPoint.y - worldPoint.y * zoom,
    zoom,
  };
}
