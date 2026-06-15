import { invoke } from "@tauri-apps/api/core";

export const api = {
  listProjects: () => invoke<string[]>("list_projects"),
  createProject: (name: string) => invoke<string>("create_project", { name }),
  listNotes: (project: string) =>
    invoke<string[]>("list_notes", { project }),
  readNote: (project: string, note: string) =>
    invoke<string>("read_note", { project, note }),
  createNote: (project: string, title: string, content: string) =>
    invoke<string>("create_note", { project, title, content }),
  saveNote: (project: string, note: string, content: string) =>
    invoke<void>("save_note", { project, note, content }),
  getNotesRoot: () => invoke<string>("get_notes_root"),
};
