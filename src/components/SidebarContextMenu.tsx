import { ChevronsDownUp, FilePlus2, FolderPlus, PencilRuler } from "lucide-react";
import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ui/context-menu";

export function SidebarContextMenu({
  children,
  canCreateNote,
  onCreateNote,
  onCreateBoard,
  onCreateProject,
  onCollapseAll,
}: {
  children: ReactNode;
  canCreateNote: boolean;
  onCreateNote: () => void;
  onCreateBoard: () => void;
  onCreateProject: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled={!canCreateNote} onSelect={onCreateNote}>
          <FilePlus2 size={14} /> Nueva nota
        </ContextMenuItem>
        <ContextMenuItem disabled={!canCreateNote} onSelect={onCreateBoard}>
          <PencilRuler size={14} /> Nueva pizarra
        </ContextMenuItem>
        <ContextMenuItem onSelect={onCreateProject}>
          <FolderPlus size={14} /> Nueva carpeta
        </ContextMenuItem>
        <ContextMenuSeparator className="my-1 h-px bg-[var(--border)]" />
        <ContextMenuItem onSelect={onCollapseAll}>
          <ChevronsDownUp size={14} /> Colapsar todo
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
