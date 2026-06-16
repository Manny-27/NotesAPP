import {
  Code2,
  Copy,
  ExternalLink,
  Grip,
  Lock,
  Pin,
  PinOff,
  Plus,
  Trash2,
  Unlock,
  Video,
} from "lucide-react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Tldraw, createTLStore } from "tldraw";
import type { BoardDocument, BoardItem } from "../api";
import {
  createCodeItem,
  createLinkItem,
  createTextItem,
  createYoutubeItem,
  safeHttpUrl,
  youtubeEmbedUrl,
  youtubeVideoId,
} from "../lib/board-utils";
import { openExternalUrl } from "../lib/open-external";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

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

type Gesture =
  | {
      type: "drag";
      id: string;
      element: HTMLElement;
      startX: number;
      startY: number;
      itemX: number;
      itemY: number;
      pinned: boolean;
      nextX: number;
      nextY: number;
      frame: number | null;
    }
  | {
      type: "resize";
      id: string;
      element: HTMLElement;
      startX: number;
      startY: number;
      width: number;
      height: number;
      nextWidth: number;
      nextHeight: number;
      ratio: number;
      frame: number | null;
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
  const [url, setUrl] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const boardRef = useRef(board);
  const gestureRef = useRef<Gesture | null>(null);
  const store = useMemo(
    () =>
      createTLStore({
        snapshot: (board?.snapshot || undefined) as never,
        defaultName: board?.title || "Pizarra",
      }),
    [board?.title],
  );

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    if (!board) return;
    const unsubscribe = store.listen(() => {
      const current = boardRef.current;
      if (!current) return;
      onChange({
        ...current,
        snapshot: store.getStoreSnapshot(),
        updatedAt: new Date().toISOString(),
      });
    });
    return unsubscribe;
  }, [board, onChange, store]);

  function updateItems(updater: (items: BoardItem[]) => BoardItem[]) {
    if (!boardRef.current) return;
    onChange({
      ...boardRef.current,
      items: updater(boardRef.current.items || []),
      snapshot: store.getStoreSnapshot(),
      updatedAt: new Date().toISOString(),
    });
  }

  function addUrl() {
    const value = url.trim();
    if (!safeHttpUrl(value)) return;
    updateItems((items) => [
      ...items,
      youtubeVideoId(value) ? createYoutubeItem(value) : createLinkItem(value),
    ]);
    setUrl("");
  }

  function addItem(item: BoardItem) {
    setMenu(null);
    updateItems((items) => [...items, item]);
  }

  function patchItem(id: string, patch: Partial<BoardItem>) {
    updateItems((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function deleteItem(id: string) {
    updateItems((items) => items.filter((item) => item.id !== id));
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

  function scheduleGestureFrame(gesture: Gesture) {
    if (gesture.frame !== null) return;
    gesture.frame = requestAnimationFrame(() => {
      gesture.frame = null;
      if (gesture.type === "drag") {
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
    if (gesture.type === "drag") {
      gesture.nextX = gesture.itemX + event.clientX - gesture.startX;
      gesture.nextY = gesture.itemY + event.clientY - gesture.startY;
      scheduleGestureFrame(gesture);
      return;
    }

    const width = Math.max(220, gesture.width + event.clientX - gesture.startX);
    const height = event.shiftKey
      ? Math.max(160, width / gesture.ratio)
      : Math.max(140, gesture.height + event.clientY - gesture.startY);
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
    if (gesture.frame !== null) cancelAnimationFrame(gesture.frame);
    delete gesture.element.dataset.dragging;

    if (gesture.type === "drag") {
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

  function startDrag(item: BoardItem, event: ReactPointerEvent) {
    if (disabled || item.locked) return;
    const element = findCardElement(event);
    if (!element) return;
    const itemX = item.pinned ? item.pinnedX ?? item.x : item.x;
    const itemY = item.pinned ? item.pinnedY ?? item.y : item.y;
    element.dataset.dragging = "true";
    gestureRef.current = {
      type: "drag",
      id: item.id,
      element,
      startX: event.clientX,
      startY: event.clientY,
      itemX,
      itemY,
      nextX: itemX,
      nextY: itemY,
      pinned: Boolean(item.pinned),
      frame: null,
    };
    window.addEventListener("pointermove", movePointer);
    window.addEventListener("pointerup", stopPointer);
  }

  function startResize(item: BoardItem, event: ReactPointerEvent) {
    event.stopPropagation();
    if (disabled || item.locked) return;
    const element = findCardElement(event);
    if (!element) return;
    gestureRef.current = {
      type: "resize",
      id: item.id,
      element,
      startX: event.clientX,
      startY: event.clientY,
      width: item.width,
      height: item.height,
      nextWidth: item.width,
      nextHeight: item.height,
      ratio: item.width / Math.max(item.height, 1),
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

  const normalItems = board.items.filter((item) => !item.pinned);
  const pinnedItems = board.items.filter((item) => item.pinned);

  return (
    <div
      className="relative h-full overflow-hidden bg-[var(--editor)]"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
      onClick={() => setMenu(null)}
    >
      <div className="absolute inset-0">
        <Tldraw store={store} />
      </div>
      <div className="pointer-events-none absolute inset-0">
        {normalItems.map((item) => (
          <BoardCard
            key={item.id}
            item={item}
            disabled={disabled}
            onStartDrag={startDrag}
            onStartResize={startResize}
            onPatch={(patch) => patchItem(item.id, patch)}
            onDelete={() => deleteItem(item.id)}
            onDuplicate={() => duplicateItem(item)}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 z-30">
        {pinnedItems.map((item) => (
          <BoardCard
            key={item.id}
            item={item}
            disabled={disabled}
            pinned
            onStartDrag={startDrag}
            onStartResize={startResize}
            onPatch={(patch) => patchItem(item.id, patch)}
            onDelete={() => deleteItem(item.id)}
            onDuplicate={() => duplicateItem(item)}
          />
        ))}
      </div>
      <div className="absolute right-3 top-3 z-40 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)]/95 p-2 shadow-xl backdrop-blur">
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => addItem(createTextItem())}>
          <Plus size={14} /> Texto
        </Button>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => addItem(createCodeItem())}>
          <Code2 size={14} /> Código
        </Button>
        <input
          className="h-8 w-64 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-xs outline-none focus:ring-2 focus:ring-[var(--ring)]"
          placeholder="Pega URL de YouTube o enlace"
          value={url}
          disabled={disabled}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addUrl();
          }}
        />
        <Button size="sm" disabled={disabled || !safeHttpUrl(url)} onClick={addUrl}>
          <Video size={14} /> Agregar
        </Button>
      </div>
      {menu && (
        <div
          className="absolute z-50 min-w-48 rounded-lg border border-[var(--border)] bg-[var(--popover)] p-1 text-xs text-[var(--popover-foreground)] shadow-xl"
          style={{ left: menu.x, top: menu.y }}
        >
          <MenuButton onClick={() => addItem(createTextItem())}>Agregar texto</MenuButton>
          <MenuButton onClick={() => addItem(createCodeItem())}>Agregar bloque de código</MenuButton>
          <MenuButton
            onClick={() => {
              const value = window.prompt("URL para agregar al board");
              if (!value || !safeHttpUrl(value)) return;
              addItem(youtubeVideoId(value) ? createYoutubeItem(value) : createLinkItem(value));
            }}
          >
            Agregar link o YouTube
          </MenuButton>
        </div>
      )}
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
  onStartDrag,
  onStartResize,
  onPatch,
  onDelete,
  onDuplicate,
}: {
  item: BoardItem;
  disabled: boolean;
  pinned?: boolean;
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
      className={cn(
        "group pointer-events-auto absolute left-0 top-0 z-10 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-xl",
        "will-change-transform",
        item.locked && "ring-1 ring-[var(--ring)]",
      )}
      style={{
        contain: "layout paint",
        transform: `translate3d(${left}px, ${top}px, 0)`,
        width: item.width,
        height: item.height,
      }}
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
          "flex h-8 items-center gap-2 border-b border-[var(--border)] bg-[var(--muted)] px-2 text-xs font-medium",
          item.locked ? "cursor-default" : !disabled && "cursor-grab",
        )}
        onPointerDown={(event) => onStartDrag(item, event)}
      >
        <Grip size={13} className="text-[var(--muted-foreground)]" />
        <span className="min-w-0 flex-1 truncate">{cardTitle(item)}</span>
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
          <Plus size={13} />
        </IconButton>
        <IconButton label="Eliminar" onClick={onDelete}>
          <Trash2 size={13} />
        </IconButton>
      </div>
      <CardBody item={item} onPatch={onPatch} disabled={isReadOnly} />
      {!isReadOnly && (
        <button
          className="absolute bottom-1 right-1 size-4 cursor-nwse-resize rounded border border-[var(--border)] bg-[var(--background)] opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
          aria-label="Redimensionar"
          title="Redimensionar. Mantén Shift para conservar proporción."
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
    const embedUrl = youtubeEmbedUrl(item);
    return (
      <div className="flex h-[calc(100%-2rem)] flex-col">
        {embedUrl ? (
          <iframe
            className="aspect-video w-full shrink-0 bg-black group-data-[dragging=true]:pointer-events-none"
            src={embedUrl}
            title={item.title || "YouTube"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : item.thumbnailUrl ? (
          <img className="aspect-video w-full shrink-0 object-cover" src={item.thumbnailUrl} alt="" />
        ) : null}
        <textarea
          className="min-h-0 flex-1 resize-none bg-transparent p-3 text-xs leading-5 outline-none"
          placeholder="Nota al lado del video..."
          disabled={disabled}
          value={item.note || ""}
          onChange={(event) => onPatch({ note: event.target.value })}
        />
      </div>
    );
  }

  if (item.kind === "link") {
    return (
      <div className="flex h-[calc(100%-2rem)] flex-col overflow-hidden">
        {safeHttpUrl(item.imageUrl) ? (
          <img className="h-28 w-full shrink-0 object-cover" src={item.imageUrl || ""} alt="" />
        ) : (
          <div className="flex h-16 shrink-0 items-center gap-2 bg-[var(--muted)] px-3">
            {safeHttpUrl(item.faviconUrl) && (
              <img className="size-5 rounded" src={item.faviconUrl || ""} alt="" />
            )}
            <span className="truncate text-xs text-[var(--muted-foreground)]">
              {item.siteName || item.domain || "Enlace"}
            </span>
          </div>
        )}
        <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
          <p className="text-sm font-semibold leading-5">{item.title || "Enlace"}</p>
          {item.description && (
            <p className="line-clamp-3 text-xs leading-5 text-[var(--muted-foreground)]">
              {item.description}
            </p>
          )}
          {item.selectedText && (
            <blockquote className="border-l-2 border-[var(--ring)] pl-2 text-xs leading-5">
              {item.selectedText}
            </blockquote>
          )}
          <textarea
            className="h-16 w-full resize-none rounded-md border border-[var(--border)] bg-transparent p-2 text-xs outline-none"
            placeholder="Comentario..."
            disabled={disabled}
            value={item.note || ""}
            onChange={(event) => onPatch({ note: event.target.value })}
          />
        </div>
      </div>
    );
  }

  if (item.kind === "code") {
    return (
      <div className="flex h-[calc(100%-2rem)] flex-col">
        <div className="flex gap-2 border-b border-[var(--border)] p-2">
          <input
            className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none"
            disabled={disabled}
            value={item.title || ""}
            onChange={(event) => onPatch({ title: event.target.value })}
          />
          <select
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 text-xs"
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
          className="h-1/2 min-h-0 resize-none bg-transparent p-3 font-mono text-xs leading-5 outline-none"
          disabled={disabled}
          value={item.code || ""}
          spellCheck={false}
          onChange={(event) => onPatch({ code: event.target.value })}
        />
        <pre className="min-h-0 flex-1 overflow-auto border-t border-[var(--border)] bg-[var(--sidebar)] p-3 text-xs leading-5">
          <code>{item.code || ""}</code>
        </pre>
      </div>
    );
  }

  return (
    <textarea
      className="h-[calc(100%-2rem)] w-full resize-none bg-transparent p-3 text-sm leading-6 outline-none"
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
      className="grid size-6 place-items-center rounded text-[var(--muted-foreground)] opacity-80 hover:bg-[var(--hover)] hover:text-[var(--foreground)] hover:opacity-100"
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
  if (item.kind === "code") return item.title || "Código";
  return "Texto";
}
