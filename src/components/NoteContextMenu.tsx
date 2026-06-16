import { Copy, FolderInput, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./ui/context-menu";

export function NoteContextMenu({
  children,
  project,
  projects,
  onRename,
  onDelete,
  onDuplicate,
  onMove,
}: {
  children: ReactNode;
  project: string;
  projects: string[];
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (project: string) => void;
}) {
  const destinations = projects.filter((item) => item !== project);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onRename}>
          <Pencil size={14} /> Renombrar
        </ContextMenuItem>
        <ContextMenuItem onSelect={onDuplicate}>
          <Copy size={14} /> Duplicar
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={!destinations.length}>
            <FolderInput size={14} /> Mover a
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {destinations.map((destination) => (
              <ContextMenuItem key={destination} onSelect={() => onMove(destination)}>
                {destination}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator className="my-1 h-px bg-[var(--border)]" />
        <ContextMenuItem className="text-[var(--destructive)]" onSelect={onDelete}>
          <Trash2 size={14} /> Eliminar
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
