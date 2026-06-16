import { Bold, CheckSquare, Code2, Italic, Link, List, Quote, Strikethrough } from "lucide-react";
import type { ReactNode } from "react";
import type { MarkdownAction } from "../lib/markdown-actions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ui/context-menu";

export function EditorContextMenu({
  children,
  disabled,
  onAction,
}: {
  children: ReactNode;
  disabled: boolean;
  onAction: (action: MarkdownAction) => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled={disabled} onSelect={() => onAction("bold")}>
          <Bold size={14} /> Negrita
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onAction("italic")}>
          <Italic size={14} /> Cursiva
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onAction("strikethrough")}>
          <Strikethrough size={14} /> Tachado
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onAction("inline-code")}>
          <Code2 size={14} /> Código inline
        </ContextMenuItem>
        <ContextMenuSeparator className="my-1 h-px bg-[var(--border)]" />
        <ContextMenuItem disabled={disabled} onSelect={() => onAction("quote")}>
          <Quote size={14} /> Cita
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onAction("checkbox")}>
          <CheckSquare size={14} /> Checkbox
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onAction("bullet-list")}>
          <List size={14} /> Lista
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onAction("link")}>
          <Link size={14} /> Enlace
        </ContextMenuItem>
        <ContextMenuItem disabled={disabled} onSelect={() => onAction("code-block")}>
          <Code2 size={14} /> Bloque de código
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
