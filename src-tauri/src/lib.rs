mod local_server;
mod storage;

use storage::Storage;

#[tauri::command]
fn list_projects(storage: tauri::State<'_, Storage>) -> Result<Vec<String>, String> {
    storage.list_projects().map_err(|error| error.to_string())
}

#[tauri::command]
fn create_project(storage: tauri::State<'_, Storage>, name: String) -> Result<String, String> {
    storage
        .create_project(&name)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_notes(storage: tauri::State<'_, Storage>, project: String) -> Result<Vec<String>, String> {
    storage
        .list_notes(&project)
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
    project: String,
    title: String,
    content: String,
) -> Result<String, String> {
    storage
        .create_note(&project, &title, &content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_note(
    storage: tauri::State<'_, Storage>,
    project: String,
    note: String,
    content: String,
) -> Result<(), String> {
    storage
        .save_note(&project, &note, &content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_notes_root(storage: tauri::State<'_, Storage>) -> String {
    storage.root().display().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let storage = Storage::default().expect("no se pudo inicializar la carpeta de notas");
    let server_storage = storage.clone();

    tauri::Builder::default()
        .manage(storage)
        .setup(move |_app| {
            tauri::async_runtime::spawn(async move {
                if let Err(error) = local_server::serve(server_storage).await {
                    eprintln!("El servidor local no pudo iniciar: {error}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_projects,
            create_project,
            list_notes,
            read_note,
            create_note,
            save_note,
            get_notes_root
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar Loquera");
}
