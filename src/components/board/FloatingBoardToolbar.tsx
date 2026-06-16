import {
  Code2,
  Grid2X2,
  Hand,
  Link,
  LocateFixed,
  Minus,
  MousePointer2,
  Plus,
  StickyNote,
  Type,
  Video,
} from "lucide-react";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";

export type BoardTool =
  | "select"
  | "pan"
  | "text"
  | "sticky"
  | "code"
  | "link"
  | "youtube";

type FloatingBoardToolbarProps = {
  disabled: boolean;
  activeTool: BoardTool;
  showGrid: boolean;
  zoom: number;
  onToolChange: (tool: BoardTool) => void;
  onToggleGrid: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
};

export function FloatingBoardToolbar({
  disabled,
  activeTool,
  showGrid,
  zoom,
  onToolChange,
  onToggleGrid,
  onZoomIn,
  onZoomOut,
  onResetView,
}: FloatingBoardToolbarProps) {
  return (
    <TooltipProvider delayDuration={250}>
      <div className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)]/95 p-1.5 text-[var(--card-foreground)] shadow-xl backdrop-blur">
        <ToolButton
          label="Seleccionar"
          active={activeTool === "select"}
          disabled={disabled}
          onClick={() => onToolChange("select")}
        >
          <MousePointer2 size={16} />
        </ToolButton>
        <ToolButton
          label="Mover pizarra"
          active={activeTool === "pan"}
          disabled={disabled}
          onClick={() => onToolChange("pan")}
        >
          <Hand size={16} />
        </ToolButton>
        <Divider />
        <ToolButton
          label="Texto"
          active={activeTool === "text"}
          disabled={disabled}
          onClick={() => onToolChange("text")}
        >
          <Type size={16} />
        </ToolButton>
        <ToolButton
          label="Sticky"
          active={activeTool === "sticky"}
          disabled={disabled}
          onClick={() => onToolChange("sticky")}
        >
          <StickyNote size={16} />
        </ToolButton>
        <ToolButton
          label="Codigo"
          active={activeTool === "code"}
          disabled={disabled}
          onClick={() => onToolChange("code")}
        >
          <Code2 size={16} />
        </ToolButton>
        <ToolButton
          label="Link"
          active={activeTool === "link"}
          disabled={disabled}
          onClick={() => onToolChange("link")}
        >
          <Link size={16} />
        </ToolButton>
        <ToolButton
          label="YouTube"
          active={activeTool === "youtube"}
          disabled={disabled}
          onClick={() => onToolChange("youtube")}
        >
          <Video size={16} />
        </ToolButton>
        <Divider />
        <ToolButton
          label={showGrid ? "Ocultar cuadricula" : "Mostrar cuadricula"}
          active={showGrid}
          disabled={disabled}
          onClick={onToggleGrid}
        >
          <Grid2X2 size={16} />
        </ToolButton>
        <ToolButton label="Alejar" disabled={disabled} onClick={onZoomOut}>
          <Minus size={16} />
        </ToolButton>
        <span className="min-w-12 px-1 text-center text-[11px] tabular-nums text-[var(--muted-foreground)]">
          {Math.round(zoom * 100)}%
        </span>
        <ToolButton label="Acercar" disabled={disabled} onClick={onZoomIn}>
          <Plus size={16} />
        </ToolButton>
        <ToolButton label="Resetear vista" disabled={disabled} onClick={onResetView}>
          <LocateFixed size={16} />
        </ToolButton>
      </div>
    </TooltipProvider>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          className={cn(
            "size-8 rounded-lg text-[var(--muted-foreground)]",
            active && "bg-[var(--selected)] text-[var(--foreground)] shadow-sm",
          )}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Divider() {
  return <div className="mx-1 h-6 w-px bg-[var(--border)]" />;
}
