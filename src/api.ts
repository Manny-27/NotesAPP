import { invoke } from "@tauri-apps/api/core";

const API_BASE = "http://127.0.0.1:3210/api";

class ApiUnavailableError extends Error {}

export type ChangeType =
  | "project:created"
  | "note:created"
  | "note:saved"
  | "note:deleted"
  | "note:renamed"
  | "note:moved"
  | "board:created"
  | "board:saved"
  | "board:item-added"
  | "capture:created"
  | "notes:changed";

export interface NotesChangedEvent {
  type: ChangeType;
  project: string | null;
  note: string | null;
  oldNote: string | null;
  newNote: string | null;
  fromProject: string | null;
  toProject: string | null;
}

export interface SaveResult {
  note: string;
  renamed: boolean;
  warning: string | null;
}

export interface MoveResult {
  fromProject: string;
  toProject: string;
  note: string;
}

export interface CapturePayload {
  project: string;
  note: string;
  title: string;
  url: string;
  description?: string | null;
  canonicalUrl?: string | null;
  domain?: string | null;
  siteName?: string | null;
  imageUrl?: string | null;
  faviconUrl?: string | null;
  youtubeVideoId?: string | null;
  selectedText?: string | null;
  comment?: string | null;
  youtubeTimestamp?: number | null;
}

export interface BoardItem {
  id: string;
  kind: "youtube" | "text" | string;
  x: number;
  y: number;
  width: number;
  height: number;
  locked?: boolean;
  pinned?: boolean;
  pinnedX?: number | null;
  pinnedY?: number | null;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  canonicalUrl?: string | null;
  domain?: string | null;
  siteName?: string | null;
  imageUrl?: string | null;
  faviconUrl?: string | null;
  selectedText?: string | null;
  videoId?: string | null;
  timestamp?: number | null;
  thumbnailUrl?: string | null;
  language?: string | null;
  code?: string | null;
  note?: string | null;
  text?: string | null;
}

export interface BoardDocument {
  schemaVersion: number;
  type: "loqboard";
  title: string;
  createdAt: string;
  updatedAt: string;
  items: BoardItem[];
  snapshot?: unknown;
}

function isTauri() {
  return "__TAURI_INTERNALS__" in window;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiUnavailableError(
      "La API local no está disponible. Abre Loquera desktop y vuelve a intentar.",
    );
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `La API respondió ${response.status}.`);
  }
  return result as T;
}

async function withTauriFallback<T>(
  httpCall: () => Promise<T>,
  tauriCall: () => Promise<T>,
) {
  try {
    return await httpCall();
  } catch (error) {
    if (!isTauri() || !(error instanceof ApiUnavailableError)) throw error;
    return tauriCall();
  }
}

const segment = (value: string) => encodeURIComponent(value);

export const api = {
  listProjects: () =>
    withTauriFallback(
      () =>
        request<{ projects: string[] }>("/projects").then(
          ({ projects }) => projects,
        ),
      () => invoke<string[]>("list_projects"),
    ),

  createProject: (name: string) =>
    withTauriFallback(
      () =>
        request<{ project: string }>("/projects", {
          method: "POST",
          body: JSON.stringify({ name }),
        }).then(({ project }) => project),
      () => invoke<string>("create_project", { name }),
    ),

  listNotes: (project: string) =>
    withTauriFallback(
      () =>
        request<{ notes: string[] }>(
          `/projects/${segment(project)}/notes`,
        ).then(({ notes }) => notes),
      () => invoke<string[]>("list_notes", { project }),
    ),

  listBoards: (project: string) =>
    withTauriFallback(
      () =>
        request<{ boards: string[] }>(
          `/projects/${segment(project)}/boards`,
        ).then(({ boards }) => boards),
      () => invoke<string[]>("list_boards", { project }),
    ),

  readNote: (project: string, note: string) =>
    withTauriFallback(
      () =>
        request<{ content: string }>(
          `/projects/${segment(project)}/notes/${segment(note)}`,
        ).then(({ content }) => content),
      () => invoke<string>("read_note", { project, note }),
    ),

  createNote: (project: string, title: string, content: string) =>
    withTauriFallback(
      () =>
        request<{ note: string }>(`/projects/${segment(project)}/notes`, {
          method: "POST",
          body: JSON.stringify({ title, content }),
        }).then(({ note }) => note),
      () => invoke<string>("create_note", { project, title, content }),
    ),

  createBoard: (project: string, title: string) =>
    withTauriFallback(
      () =>
        request<{ board: string }>(`/projects/${segment(project)}/boards`, {
          method: "POST",
          body: JSON.stringify({ title }),
        }).then(({ board }) => board),
      () => invoke<string>("create_board", { project, title }),
    ),

  readBoard: (project: string, board: string) =>
    withTauriFallback(
      () =>
        request<{ board: BoardDocument }>(
          `/projects/${segment(project)}/boards/${segment(board)}`,
        ).then(({ board }) => board),
      () => invoke<BoardDocument>("read_board", { project, board }),
    ),

  saveBoard: (project: string, board: string, document: BoardDocument) =>
    withTauriFallback(
      () =>
        request<{ ok: boolean }>(
          `/projects/${segment(project)}/boards/${segment(board)}`,
          {
            method: "PUT",
            body: JSON.stringify({ board: document }),
          },
        ),
      () =>
        invoke<void>("save_board", { project, board, document }).then(() => ({
          ok: true,
        })),
    ),

  appendBoardItem: (project: string, board: string, item: BoardItem) =>
    request<{ ok: boolean }>(
      `/projects/${segment(project)}/boards/${segment(board)}/items`,
      {
        method: "POST",
        body: JSON.stringify({ item }),
      },
    ),

  saveNote: (project: string, note: string, content: string) =>
    withTauriFallback(
      () =>
        request<SaveResult>(
          `/projects/${segment(project)}/notes/${segment(note)}`,
          {
            method: "PUT",
            body: JSON.stringify({ content }),
          },
        ),
      () => invoke<SaveResult>("save_note", { project, note, content }),
    ),

  deleteNote: (project: string, note: string) =>
    request<{ ok: boolean }>(
      `/projects/${segment(project)}/notes/${segment(note)}`,
      { method: "DELETE" },
    ),

  renameNote: (project: string, note: string, newName: string) =>
    request<{ ok: boolean; note: string }>(
      `/projects/${segment(project)}/notes/${segment(note)}/rename`,
      {
        method: "PATCH",
        body: JSON.stringify({ newName }),
      },
    ),

  moveNote: (
    project: string,
    note: string,
    targetProject: string,
    createTargetProject = false,
  ) =>
    request<MoveResult>(
      `/projects/${segment(project)}/notes/${segment(note)}/move`,
      {
        method: "PATCH",
        body: JSON.stringify({ targetProject, createTargetProject }),
      },
    ),

  getNotesRoot: () =>
    withTauriFallback(
      () => request<{ root: string }>("/root").then(({ root }) => root),
      () => invoke<string>("get_notes_root"),
    ),

  captureNote: (payload: CapturePayload) =>
    request<{ ok: boolean; message: string }>("/capture", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  subscribe(
    onChange: (event: NotesChangedEvent) => void,
    onConnectionChange?: (connected: boolean) => void,
  ) {
    const source = new EventSource(`${API_BASE}/events`);
    const eventTypes: ChangeType[] = [
      "project:created",
      "note:created",
      "note:saved",
      "note:deleted",
      "note:renamed",
      "note:moved",
      "board:created",
      "board:saved",
      "board:item-added",
      "capture:created",
    ];

    source.onopen = () => onConnectionChange?.(true);
    source.onerror = () => onConnectionChange?.(false);
    const listener = (message: Event) => {
      try {
        onChange(JSON.parse((message as MessageEvent).data));
      } catch {
        // Ignore malformed local events and keep the stream alive.
      }
    };
    eventTypes.forEach((eventType) =>
      source.addEventListener(eventType, listener),
    );
    return () => source.close();
  },
};
