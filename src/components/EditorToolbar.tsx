import {
  Bold,
  CheckSquare,
  Code2,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  Maximize2,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Undo2,
} from "lucide-react";
import type { MarkdownAction } from "../lib/markdown-actions";
import { ToolbarButton } from "./ToolbarButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

const iconSize = 14;

export function EditorToolbar({
  disabled,
  focusMode,
  onAction,
  onHistory,
  onToggleFocus,
}: {
  disabled: boolean;
  focusMode: boolean;
  onAction: (action: MarkdownAction) => void;
  onHistory: (action: "undo" | "redo") => void;
  onToggleFocus: () => void;
}) {
  const action = (label: string, type: MarkdownAction, icon: React.ReactNode) => (
    <ToolbarButton label={label} disabled={disabled} onClick={() => onAction(type)}>
      {icon}
    </ToolbarButton>
  );

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--toolbar)] px-2 text-[var(--toolbar-foreground)]">
      <ToolbarButton label="Deshacer" disabled={disabled} onClick={() => onHistory("undo")}>
        <Undo2 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton label="Rehacer" disabled={disabled} onClick={() => onHistory("redo")}>
        <Redo2 size={iconSize} />
      </ToolbarButton>
      {action("Limpiar formato", "clear", <Eraser size={iconSize} />)}
      <Separator orientation="vertical" className="mx-1 h-5 bg-[var(--toolbar-border)]" />
      {action("Encabezado 1", "h1", <Heading1 size={iconSize} />)}
      {action("Encabezado 2", "h2", <Heading2 size={iconSize} />)}
      {action("Encabezado 3", "h3", <Heading3 size={iconSize} />)}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-[var(--toolbar-muted)] hover:bg-[var(--toolbar-hover)] hover:text-[var(--toolbar-foreground)]"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
          >
            H4–H6
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {[4, 5, 6].map((level) => (
            <DropdownMenuItem
              key={level}
              onSelect={() => onAction(`h${level}` as MarkdownAction)}
            >
              Encabezado {level}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Separator orientation="vertical" className="mx-1 h-5 bg-[var(--toolbar-border)]" />
      {action("Negrita", "bold", <Bold size={iconSize} />)}
      {action("Cursiva", "italic", <Italic size={iconSize} />)}
      {action("Tachado", "strikethrough", <Strikethrough size={iconSize} />)}
      {action("Código inline", "inline-code", <Code2 size={iconSize} />)}
      <Separator orientation="vertical" className="mx-1 h-5 bg-[var(--toolbar-border)]" />
      {action("Cita", "quote", <Quote size={iconSize} />)}
      {action("Checkbox", "checkbox", <CheckSquare size={iconSize} />)}
      {action("Enlace", "link", <Link size={iconSize} />)}
      {action("Imagen o adjunto", "image", <Image size={iconSize} />)}
      {action("Tabla", "table", <Table2 size={iconSize} />)}
      {action("Lista", "bullet-list", <List size={iconSize} />)}
      {action("Lista numerada", "ordered-list", <ListOrdered size={iconSize} />)}
      {action("Bloque de código", "code-block", <Code2 size={iconSize} />)}
      {action("Separador", "separator", <Minus size={iconSize} />)}
      <Separator orientation="vertical" className="mx-1 h-5 bg-[var(--toolbar-border)]" />
      <ToolbarButton
        label={focusMode ? "Salir del modo enfoque" : "Modo enfoque"}
        onClick={onToggleFocus}
      >
        <Maximize2 size={iconSize} />
      </ToolbarButton>
    </div>
  );
}
