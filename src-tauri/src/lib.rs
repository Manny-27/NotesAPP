mod local_server;
mod storage;

use local_server::EventBus;
use storage::Storage;

#[tauri::command]
fn list_projects(storage: tauri::State<'_, Storage>) -> Result<Vec<String>, String> {
    storage.list_projects().map_err(|error| error.to_string())
}

#[tauri::command]
fn create_project(
    storage: tauri::State<'_, Storage>,
    events: tauri::State<'_, EventBus>,
    name: String,
) -> Result<String, String> {
    let project = storage
        .create_project(&name)
        .map_err(|error| error.to_string())?;
    events.notify("project:created", Some(project.clone()), None);
    Ok(project)
}

#[tauri::command]
fn list_notes(storage: tauri::State<'_, Storage>, project: String) -> Result<Vec<String>, String> {
    storage
        .list_notes(&project)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_boards(storage: tauri::State<'_, Storage>, project: String) -> Result<Vec<String>, String> {
    storage
        .list_boards(&project)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn read_note(
    storage: tauri::State<'_, Storage>,
    project: String,
    note: String,
) -> Result<String, String> {
    storage
        .read_note(&project, &note)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn create_note(
    storage: tauri::State<'_, Storage>,
    events: tauri::State<'_, EventBus>,
    project: String,
    title: String,
    content: String,
) -> Result<String, String> {
    let note = storage
        .create_note(&project, &title, &content)
        .map_err(|error| error.to_string())?;
    events.notify("note:created", Some(project), Some(note.clone()));
    Ok(note)
}

#[tauri::command]
fn create_board(
    storage: tauri::State<'_, Storage>,
    events: tauri::State<'_, EventBus>,
    project: String,
    title: String,
) -> Result<String, String> {
    let board = storage
        .create_board(&project, &title)
        .map_err(|error| error.to_string())?;
    events.notify("board:created", Some(project), Some(board.clone()));
    Ok(board)
}

#[tauri::command]
fn read_board(
    storage: tauri::State<'_, Storage>,
    project: String,
    board: String,
) -> Result<storage::BoardDocument, String> {
    storage
        .read_board(&project, &board)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_board(
    storage: tauri::State<'_, Storage>,
    events: tauri::State<'_, EventBus>,
    project: String,
    board: String,
    document: storage::BoardDocument,
) -> Result<(), String> {
    storage
        .save_board(&project, &board, &document)
        .map_err(|error| error.to_string())?;
    events.notify("board:saved", Some(project), Some(board));
    Ok(())
}

#[tauri::command]
fn save_note(
    storage: tauri::State<'_, Storage>,
    events: tauri::State<'_, EventBus>,
    project: String,
    note: String,
    content: String,
) -> Result<storage::SaveOutcome, String> {
    let outcome = storage
        .save_note(&project, &note, &content)
        .map_err(|error| error.to_string())?;
    if outcome.renamed {
        events.renamed(project, note, outcome.note.clone());
    } else {
        events.notify("note:saved", Some(project), Some(outcome.note.clone()));
    }
    Ok(outcome)
}

#[tauri::command]
fn get_notes_root(storage: tauri::State<'_, Storage>) -> String {
    storage.root().display().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let storage = Storage::default().expect("no se pudo inicializar la carpeta de notas");
    let server_storage = storage.clone();
    let events = EventBus::new();
    let server_events = events.clone();

    tauri::Builder::default()
        .manage(storage)
        .manage(events)
        .setup(move |_app| {
            tauri::async_runtime::spawn(async move {
                if let Err(error) = local_server::serve(server_storage, server_events).await {
                    eprintln!("El servidor local no pudo iniciar: {error}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_projects,
            create_project,
            list_notes,
            list_boards,
            read_note,
            create_note,
            create_board,
            read_board,
            save_board,
            save_note,
            get_notes_root
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar Loquera");
}
