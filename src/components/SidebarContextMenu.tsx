import { ChevronsDownUp, FilePlus2, FolderPlus } from "lucide-react";
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
  onCreateProject,
  onCollapseAll,
}: {
  children: ReactNode;
  canCreateNote: boolean;
  onCreateNote: () => void;
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
