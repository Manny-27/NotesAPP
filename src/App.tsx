import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "./api";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function App() {
  const [root, setRoot] = useState("Cargando...");
  const [projects, setProjects] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedNote, setSelectedNote] = useState("");
  const [content, setContent] = useState("");
  const [projectName, setProjectName] = useState("");
  const [noteName, setNoteName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("Listo");
  const [busy, setBusy] = useState(false);

  const refreshProjects = useCallback(async (preferred?: string) => {
    const list = await api.listProjects();
    setProjects(list);
    setSelectedProject((current) => {
      const candidate = preferred ?? current;
      return list.includes(candidate) ? candidate : (list[0] ?? "");
    });
  }, []);

  const refreshNotes = useCallback(
    async (project: string, preferred?: string) => {
      if (!project) {
        setNotes([]);
        setSelectedNote("");
        setContent("");
        return;
      }
      const list = await api.listNotes(project);
      setNotes(list);
      setSelectedNote((current) => {
        const candidate = preferred ?? current;
        return list.includes(candidate) ? candidate : (list[0] ?? "");
      });
    },
    [],
  );

  useEffect(() => {
    Promise.all([api.getNotesRoot(), api.listProjects()])
      .then(([notesRoot, list]) => {
        setRoot(notesRoot);
        setProjects(list);
        setSelectedProject(list[0] ?? "");
      })
      .catch((error) => {
        setRoot("No disponible");
        setStatus(`No se pudo conectar con Tauri: ${errorMessage(error)}`);
      });
  }, []);

  useEffect(() => {
    refreshNotes(selectedProject).catch((error) =>
      setStatus(`No se pudieron cargar las notas: ${errorMessage(error)}`),
    );
  }, [selectedProject, refreshNotes]);

  useEffect(() => {
    if (!selectedProject || !selectedNote) {
      setContent("");
      setDirty(false);
      return;
    }
    api
      .readNote(selectedProject, selectedNote)
      .then((markdown) => {
        setContent(markdown);
        setDirty(false);
        setStatus("Nota cargada");
      })
      .catch((error) =>
        setStatus(`No se pudo leer la nota: ${errorMessage(error)}`),
      );
  }, [selectedProject, selectedNote]);

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!projectName.trim()) return;
    setBusy(true);
    try {
      const created = await api.createProject(projectName);
      setProjectName("");
      await refreshProjects(created);
      setStatus(`Proyecto "${created}" creado`);
    } catch (error) {
      setStatus(`No se pudo crear el proyecto: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function createNote(event: FormEvent) {
    event.preventDefault();
    if (!selectedProject || !noteName.trim()) return;
    setBusy(true);
    try {
      const initialContent = `# ${noteName.trim()}\n\n`;
      const created = await api.createNote(
        selectedProject,
        noteName,
        initialContent,
      );
      setNoteName("");
      await refreshNotes(selectedProject, created);
      setStatus(`Nota "${created}" creada`);
    } catch (error) {
      setStatus(`No se pudo crear la nota: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    if (!selectedProject || !selectedNote) return;
    setBusy(true);
    try {
      await api.saveNote(selectedProject, selectedNote, content);
      setDirty(false);
      setStatus("Cambios guardados en Markdown");
    } catch (error) {
      setStatus(`No se pudo guardar: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function refreshAll() {
    setBusy(true);
    try {
      await refreshProjects();
      await refreshNotes(selectedProject);
      setStatus("Listas actualizadas");
    } catch (error) {
      setStatus(`No se pudo refrescar: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Markdown local, sin vueltas</p>
          <h1>Loquera</h1>
        </div>
        <button className="ghost-button" disabled={busy} onClick={refreshAll}>
          Refrescar
        </button>
      </header>

      <div className="path-bar" title={root}>
        <span>Carpeta de notas</span>
        <code>{root}</code>
      </div>

      <section className="workspace">
        <aside className="sidebar">
          <div className="section-heading">
            <h2>Proyectos</h2>
            <span>{projects.length}</span>
          </div>
          <form className="quick-form" onSubmit={createProject}>
            <input
              aria-label="Nombre del proyecto"
              placeholder="Nuevo proyecto"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
            <button disabled={busy || !projectName.trim()} type="submit">
              Crear
            </button>
          </form>
          <nav className="item-list" aria-label="Proyectos">
            {projects.map((project) => (
              <button
                className={project === selectedProject ? "active" : ""}
                key={project}
                onClick={() => setSelectedProject(project)}
              >
                {project}
              </button>
            ))}
            {!projects.length && (
              <p className="empty-state">Crea tu primer proyecto.</p>
            )}
          </nav>
        </aside>

        <aside className="notes-panel">
          <div className="section-heading">
            <h2>Notas</h2>
            <span>{notes.length}</span>
          </div>
          <form className="quick-form" onSubmit={createNote}>
            <input
              aria-label="Título de la nota"
              disabled={!selectedProject}
              placeholder="Nueva nota"
              value={noteName}
              onChange={(event) => setNoteName(event.target.value)}
            />
            <button
              disabled={busy || !selectedProject || !noteName.trim()}
              type="submit"
            >
              Crear
            </button>
          </form>
          <nav className="item-list" aria-label="Notas">
            {notes.map((note) => (
              <button
                className={note === selectedNote ? "active" : ""}
                key={note}
                onClick={() => setSelectedNote(note)}
              >
                <span>{note}</span>
                <small>.md</small>
              </button>
            ))}
            {selectedProject && !notes.length && (
              <p className="empty-state">Este proyecto aún no tiene notas.</p>
            )}
          </nav>
        </aside>

        <article className="editor-panel">
          <div className="editor-heading">
            <div>
              <p className="eyebrow">{selectedProject || "Sin proyecto"}</p>
              <h2>{selectedNote || "Selecciona una nota"}</h2>
            </div>
            <button
              disabled={busy || !selectedNote || !dirty}
              onClick={saveNote}
            >
              {dirty ? "Guardar cambios" : "Guardado"}
            </button>
          </div>
          <textarea
            aria-label="Editor Markdown"
            disabled={!selectedNote}
            placeholder="Selecciona o crea una nota para empezar."
            spellCheck
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setDirty(true);
            }}
          />
        </article>
      </section>

      <footer className={status.startsWith("No se") ? "error" : ""}>
        <span className="status-dot" />
        {status}
      </footer>
    </main>
  );
}
