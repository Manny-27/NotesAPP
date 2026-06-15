import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  GripVertical,
  MoreHorizontal,
  Moon,
  Pencil,
  Settings,
  Sun,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Toaster, toast } from "sonner";
import { api, type NotesChangedEvent } from "./api";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { ScrollArea } from "./components/ui/scroll-area";
import { Separator } from "./components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";
import { cn } from "./lib/utils";

type Theme = "light" | "dark";
type ViewMode = "edit" | "read";
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
type Modal =
  | { type: "project" }
  | { type: "note"; project: string }
  | { type: "rename"; project: string; note: string }
  | { type: "delete"; project: string; note: string }
  | { type: "settings" }
  | null;

interface NoteTreeItemProps {
  project: string;
  note: string;
  selected: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function NoteTreeItem({
  project,
  note,
  selected,
  onSelect,
  onRename,
  onDelete,
}: NoteTreeItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `note:${project}:${note}`,
      data: { project, note },
    });

  return (
    <div
      ref={setNodeRef}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        "group flex h-7 items-center gap-1 rounded-md pl-5 pr-1 text-[12px] text-[var(--muted-foreground)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]",
        selected && "bg-[var(--selected)] text-[var(--foreground)]",
        isDragging && "z-50 opacity-60 shadow-lg",
      )}
      onClick={onSelect}
    >
      <button
        className="cursor-grab rounded p-0.5 opacity-0 group-hover:opacity-60"
        aria-label={`Mover ${note}`}
        {...listeners}
        {...attributes}
      >
        <GripVertical size={12} />
      </button>
      <FileText size={14} className="shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 truncate">{note}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 opacity-0 group-hover:opacity-100"
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={onRename}>
            <Pencil size={13} /> Renombrar
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1 h-px bg-[var(--border)]" />
          <DropdownMenuItem
            className="text-[var(--destructive)]"
            onSelect={onDelete}
          >
            <Trash2 size={13} /> Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ProjectTreeItem({
  project,
  notes,
  expanded,
  selectedProject,
  selectedNote,
  onToggle,
  onSelectNote,
  onNewNote,
  onRename,
  onDelete,
}: {
  project: string;
  notes: string[];
  expanded: boolean;
  selectedProject: string;
  selectedNote: string;
  onToggle: () => void;
  onSelectNote: (note: string) => void;
  onNewNote: () => void;
  onRename: (note: string) => void;
  onDelete: (note: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `project:${project}`,
    data: { project },
  });

  return (
    <div ref={setNodeRef} className="mb-0.5">
      <div
        className={cn(
          "group flex h-7 items-center rounded-md px-1 text-[12px] font-medium hover:bg-[var(--hover)]",
          isOver && "bg-[var(--drop)] ring-1 ring-[var(--ring)]",
        )}
      >
        <button
          className="flex min-w-0 flex-1 items-center gap-1.5"
          onClick={onToggle}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={14} className="shrink-0 text-[var(--folder)]" />
          <span className="truncate">{project}</span>
          <span className="ml-auto pr-1 text-[10px] text-[var(--muted-foreground)]">
            {notes.length}
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 opacity-0 group-hover:opacity-100"
          aria-label={`Nueva nota en ${project}`}
          onClick={onNewNote}
        >
          <FilePlus2 size={13} />
        </Button>
      </div>
      {expanded && (
        <div>
          {notes.map((note) => (
            <NoteTreeItem
              key={note}
              project={project}
              note={note}
              selected={selectedProject === project && selectedNote === note}
              onSelect={() => onSelectNote(note)}
              onRename={() => onRename(note)}
              onDelete={() => onDelete(note)}
            />
          ))}
          {!notes.length && (
            <p className="py-1 pl-10 text-[11px] text-[var(--muted-foreground)]">
              Sin notas
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function initialTheme(): Theme {
  const saved = localStorage.getItem("loquera-theme");
  if (saved === "light" || saved === "dark") return saved;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [root, setRoot] = useState("Conectando...");
  const [projects, setProjects] = useState<string[]>([]);
  const [notesByProject, setNotesByProject] = useState<Record<string, string[]>>(
    {},
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem("loquera-expanded") || "[]")),
  );
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedNote, setSelectedNote] = useState("");
  const [content, setContent] = useState("");
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () =>
      (localStorage.getItem("loquera-view-mode") as ViewMode) || "edit",
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [live, setLive] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [modalValue, setModalValue] = useState("");

  const selectedProjectRef = useRef(selectedProject);
  const selectedNoteRef = useRef(selectedNote);
  const contentRef = useRef(content);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const loadingRef = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  useEffect(() => {
    selectedProjectRef.current = selectedProject;
  }, [selectedProject]);
  useEffect(() => {
    selectedNoteRef.current = selectedNote;
  }, [selectedNote]);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("loquera-theme", theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("loquera-view-mode", viewMode);
  }, [viewMode]);
  useEffect(() => {
    localStorage.setItem("loquera-expanded", JSON.stringify([...expanded]));
  }, [expanded]);

  const refreshTree = useCallback(async () => {
    const nextProjects = await api.listProjects();
    const entries = await Promise.all(
      nextProjects.map(async (project) => [
        project,
        await api.listNotes(project),
      ]),
    );
    setProjects(nextProjects);
    setNotesByProject(Object.fromEntries(entries));
    if (!selectedProjectRef.current && nextProjects[0]) {
      setSelectedProject(nextProjects[0]);
      setExpanded((current) => new Set(current).add(nextProjects[0]));
    }
  }, []);

  const loadNote = useCallback(async (project: string, note: string) => {
    loadingRef.current = true;
    try {
      const markdown = await api.readNote(project, note);
      contentRef.current = markdown;
      setContent(markdown);
      dirtyRef.current = false;
      setSaveState("saved");
    } finally {
      loadingRef.current = false;
    }
  }, []);

  const saveCurrent = useCallback(async () => {
    const project = selectedProjectRef.current;
    const note = selectedNoteRef.current;
    const snapshot = contentRef.current;
    if (!project || !note || !dirtyRef.current) return;
    if (savingRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    savingRef.current = true;
    setSaveState("saving");
    try {
      const result = await api.saveNote(project, note, snapshot);
      if (
        selectedProjectRef.current === project &&
        selectedNoteRef.current === note
      ) {
        if (result.renamed) {
          selectedNoteRef.current = result.note;
          setSelectedNote(result.note);
          toast.success(`Renombrada como ${result.note}`);
        }
        if (contentRef.current === snapshot) {
          dirtyRef.current = false;
          setSaveState("saved");
        } else {
          pendingSaveRef.current = true;
          setSaveState("dirty");
        }
        if (result.warning) toast.warning(result.warning);
      }
      await refreshTree();
    } catch (error) {
      setSaveState("error");
      toast.error(`No se pudo guardar: ${errorMessage(error)}`);
    } finally {
      savingRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        window.setTimeout(() => void saveCurrent(), 0);
      }
    }
  }, [refreshTree]);

  useEffect(() => {
    if (!dirtyRef.current || loadingRef.current || !selectedNote) return;
    const timeout = window.setTimeout(() => void saveCurrent(), 850);
    return () => window.clearTimeout(timeout);
  }, [content, selectedNote, saveCurrent]);

  useEffect(() => {
    Promise.all([api.getNotesRoot(), refreshTree()])
      .then(([notesRoot]) => setRoot(notesRoot))
      .catch((error) => toast.error(errorMessage(error)));
  }, [refreshTree]);

  useEffect(() => {
    return api.subscribe(
      (change: NotesChangedEvent) => {
        const currentProject = selectedProjectRef.current;
        const currentNote = selectedNoteRef.current;
        const ownSave =
          savingRef.current &&
          ["note:saved", "note:renamed"].includes(change.type);
        if (ownSave) {
          void refreshTree();
          return;
        }

        if (
          change.type === "note:renamed" &&
          change.project === currentProject &&
          change.oldNote === currentNote
        ) {
          selectedNoteRef.current = change.newNote || currentNote;
          setSelectedNote(change.newNote || currentNote);
        }
        if (
          change.type === "note:moved" &&
          change.fromProject === currentProject &&
          change.note === currentNote
        ) {
          const destination = change.toProject || currentProject;
          selectedProjectRef.current = destination;
          setSelectedProject(destination);
          setExpanded((value) => new Set(value).add(destination));
        }
        if (
          change.type === "note:deleted" &&
          change.project === currentProject &&
          change.note === currentNote
        ) {
          selectedNoteRef.current = "";
          setSelectedNote("");
          setContent("");
          dirtyRef.current = false;
        }

        void refreshTree();
        const affectsCurrent =
          change.project === selectedProjectRef.current &&
          (change.note === selectedNoteRef.current ||
            change.newNote === selectedNoteRef.current);
        if (affectsCurrent) {
          if (dirtyRef.current) {
            toast.warning("Hay cambios externos; se conservará tu edición local.");
          } else if (selectedNoteRef.current) {
            void loadNote(
              selectedProjectRef.current,
              selectedNoteRef.current,
            );
          }
        }
        if (change.type === "capture:created") toast.success("Captura recibida");
      },
      setLive,
    );
  }, [loadNote, refreshTree]);

  async function selectNote(project: string, note: string) {
    if (
      selectedProjectRef.current === project &&
      selectedNoteRef.current === note
    )
      return;
    await saveCurrent();
    selectedProjectRef.current = project;
    selectedNoteRef.current = note;
    setSelectedProject(project);
    setSelectedNote(note);
    setExpanded((value) => new Set(value).add(project));
    await loadNote(project, note);
  }

  function toggleProject(project: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  }

  function openModal(next: Modal, value = "") {
    setModalValue(value);
    setModal(next);
  }

  async function submitModal() {
    if (!modal) return;
    try {
      if (modal.type === "project") {
        const project = await api.createProject(modalValue);
        setExpanded((value) => new Set(value).add(project));
        toast.success("Carpeta creada");
      } else if (modal.type === "note") {
        const note = await api.createNote(
          modal.project,
          modalValue,
          `# ${modalValue.trim()}\n\n`,
        );
        await selectNote(modal.project, note);
        toast.success("Nota creada");
      } else if (modal.type === "rename") {
        const result = await api.renameNote(
          modal.project,
          modal.note,
          modalValue,
        );
        if (
          selectedProjectRef.current === modal.project &&
          selectedNoteRef.current === modal.note
        ) {
          selectedNoteRef.current = result.note;
          setSelectedNote(result.note);
        }
        toast.success("Nota renombrada");
      } else if (modal.type === "delete") {
        await api.deleteNote(modal.project, modal.note);
        if (
          selectedProjectRef.current === modal.project &&
          selectedNoteRef.current === modal.note
        ) {
          selectedNoteRef.current = "";
          setSelectedNote("");
          setContent("");
        }
        toast.success("Nota eliminada");
      }
      setModal(null);
      await refreshTree();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const fromProject = event.active.data.current?.project as string | undefined;
    const note = event.active.data.current?.note as string | undefined;
    const targetProject = event.over?.data.current?.project as string | undefined;
    if (!fromProject || !note || !targetProject || fromProject === targetProject)
      return;
    try {
      await saveCurrent();
      const result = await api.moveNote(fromProject, note, targetProject);
      if (
        selectedProjectRef.current === fromProject &&
        selectedNoteRef.current === note
      ) {
        selectedProjectRef.current = result.toProject;
        setSelectedProject(result.toProject);
      }
      setExpanded((value) => new Set(value).add(result.toProject));
      await refreshTree();
      toast.success("Nota movida");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const saveLabel: Record<SaveState, string> = {
    idle: "Sin cambios",
    dirty: "Editando...",
    saving: "Guardando...",
    saved: "Guardado",
    error: "Error al guardar",
  };

  return (
    <TooltipProvider delayDuration={350}>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <main className="flex h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
          <aside className="flex h-full w-[276px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)]">
            <header className="flex h-12 shrink-0 items-center gap-2 px-3">
              <div className="grid size-7 place-items-center rounded-lg bg-[var(--primary)] font-serif text-sm font-semibold text-[var(--primary-foreground)]">
                L
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                Loquera
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      openModal(
                        { type: "note", project: selectedProject || projects[0] },
                        "Nueva nota",
                      )
                    }
                    disabled={!selectedProject && !projects.length}
                  >
                    <FilePlus2 size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Nueva nota</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openModal({ type: "project" }, "Nueva carpeta")}
                  >
                    <FolderPlus size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Nueva carpeta</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setExpanded(new Set())}
                  >
                    <ChevronsDownUp size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Colapsar todo</TooltipContent>
              </Tooltip>
            </header>
            <Separator />
            <ScrollArea className="min-h-0 flex-1">
              <nav className="p-2" aria-label="Árbol de notas">
                {projects.map((project) => (
                  <ProjectTreeItem
                    key={project}
                    project={project}
                    notes={notesByProject[project] || []}
                    expanded={expanded.has(project)}
                    selectedProject={selectedProject}
                    selectedNote={selectedNote}
                    onToggle={() => toggleProject(project)}
                    onSelectNote={(note) => void selectNote(project, note)}
                    onNewNote={() =>
                      openModal({ type: "note", project }, "Nueva nota")
                    }
                    onRename={(note) =>
                      openModal({ type: "rename", project, note }, note)
                    }
                    onDelete={(note) =>
                      openModal({ type: "delete", project, note })
                    }
                  />
                ))}
                {!projects.length && (
                  <p className="px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
                    Crea tu primera carpeta.
                  </p>
                )}
              </nav>
            </ScrollArea>
            <Separator />
            <div className="shrink-0 p-2">
              <Button
                variant="ghost"
                className="w-full justify-start text-[var(--muted-foreground)]"
                onClick={() => openModal({ type: "settings" })}
              >
                <Settings size={15} />
                Ajustes
              </Button>
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border)] px-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] text-[var(--muted-foreground)]">
                  {selectedProject || "Biblioteca"}
                </div>
                <div className="truncate text-sm font-medium">
                  {selectedNote || "Selecciona una nota"}
                </div>
              </div>
              <div className="flex items-center rounded-md bg-[var(--muted)] p-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(viewMode === "edit" && "bg-[var(--background)] shadow-sm")}
                  onClick={() => setViewMode("edit")}
                >
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(viewMode === "read" && "bg-[var(--background)] shadow-sm")}
                  onClick={() => setViewMode("read")}
                >
                  Lectura
                </Button>
              </div>
              <div
                className={cn(
                  "flex w-24 items-center justify-end gap-1.5 text-[11px] text-[var(--muted-foreground)]",
                  saveState === "error" && "text-[var(--destructive)]",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full bg-[var(--muted-foreground)]",
                    saveState === "saving" && "animate-pulse bg-amber-500",
                    saveState === "saved" && "bg-emerald-500",
                    saveState === "dirty" && "bg-amber-500",
                    saveState === "error" && "bg-[var(--destructive)]",
                  )}
                />
                {saveLabel[saveState]}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-hidden">
              {viewMode === "edit" ? (
                <textarea
                  className="h-full w-full resize-none overflow-y-auto bg-[var(--editor)] px-[clamp(24px,7vw,96px)] py-10 font-mono text-[14px] leading-7 text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
                  value={content}
                  disabled={!selectedNote}
                  placeholder="Selecciona o crea una nota para empezar."
                  onChange={(event) => {
                    contentRef.current = event.target.value;
                    setContent(event.target.value);
                    dirtyRef.current = true;
                    setSaveState("dirty");
                  }}
                />
              ) : (
                <ScrollArea className="h-full">
                  {selectedNote ? (
                    <article className="markdown-preview mx-auto max-w-4xl px-[clamp(24px,7vw,96px)] py-10">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: (props) => (
                            <a {...props} target="_blank" rel="noreferrer" />
                          ),
                        }}
                      >
                        {content}
                      </ReactMarkdown>
                    </article>
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-[var(--muted-foreground)]">
                      Selecciona o crea una nota.
                    </div>
                  )}
                </ScrollArea>
              )}
            </div>

            <footer className="flex h-7 shrink-0 items-center gap-2 border-t border-[var(--border)] px-4 text-[10px] text-[var(--muted-foreground)]">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  live ? "bg-emerald-500" : "bg-amber-500",
                )}
              />
              {live ? "Sincronizado" : "Reconectando"}
              <span className="ml-auto truncate" title={root}>
                {root}
              </span>
            </footer>
          </section>
        </main>

        <Dialog open={Boolean(modal)} onOpenChange={(open) => !open && setModal(null)}>
          <DialogContent>
            {modal?.type === "settings" ? (
              <>
                <DialogTitle className="text-base font-semibold">Ajustes</DialogTitle>
                <DialogDescription className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Preferencias locales de la interfaz.
                </DialogDescription>
                <div className="mt-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Apariencia</p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Cambia entre modo claro y oscuro.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                    >
                      {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
                      {theme === "light" ? "Oscuro" : "Claro"}
                    </Button>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium">Autosave</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Guarda 850 ms después de dejar de escribir.
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium">Biblioteca</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-[var(--muted-foreground)]">
                      {root}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <DialogTitle className="text-base font-semibold">
                  {modal?.type === "project" && "Nueva carpeta"}
                  {modal?.type === "note" && "Nueva nota"}
                  {modal?.type === "rename" && "Renombrar nota"}
                  {modal?.type === "delete" && "Eliminar nota"}
                </DialogTitle>
                {modal?.type === "delete" ? (
                  <DialogDescription className="mt-2 text-sm text-[var(--muted-foreground)]">
                    Se eliminará <strong>{modal.note}.md</strong>. Esta acción no
                    se puede deshacer.
                  </DialogDescription>
                ) : (
                  <input
                    autoFocus
                    className="mt-4 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    value={modalValue}
                    onChange={(event) => setModalValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && modalValue.trim()) {
                        void submitModal();
                      }
                    }}
                  />
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setModal(null)}>
                    Cancelar
                  </Button>
                  <Button
                    variant={modal?.type === "delete" ? "destructive" : "default"}
                    disabled={modal?.type !== "delete" && !modalValue.trim()}
                    onClick={() => void submitModal()}
                  >
                    {modal?.type === "delete" ? "Eliminar" : "Guardar"}
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
        <Toaster
          theme={theme}
          position="bottom-right"
          toastOptions={{ className: "text-sm" }}
        />
      </DndContext>
    </TooltipProvider>
  );
}
