import {
  Copy,
  ExternalLink,
  Grip,
  Lock,
  Pin,
  PinOff,
  Play,
  Trash2,
  Unlock,
} from "lucide-react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent,
} from "react";
import { memo, useEffect, useRef, useState } from "react";
import type { BoardDocument, BoardItem, BoardViewport } from "../api";
import { FloatingBoardToolbar, type BoardTool } from "./board/FloatingBoardToolbar";
import {
  createCodeItem,
  createLinkItem,
  createTextItem,
  createYoutubeItem,
  normalizeBoardDocument,
  safeHttpUrl,
  youtubeEmbedUrl,
  youtubeVideoId,
} from "../lib/board-utils";
import {
  boardZoomStep,
  clampZoom,
  screenToWorld,
  zoomAtPoint,
} from "../lib/board/math";
import { openExternalUrl } from "../lib/open-external";
import { cn } from "../lib/utils";

const languages = [
  "plaintext",
  "javascript",
  "typescript",
  "python",
  "rust",
  "html",
  "css",
  "json",
  "bash",
  "sql",
];

const defaultViewport: BoardViewport = { x: 96, y: 64, zoom: 1 };
const minCardWidth = 220;
const minCardHeight = 140;

type Point = {
  x: number;
  y: number;
};

type Gesture =
  | {
      type: "drag-card";
      id: string;
      element: HTMLElement;
      startX: number;
      startY: number;
      itemX: number;
      itemY: number;
      pinned: boolean;
      zoom: number;
      nextX: number;
      nextY: number;
      frame: number | null;
    }
  | {
      type: "resize-card";
      id: string;
      element: HTMLElement;
      startX: number;
      startY: number;
      width: number;
      height: number;
      nextWidth: number;
      nextHeight: number;
      ratio: number;
      zoom: number;
      frame: number | null;
    }
  | {
      type: "pan";
      startX: number;
      startY: number;
      viewportX: number;
      viewportY: number;
      nextX: number;
      nextY: number;
    };

export function BoardCanvas({
  board,
  disabled,
  onChange,
}: {
  board: BoardDocument | null;
  disabled: boolean;
  onChange: (board: BoardDocument) => void;
}) {
  const [menu, setMenu] = useState<{
    screenX: number;
    screenY: number;
    boardX: number;
    boardY: number;
  } | null>(null);
  const [viewport, setViewport] = useState<BoardViewport>(defaultViewport);
  const [tool, setTool] = useState<BoardTool>("select");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const boardRef = useRef(board);
  const viewportRef = useRef(viewport);
  const viewportElementRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    if (!board) return;
    const normalized = normalizeBoardDocument(board);
    setViewport(normalized.viewport);
    if (needsBoardMigration(board)) {
      boardRef.current = normalized;
      onChange(normalized);
    }
  }, [board?.createdAt, board?.title, onChange]);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", movePointer);
      window.removeEventListener("pointerup", stopPointer);
    };
  }, []);

  function updateBoard(updater: (current: BoardDocument) => BoardDocument) {
    if (!boardRef.current) return;
    const next = normalizeBoardDocument({
      ...updater(boardRef.current),
      updatedAt: new Date().toISOString(),
    });
    boardRef.current = next;
    onChange(next);
  }

  function updateItems(updater: (items: BoardItem[]) => BoardItem[]) {
    updateBoard((current) => ({
      ...current,
      items: updater(current.items || []),
    }));
  }

  function commitViewport(nextViewport: BoardViewport) {
    const normalizedViewport = {
      ...nextViewport,
      zoom: clampZoom(nextViewport.zoom),
    };
    viewportRef.current = normalizedViewport;
    setViewport(normalizedViewport);
    updateBoard((current) => ({
      ...current,
      viewport: normalizedViewport,
    }));
  }

  function toggleGrid() {
    updateBoard((current) => ({
      ...current,
      settings: {
        ...(current.settings || { showGrid: true }),
        showGrid: !(current.settings?.showGrid ?? true),
      },
    }));
  }

  function addItemAt(item: BoardItem, point?: Point) {
    setMenu(null);
    const nextItem = point ? { ...item, x: point.x, y: point.y } : item;
    updateItems((items) => [...items, nextItem]);
    setSelectedItemId(nextItem.id);
  }

  function addUrlAt(kind: "link" | "youtube", point: Point) {
    const value = window.prompt(
      kind === "youtube" ? "URL de YouTube" : "URL para agregar al board",
    );
    if (!value || !safeHttpUrl(value)) return;
    addItemAt(
      kind === "youtube" || youtubeVideoId(value)
        ? createYoutubeItem(value)
        : createLinkItem(value),
      point,
    );
  }

  function addForTool(nextTool: BoardTool, point: Point) {
    if (disabled) return;
    if (nextTool === "text" || nextTool === "sticky") {
      addItemAt(createTextItem(nextTool === "sticky" ? "Nueva nota" : "Nuevo texto"), point);
      setTool("select");
      return;
    }
    if (nextTool === "code") {
      addItemAt(createCodeItem(), point);
      setTool("select");
      return;
    }
    if (nextTool === "link" || nextTool === "youtube") {
      addUrlAt(nextTool, point);
      setTool("select");
    }
  }

  function patchItem(id: string, patch: Partial<BoardItem>) {
    updateItems((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function deleteItem(id: string) {
    updateItems((items) => items.filter((item) => item.id !== id));
    setSelectedItemId((current) => (current === id ? null : current));
  }

  function duplicateItem(item: BoardItem) {
    updateItems((items) => [
      ...items,
      {
        ...item,
        id: `item_${crypto.randomUUID()}`,
        locked: false,
        x: item.x + 28,
        y: item.y + 28,
        pinnedX: (item.pinnedX ?? item.x) + 28,
        pinnedY: (item.pinnedY ?? item.y) + 28,
      },
    ]);
  }

  function viewportCenterPoint() {
    const rect = viewportElementRef.current?.getBoundingClientRect();
    if (!rect) return { x: 120, y: 90 };
    return clientToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function clientToWorld(clientX: number, clientY: number) {
    const rect = viewportElementRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return screenToWorld(
      { x: clientX - rect.left, y: clientY - rect.top },
      viewportRef.current,
    );
  }

  function zoomBoard(nextZoom: number, anchor?: Point) {
    const rect = viewportElementRef.current?.getBoundingClientRect();
    const screenPoint =
      rect && anchor
        ? { x: anchor.x - rect.left, y: anchor.y - rect.top }
        : viewportCenterScreenPoint();
    commitViewport(zoomAtPoint(viewportRef.current, screenPoint, nextZoom));
  }

  function viewportCenterScreenPoint() {
    const rect = viewportElementRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: rect.width / 2, y: rect.height / 2 };
  }

  function resetView() {
    commitViewport(defaultViewport);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -boardZoomStep : boardZoomStep;
    zoomBoard(viewportRef.current.zoom + direction, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleBoardPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    if (
      (event.target as HTMLElement).closest(
        "[data-board-card], button, input, textarea, select",
      )
    ) {
      return;
    }

    const point = clientToWorld(event.clientX, event.clientY);
    if (tool !== "select" && tool !== "pan") {
      addForTool(tool, point);
      return;
    }

    if (tool !== "pan" && event.button !== 1) {
      setSelectedItemId(null);
      return;
    }

    gestureRef.current = {
      type: "pan",
      startX: event.clientX,
      startY: event.clientY,
      viewportX: viewportRef.current.x,
      viewportY: viewportRef.current.y,
      nextX: viewportRef.current.x,
      nextY: viewportRef.current.y,
    };
    window.addEventListener("pointermove", movePointer);
    window.addEventListener("pointerup", stopPointer);
  }

  function scheduleGestureFrame(
    gesture: Extract<Gesture, { type: "drag-card" | "resize-card" }>,
  ) {
    if (gesture.frame !== null) return;
    gesture.frame = requestAnimationFrame(() => {
      gesture.frame = null;
      if (gesture.type === "drag-card") {
        gesture.element.style.transform = `translate3d(${gesture.nextX}px, ${gesture.nextY}px, 0)`;
      } else {
        gesture.element.style.width = `${gesture.nextWidth}px`;
        gesture.element.style.height = `${gesture.nextHeight}px`;
      }
    });
  }

  function movePointer(event: globalThis.PointerEvent) {
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.type === "pan") {
      gesture.nextX = gesture.viewportX + event.clientX - gesture.startX;
      gesture.nextY = gesture.viewportY + event.clientY - gesture.startY;
      setViewport((current) => ({
        ...current,
        x: gesture.nextX,
        y: gesture.nextY,
      }));
      return;
    }

    if (gesture.type === "drag-card") {
      gesture.nextX = gesture.itemX + (event.clientX - gesture.startX) / gesture.zoom;
      gesture.nextY = gesture.itemY + (event.clientY - gesture.startY) / gesture.zoom;
      scheduleGestureFrame(gesture);
      return;
    }

    const width = Math.max(
      minCardWidth,
      gesture.width + (event.clientX - gesture.startX) / gesture.zoom,
    );
    const height = event.shiftKey
      ? Math.max(160, width / gesture.ratio)
      : Math.max(
          minCardHeight,
          gesture.height + (event.clientY - gesture.startY) / gesture.zoom,
        );
    gesture.nextWidth = width;
    gesture.nextHeight = height;
    scheduleGestureFrame(gesture);
  }

  function stopPointer() {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    window.removeEventListener("pointermove", movePointer);
    window.removeEventListener("pointerup", stopPointer);
    if (!gesture) return;

    if (gesture.type === "pan") {
      commitViewport({
        ...viewportRef.current,
        x: gesture.nextX,
        y: gesture.nextY,
      });
      return;
    }

    if (gesture.frame !== null) cancelAnimationFrame(gesture.frame);
    delete gesture.element.dataset.dragging;

    if (gesture.type === "drag-card") {
      patchItem(
        gesture.id,
        gesture.pinned
          ? { pinnedX: gesture.nextX, pinnedY: gesture.nextY }
          : { x: gesture.nextX, y: gesture.nextY },
      );
    } else {
      patchItem(gesture.id, {
        width: gesture.nextWidth,
        height: gesture.nextHeight,
      });
    }
  }

  function findCardElement(event: ReactPointerEvent) {
    return (event.currentTarget as HTMLElement).closest(
      "[data-board-card]",
    ) as HTMLElement | null;
  }

  function startDrag(item: BoardItem, pinned: boolean, event: ReactPointerEvent) {
    if (disabled || item.locked || tool !== "select") return;
    const element = findCardElement(event);
    if (!element) return;
    const itemX = pinned ? item.pinnedX ?? item.x : item.x;
    const itemY = pinned ? item.pinnedY ?? item.y : item.y;
    element.dataset.dragging = "true";
    setSelectedItemId(item.id);
    gestureRef.current = {
      type: "drag-card",
      id: item.id,
      element,
      startX: event.clientX,
      startY: event.clientY,
      itemX,
      itemY,
      nextX: itemX,
      nextY: itemY,
      pinned,
      zoom: pinned ? 1 : viewportRef.current.zoom,
      frame: null,
    };
    window.addEventListener("pointermove", movePointer);
    window.addEventListener("pointerup", stopPointer);
  }

  function startResize(item: BoardItem, pinned: boolean, event: ReactPointerEvent) {
    event.stopPropagation();
    if (disabled || item.locked) return;
    const element = findCardElement(event);
    if (!element) return;
    setSelectedItemId(item.id);
    gestureRef.current = {
      type: "resize-card",
      id: item.id,
      element,
      startX: event.clientX,
      startY: event.clientY,
      width: item.width,
      height: item.height,
      nextWidth: item.width,
      nextHeight: item.height,
      ratio: item.width / Math.max(item.height, 1),
      zoom: pinned ? 1 : viewportRef.current.zoom,
      frame: null,
    };
    window.addEventListener("pointermove", movePointer);
    window.addEventListener("pointerup", stopPointer);
  }

  if (!board) {
    return (
      <div className="grid h-full place-items-center bg-[var(--editor)] text-sm text-[var(--muted-foreground)]">
        Crea o selecciona una pizarra para empezar.
      </div>
    );
  }

  const normalizedBoard = normalizeBoardDocument(board);
  const showGrid = normalizedBoard.settings.showGrid;
  const normalItems = normalizedBoard.items.filter((item) => !item.pinned);
  const pinnedItems = normalizedBoard.items.filter((item) => item.pinned);

  return (
    <section className="relative h-full overflow-hidden bg-[var(--editor)]">
      <div
        ref={viewportElementRef}
        className={cn(
          "absolute inset-0 overflow-hidden",
          tool === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        )}
        onWheel={handleWheel}
        onPointerDown={handleBoardPointerDown}
        onContextMenu={(event) => {
          event.preventDefault();
          const boardPoint = clientToWorld(event.clientX, event.clientY);
          setMenu({
            screenX: event.clientX,
            screenY: event.clientY,
            boardX: boardPoint.x,
            boardY: boardPoint.y,
          });
        }}
        onClick={() => setMenu(null)}
      >
        <BoardSurface viewport={viewport} showGrid={showGrid}>
          {normalItems.map((item) => (
            <BoardCard
              key={item.id}
              item={item}
              disabled={disabled}
              selected={selectedItemId === item.id}
              onSelect={() => setSelectedItemId(item.id)}
              onStartDrag={(card, event) => startDrag(card, false, event)}
              onStartResize={(card, event) => startResize(card, false, event)}
              onPatch={(patch) => patchItem(item.id, patch)}
              onDelete={() => deleteItem(item.id)}
              onDuplicate={() => duplicateItem(item)}
            />
          ))}
        </BoardSurface>
        <div className="pointer-events-none absolute inset-0 z-30">
          {pinnedItems.map((item) => (
            <BoardCard
              key={item.id}
              item={item}
              disabled={disabled}
              pinned
              selected={selectedItemId === item.id}
              onSelect={() => setSelectedItemId(item.id)}
              onStartDrag={(card, event) => startDrag(card, true, event)}
              onStartResize={(card, event) => startResize(card, true, event)}
              onPatch={(patch) => patchItem(item.id, patch)}
              onDelete={() => deleteItem(item.id)}
              onDuplicate={() => duplicateItem(item)}
            />
          ))}
        </div>
      </div>
      <FloatingBoardToolbar
        disabled={disabled}
        activeTool={tool}
        showGrid={showGrid}
        zoom={viewport.zoom}
        onToolChange={setTool}
        onToggleGrid={toggleGrid}
        onZoomOut={() => zoomBoard(viewportRef.current.zoom - boardZoomStep)}
        onZoomIn={() => zoomBoard(viewportRef.current.zoom + boardZoomStep)}
        onResetView={resetView}
      />
      {menu && (
        <div
          className="absolute z-50 min-w-48 rounded-lg border border-[var(--border)] bg-[var(--popover)] p-1 text-xs text-[var(--popover-foreground)] shadow-xl"
          style={{ left: menu.screenX, top: menu.screenY }}
        >
          <MenuButton onClick={() => addItemAt(createTextItem(), menuPoint(menu))}>
            Agregar texto
          </MenuButton>
          <MenuButton onClick={() => addItemAt(createCodeItem(), menuPoint(menu))}>
            Agregar bloque de codigo
          </MenuButton>
          <MenuButton onClick={() => addUrlAt("link", menuPoint(menu))}>
            Agregar link o YouTube
          </MenuButton>
          <MenuButton onClick={toggleGrid}>
            {showGrid ? "Ocultar cuadricula" : "Mostrar cuadricula"}
          </MenuButton>
        </div>
      )}
    </section>
  );
}

function BoardSurface({
  viewport,
  showGrid,
  children,
}: {
  viewport: BoardViewport;
  showGrid: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "board-surface pointer-events-none absolute left-0 top-0 h-[4000px] w-[6000px]",
        showGrid && "board-surface-grid",
      )}
      style={
        {
          "--board-x": `${viewport.x}px`,
          "--board-y": `${viewport.y}px`,
          "--board-zoom": viewport.zoom,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

function MenuButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--hover)]"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

const BoardCard = memo(function BoardCard({
  item,
  disabled,
  pinned,
  selected,
  onSelect,
  onStartDrag,
  onStartResize,
  onPatch,
  onDelete,
  onDuplicate,
}: {
  item: BoardItem;
  disabled: boolean;
  pinned?: boolean;
  selected: boolean;
  onSelect: () => void;
  onStartDrag: (item: BoardItem, event: ReactPointerEvent) => void;
  onStartResize: (item: BoardItem, event: ReactPointerEvent) => void;
  onPatch: (patch: Partial<BoardItem>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const url = safeHttpUrl(item.canonicalUrl || item.url);
  const left = pinned ? item.pinnedX ?? item.x : item.x;
  const top = pinned ? item.pinnedY ?? item.y : item.y;
  const isReadOnly = disabled || Boolean(item.locked);

  return (
    <div
      data-board-card
      data-selected={selected ? "true" : undefined}
      className={cn(
        "group pointer-events-auto absolute left-0 top-0 z-10 overflow-hidden rounded-[14px] border bg-[var(--card)] text-[var(--card-foreground)] shadow-[0_10px_26px_rgb(0_0_0/0.10)]",
        "border-[color-mix(in_srgb,var(--border)_82%,transparent)] transition-[border-color,box-shadow]",
        "hover:border-[color-mix(in_srgb,var(--ring)_45%,var(--border))]",
        "focus-within:border-[var(--ring)] focus-within:shadow-[0_14px_34px_rgb(0_0_0/0.14)]",
        "will-change-transform",
        selected && "border-[var(--ring)] ring-2 ring-[color-mix(in_srgb,var(--ring)_18%,transparent)]",
        item.locked && "ring-1 ring-[color-mix(in_srgb,var(--ring)_32%,transparent)]",
      )}
      style={{
        contain: "layout paint",
        transform: `translate3d(${left}px, ${top}px, 0)`,
        width: item.width,
        height: item.height,
      }}
      onPointerDown={onSelect}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("input, textarea, select, button")) return;
        if (url) void openExternalUrl(url);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div
        className={cn(
          "absolute left-2 top-2 z-20 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)]/90 px-1.5 py-1 text-xs shadow-sm backdrop-blur",
          "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 group-data-[selected=true]:opacity-100",
          item.locked ? "cursor-default" : !disabled && "cursor-grab",
        )}
        onPointerDown={(event) => onStartDrag(item, event)}
      >
        <Grip size={13} className="shrink-0 text-[var(--muted-foreground)]" />
        <span className="max-w-36 truncate px-1 text-[11px] font-medium">
          {cardTitle(item)}
        </span>
        {url && (
          <IconButton label="Abrir enlace" onClick={() => void openExternalUrl(url)}>
            <ExternalLink size={13} />
          </IconButton>
        )}
        {(url || item.code) && (
          <IconButton
            label="Copiar"
            onClick={() => navigator.clipboard.writeText(item.code || url || "")}
          >
            <Copy size={13} />
          </IconButton>
        )}
        <IconButton
          label={item.locked ? "Desbloquear" : "Bloquear"}
          onClick={() => onPatch({ locked: !item.locked })}
        >
          {item.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </IconButton>
        <IconButton
          label={item.pinned ? "Desfijar de pantalla" : "Fijar en pantalla"}
          onClick={() =>
            onPatch({
              pinned: !item.pinned,
              pinnedX: item.pinned ? null : left,
              pinnedY: item.pinned ? null : top,
            })
          }
        >
          {item.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </IconButton>
        <IconButton label="Duplicar" onClick={onDuplicate}>
          <Copy size={13} />
        </IconButton>
        <IconButton label="Eliminar" onClick={onDelete}>
          <Trash2 size={13} />
        </IconButton>
      </div>
      <CardBody item={item} onPatch={onPatch} disabled={isReadOnly} />
      {!isReadOnly && (
        <button
          data-no-drag
          className="absolute bottom-2 right-2 z-20 size-4 cursor-nwse-resize rounded-full border border-[var(--border)] bg-[var(--background)] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 group-data-[selected=true]:opacity-100"
          aria-label="Redimensionar"
          title="Redimensionar. Manten Shift para conservar proporcion."
          onPointerDown={(event) => onStartResize(item, event)}
        />
      )}
    </div>
  );
});

function CardBody({
  item,
  disabled,
  onPatch,
}: {
  item: BoardItem;
  disabled: boolean;
  onPatch: (patch: Partial<BoardItem>) => void;
}) {
  if (item.kind === "youtube") {
    return <YouTubeCard item={item} disabled={disabled} onPatch={onPatch} />;
  }

  if (item.kind === "link") {
    return <LinkCard item={item} disabled={disabled} onPatch={onPatch} />;
  }

  if (item.kind === "code") {
    return <CodeCard item={item} disabled={disabled} onPatch={onPatch} />;
  }

  return <TextCard item={item} disabled={disabled} onPatch={onPatch} />;
}

function YouTubeCard({
  item,
  disabled,
  onPatch,
}: {
  item: BoardItem;
  disabled: boolean;
  onPatch: (patch: Partial<BoardItem>) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const embedUrl = youtubeEmbedUrl(item);
  const compact = item.height < 260;

  return (
    <div className="flex h-full flex-col bg-[var(--card)]">
      <div className="relative min-h-0 flex-1 bg-black">
        {playing && embedUrl ? (
          <iframe
            className="size-full group-data-[dragging=true]:pointer-events-none"
            src={embedUrl}
            title={item.title || "YouTube"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            className="relative block size-full bg-black text-left"
            disabled={!embedUrl}
            onClick={() => setPlaying(true)}
          >
            {item.thumbnailUrl && (
              <img className="size-full object-cover opacity-90" src={item.thumbnailUrl} alt="" />
            )}
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-10 text-xs font-medium text-white">
              {item.title || "Video de YouTube"}
            </span>
            <span className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow-lg">
              <Play size={20} fill="currentColor" />
            </span>
            {item.timestamp ? (
              <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-white">
                {formatTimestamp(item.timestamp)}
              </span>
            ) : null}
          </button>
        )}
      </div>
      {!compact && (
        <textarea
          className="h-20 shrink-0 resize-none border-t border-[var(--border)] bg-transparent px-3 py-2 text-xs leading-5 outline-none placeholder:text-[var(--muted-foreground)]"
          placeholder="Nota del video..."
          disabled={disabled}
          value={item.note || ""}
          onChange={(event) => onPatch({ note: event.target.value })}
        />
      )}
    </div>
  );
}

function LinkCard({
  item,
  disabled,
  onPatch,
}: {
  item: BoardItem;
  disabled: boolean;
  onPatch: (patch: Partial<BoardItem>) => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--card)]">
      {safeHttpUrl(item.imageUrl) ? (
        <img className="h-28 w-full shrink-0 object-cover" src={item.imageUrl || ""} alt="" />
      ) : (
        <div className="flex h-24 shrink-0 items-center gap-3 bg-[var(--muted)] px-4">
          {safeHttpUrl(item.faviconUrl) ? (
            <img className="size-9 rounded-lg" src={item.faviconUrl || ""} alt="" />
          ) : (
            <div className="grid size-9 place-items-center rounded-lg bg-[var(--background)] text-sm font-semibold">
              {(item.domain || item.siteName || "L").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{item.siteName || item.domain || "Enlace"}</p>
            <p className="truncate text-[11px] text-[var(--muted-foreground)]">{item.domain}</p>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3 pt-4">
        <p className="line-clamp-2 text-sm font-semibold leading-5">{item.title || "Enlace"}</p>
        {item.description && (
          <p className="line-clamp-3 text-xs leading-5 text-[var(--muted-foreground)]">
            {item.description}
          </p>
        )}
        {item.selectedText && (
          <blockquote className="rounded-md border-l-2 border-[var(--ring)] bg-[var(--muted)] px-2 py-1 text-xs leading-5">
            {item.selectedText}
          </blockquote>
        )}
        <textarea
          className="h-14 w-full resize-none rounded-md border border-transparent bg-[var(--muted)] p-2 text-xs outline-none focus:border-[var(--ring)]"
          placeholder="Comentario..."
          disabled={disabled}
          value={item.note || ""}
          onChange={(event) => onPatch({ note: event.target.value })}
        />
      </div>
    </div>
  );
}

function CodeCard({
  item,
  disabled,
  onPatch,
}: {
  item: BoardItem;
  disabled: boolean;
  onPatch: (patch: Partial<BoardItem>) => void;
}) {
  return (
    <div className="flex h-full flex-col bg-[var(--card)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 pt-10">
        <input
          className="min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none"
          disabled={disabled}
          value={item.title || ""}
          onChange={(event) => onPatch({ title: event.target.value })}
        />
        <select
          className="rounded-full border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[11px]"
          disabled={disabled}
          value={item.language || "plaintext"}
          onChange={(event) => onPatch({ language: event.target.value })}
        >
          {languages.map((language) => (
            <option key={language} value={language}>
              {language}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className="min-h-0 flex-1 resize-none bg-[color-mix(in_srgb,var(--sidebar)_72%,var(--card))] p-3 font-mono text-xs leading-5 outline-none"
        disabled={disabled}
        value={item.code || ""}
        spellCheck={false}
        onChange={(event) => onPatch({ code: event.target.value })}
      />
    </div>
  );
}

function TextCard({
  item,
  disabled,
  onPatch,
}: {
  item: BoardItem;
  disabled: boolean;
  onPatch: (patch: Partial<BoardItem>) => void;
}) {
  return (
    <textarea
      className="size-full resize-none bg-[color-mix(in_srgb,var(--muted)_62%,var(--card))] px-4 pb-4 pt-11 text-sm leading-6 outline-none placeholder:text-[var(--muted-foreground)]"
      disabled={disabled}
      value={item.text || ""}
      onChange={(event) => onPatch({ text: event.target.value })}
    />
  );
}

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      data-no-drag
      className="grid size-6 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {children}
    </button>
  );
}

function cardTitle(item: BoardItem) {
  if (item.kind === "youtube") return item.title || "YouTube";
  if (item.kind === "link") return item.siteName || item.domain || "Enlace";
  if (item.kind === "code") return item.title || "Codigo";
  return "Texto";
}

function menuPoint(menu: { boardX: number; boardY: number }) {
  return { x: menu.boardX, y: menu.boardY };
}

function needsBoardMigration(board: BoardDocument) {
  return (
    board.schemaVersion !== 3 ||
    !board.viewport ||
    !board.settings ||
    board.settings.showGrid === undefined
  );
}

function formatTimestamp(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${rest
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}
