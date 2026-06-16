use crate::storage::{BoardDocument, BoardItem, CaptureRequest, Storage};
use axum::{
    extract::{Path, State},
    http::{Method, StatusCode},
    response::{
        sse::{Event, KeepAlive},
        IntoResponse, Sse,
    },
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{convert::Infallible, io, sync::Arc, time::Duration};
use tokio::sync::broadcast;
use tokio_stream::{wrappers::BroadcastStream, StreamExt};
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};

const ADDRESS: &str = "127.0.0.1:3210";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeEvent {
    #[serde(rename = "type")]
    pub event_type: &'static str,
    pub project: Option<String>,
    pub note: Option<String>,
    pub old_note: Option<String>,
    pub new_note: Option<String>,
    pub from_project: Option<String>,
    pub to_project: Option<String>,
}

#[derive(Clone)]
pub struct EventBus {
    sender: broadcast::Sender<ChangeEvent>,
}

impl EventBus {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(128);
        Self { sender }
    }

    pub fn notify(&self, event_type: &'static str, project: Option<String>, note: Option<String>) {
        self.publish(ChangeEvent {
            event_type,
            project,
            note,
            old_note: None,
            new_note: None,
            from_project: None,
            to_project: None,
        });
    }

    pub fn renamed(&self, project: String, old_note: String, new_note: String) {
        self.publish(ChangeEvent {
            event_type: "note:renamed",
            project: Some(project),
            note: Some(new_note.clone()),
            old_note: Some(old_note),
            new_note: Some(new_note),
            from_project: None,
            to_project: None,
        });
    }

    pub fn moved(&self, from_project: String, to_project: String, note: String) {
        self.publish(ChangeEvent {
            event_type: "note:moved",
            project: Some(to_project.clone()),
            note: Some(note.clone()),
            old_note: None,
            new_note: None,
            from_project: Some(from_project),
            to_project: Some(to_project),
        });
    }

    fn publish(&self, change: ChangeEvent) {
        let _ = self.sender.send(change.clone());
        let _ = self.sender.send(ChangeEvent {
            event_type: "notes:changed",
            ..change
        });
    }
}

#[derive(Clone)]
struct AppState {
    storage: Storage,
    events: EventBus,
}

#[derive(Deserialize)]
struct CreateProjectRequest {
    name: String,
}

#[derive(Deserialize)]
struct CreateNoteRequest {
    title: String,
    content: String,
}

#[derive(Deserialize)]
struct CreateBoardRequest {
    title: String,
}

#[derive(Deserialize)]
struct SaveNoteRequest {
    content: String,
}

#[derive(Deserialize)]
struct SaveBoardRequest {
    board: BoardDocument,
}

#[derive(Deserialize)]
struct AppendBoardItemRequest {
    item: BoardItem,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameNoteRequest {
    new_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveNoteRequest {
    target_project: String,
    #[serde(default)]
    create_target_project: bool,
}

pub async fn serve(storage: Storage, events: EventBus) -> io::Result<()> {
    let app = router(storage, events);
    let listener = tokio::net::TcpListener::bind(ADDRESS).await?;
    println!("API local disponible en http://{ADDRESS}");
    axum::serve(listener, app).await
}

fn router(storage: Storage, events: EventBus) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers(Any);

    Router::new()
        .route("/api/health", get(health))
        .route("/api/root", get(get_root))
        .route("/api/projects", get(list_projects).post(create_project))
        .route(
            "/api/projects/{project}/notes",
            get(list_notes).post(create_note),
        )
        .route(
            "/api/projects/{project}/boards",
            get(list_boards).post(create_board),
        )
        .route(
            "/api/projects/{project}/notes/{note}",
            get(read_note).put(save_note).delete(delete_note),
        )
        .route(
            "/api/projects/{project}/boards/{board}",
            get(read_board).put(save_board),
        )
        .route(
            "/api/projects/{project}/boards/{board}/items",
            post(append_board_item),
        )
        .route(
            "/api/projects/{project}/notes/{note}/rename",
            axum::routing::patch(rename_note),
        )
        .route(
            "/api/projects/{project}/notes/{note}/move",
            axum::routing::patch(move_note),
        )
        .route("/api/capture", post(capture))
        .route("/api/events", get(events_stream))
        .with_state(Arc::new(AppState { storage, events }))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

async fn get_root(State(state): State<Arc<AppState>>) -> Json<Value> {
    Json(json!({ "root": state.storage.root().display().to_string() }))
}

async fn list_projects(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    json_result(
        state
            .storage
            .list_projects()
            .map(|projects| json!({ "projects": projects })),
    )
}

async fn create_project(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateProjectRequest>,
) -> impl IntoResponse {
    match state.storage.create_project(&payload.name) {
        Ok(project) => {
            state
                .events
                .notify("project:created", Some(project.clone()), None);
            (
                StatusCode::CREATED,
                Json(json!({ "ok": true, "project": project })),
            )
        }
        Err(error) => api_error(error),
    }
}

async fn list_notes(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
) -> impl IntoResponse {
    json_result(
        state
            .storage
            .list_notes(&project)
            .map(|notes| json!({ "notes": notes })),
    )
}

async fn list_boards(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
) -> impl IntoResponse {
    json_result(
        state
            .storage
            .list_boards(&project)
            .map(|boards| json!({ "boards": boards })),
    )
}

async fn read_note(
    State(state): State<Arc<AppState>>,
    Path((project, note)): Path<(String, String)>,
) -> impl IntoResponse {
    match state.storage.read_note(&project, &note) {
        Ok(content) => (StatusCode::OK, Json(json!({ "content": content }))),
        Err(error) => api_error(error),
    }
}

async fn create_note(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Json(payload): Json<CreateNoteRequest>,
) -> impl IntoResponse {
    match state
        .storage
        .create_note(&project, &payload.title, &payload.content)
    {
        Ok(note) => {
            let project = state.storage.create_project(&project).unwrap_or(project);
            state
                .events
                .notify("note:created", Some(project.clone()), Some(note.clone()));
            (
                StatusCode::CREATED,
                Json(json!({ "ok": true, "project": project, "note": note })),
            )
        }
        Err(error) => api_error(error),
    }
}

async fn create_board(
    State(state): State<Arc<AppState>>,
    Path(project): Path<String>,
    Json(payload): Json<CreateBoardRequest>,
) -> impl IntoResponse {
    match state.storage.create_board(&project, &payload.title) {
        Ok(board) => {
            let project = state.storage.create_project(&project).unwrap_or(project);
            state
                .events
                .notify("board:created", Some(project.clone()), Some(board.clone()));
            (
                StatusCode::CREATED,
                Json(json!({ "ok": true, "project": project, "board": board })),
            )
        }
        Err(error) => api_error(error),
    }
}

async fn read_board(
    State(state): State<Arc<AppState>>,
    Path((project, board)): Path<(String, String)>,
) -> impl IntoResponse {
    match state.storage.read_board(&project, &board) {
        Ok(board) => (StatusCode::OK, Json(json!({ "board": board }))),
        Err(error) => api_error(error),
    }
}

async fn save_board(
    State(state): State<Arc<AppState>>,
    Path((project, board)): Path<(String, String)>,
    Json(payload): Json<SaveBoardRequest>,
) -> impl IntoResponse {
    match state.storage.save_board(&project, &board, &payload.board) {
        Ok(()) => {
            state
                .events
                .notify("board:saved", Some(project), Some(board));
            (StatusCode::OK, Json(json!({ "ok": true })))
        }
        Err(error) => api_error(error),
    }
}

async fn append_board_item(
    State(state): State<Arc<AppState>>,
    Path((project, board)): Path<(String, String)>,
    Json(payload): Json<AppendBoardItemRequest>,
) -> impl IntoResponse {
    match state
        .storage
        .append_board_item(&project, &board, payload.item)
    {
        Ok(()) => {
            state
                .events
                .notify("board:item-added", Some(project), Some(board));
            (StatusCode::OK, Json(json!({ "ok": true })))
        }
        Err(error) => api_error(error),
    }
}

async fn save_note(
    State(state): State<Arc<AppState>>,
    Path((project, note)): Path<(String, String)>,
    Json(payload): Json<SaveNoteRequest>,
) -> impl IntoResponse {
    match state.storage.save_note(&project, &note, &payload.content) {
        Ok(outcome) => {
            if outcome.renamed {
                state.events.renamed(project, note, outcome.note.clone());
            } else {
                state
                    .events
                    .notify("note:saved", Some(project), Some(outcome.note.clone()));
            }
            (
                StatusCode::OK,
                Json(json!({
                    "ok": true,
                    "note": outcome.note,
                    "renamed": outcome.renamed,
                    "warning": outcome.warning
                })),
            )
        }
        Err(error) => api_error(error),
    }
}

async fn delete_note(
    State(state): State<Arc<AppState>>,
    Path((project, note)): Path<(String, String)>,
) -> impl IntoResponse {
    match state.storage.delete_note(&project, &note) {
        Ok(()) => {
            state
                .events
                .notify("note:deleted", Some(project), Some(note));
            (StatusCode::OK, Json(json!({ "ok": true })))
        }
        Err(error) => api_error(error),
    }
}

async fn rename_note(
    State(state): State<Arc<AppState>>,
    Path((project, note)): Path<(String, String)>,
    Json(payload): Json<RenameNoteRequest>,
) -> impl IntoResponse {
    match state
        .storage
        .rename_note(&project, &note, &payload.new_name)
    {
        Ok(new_note) => {
            state.events.renamed(project, note, new_note.clone());
            (
                StatusCode::OK,
                Json(json!({ "ok": true, "note": new_note })),
            )
        }
        Err(error) => api_error(error),
    }
}

async fn move_note(
    State(state): State<Arc<AppState>>,
    Path((project, note)): Path<(String, String)>,
    Json(payload): Json<MoveNoteRequest>,
) -> impl IntoResponse {
    match state.storage.move_note(
        &project,
        &note,
        &payload.target_project,
        payload.create_target_project,
    ) {
        Ok(outcome) => {
            state.events.moved(
                outcome.from_project.clone(),
                outcome.to_project.clone(),
                outcome.note.clone(),
            );
            (
                StatusCode::OK,
                Json(json!({
                    "ok": true,
                    "fromProject": outcome.from_project,
                    "toProject": outcome.to_project,
                    "note": outcome.note
                })),
            )
        }
        Err(error) => api_error(error),
    }
}

async fn capture(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CaptureRequest>,
) -> impl IntoResponse {
    if payload.title.trim().is_empty() || payload.url.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": "title y url son obligatorios" })),
        );
    }

    match state.storage.append_capture(&payload) {
        Ok((project, note)) => {
            state
                .events
                .notify("capture:created", Some(project), Some(note));
            (
                StatusCode::CREATED,
                Json(json!({ "ok": true, "message": "captura guardada" })),
            )
        }
        Err(error) => api_error(error),
    }
}

async fn events_stream(
    State(state): State<Arc<AppState>>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(state.events.sender.subscribe()).filter_map(|message| {
        message.ok().map(|change| {
            let data = serde_json::to_string(&change).unwrap_or_else(|_| "{}".to_string());
            Ok(Event::default().event(change.event_type).data(data))
        })
    });

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive"),
    )
}

fn json_result(result: io::Result<Value>) -> (StatusCode, Json<Value>) {
    match result {
        Ok(value) => (StatusCode::OK, Json(value)),
        Err(error) => api_error(error),
    }
}

fn api_error(error: io::Error) -> (StatusCode, Json<Value>) {
    let status = match error.kind() {
        io::ErrorKind::NotFound => StatusCode::NOT_FOUND,
        io::ErrorKind::AlreadyExists => StatusCode::CONFLICT,
        io::ErrorKind::InvalidInput => StatusCode::BAD_REQUEST,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (
        status,
        Json(json!({ "ok": false, "error": error.to_string() })),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::Request,
    };
    use tower::ServiceExt;

    fn test_app() -> (tempfile::TempDir, Storage, EventBus, Router) {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(temp.path().join("Loquera")).unwrap();
        let events = EventBus::new();
        let app = router(storage.clone(), events.clone());
        (temp, storage, events, app)
    }

    async fn json_request(
        app: Router,
        method: Method,
        uri: &str,
        body: Value,
    ) -> axum::response::Response {
        app.oneshot(
            Request::builder()
                .method(method)
                .uri(uri)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn exposes_full_notes_crud_over_http() {
        let (_temp, _storage, _events, app) = test_app();

        let project = json_request(
            app.clone(),
            Method::POST,
            "/api/projects",
            json!({ "name": "Ideas" }),
        )
        .await;
        assert_eq!(project.status(), StatusCode::CREATED);

        let note = json_request(
            app.clone(),
            Method::POST,
            "/api/projects/Ideas/notes",
            json!({ "title": "Primera", "content": "# Hola" }),
        )
        .await;
        assert_eq!(note.status(), StatusCode::CREATED);

        let saved = json_request(
            app.clone(),
            Method::PUT,
            "/api/projects/Ideas/notes/Primera",
            json!({ "content": "# Primera\n\nActualizada" }),
        )
        .await;
        assert_eq!(saved.status(), StatusCode::OK);

        let read = app
            .oneshot(
                Request::builder()
                    .uri("/api/projects/Ideas/notes/Primera")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body = to_bytes(read.into_body(), usize::MAX).await.unwrap();
        assert!(String::from_utf8_lossy(&body).contains("Actualizada"));
    }

    #[tokio::test]
    async fn capture_writes_markdown_and_emits_change() {
        let (_temp, storage, events, app) = test_app();
        let mut changes = events.sender.subscribe();
        let captured = json_request(
            app,
            Method::POST,
            "/api/capture",
            json!({
                "project": "Inbox",
                "note": "Capturas",
                "title": "Página de prueba",
                "url": "https://example.com",
                "selectedText": "Texto elegido",
                "comment": "Comentario",
                "youtubeTimestamp": 83
            }),
        )
        .await;

        assert_eq!(captured.status(), StatusCode::CREATED);
        let change = changes.recv().await.unwrap();
        assert_eq!(change.event_type, "capture:created");
        assert_eq!(change.project.as_deref(), Some("Inbox"));
        assert_eq!(change.note.as_deref(), Some("Capturas"));
        let markdown = storage.read_note("Inbox", "Capturas").unwrap();
        assert!(markdown.contains("**Timestamp:** 01:23"));
        assert!(markdown.contains("> Texto elegido"));
    }

    #[tokio::test]
    async fn renames_moves_and_deletes_notes_over_http() {
        let (_temp, storage, _events, app) = test_app();
        storage
            .create_note("Ideas", "Original", "# Original")
            .unwrap();
        storage.create_project("Archivo").unwrap();

        let renamed = json_request(
            app.clone(),
            Method::PATCH,
            "/api/projects/Ideas/notes/Original/rename",
            json!({ "newName": "Renombrada" }),
        )
        .await;
        assert_eq!(renamed.status(), StatusCode::OK);

        let moved = json_request(
            app.clone(),
            Method::PATCH,
            "/api/projects/Ideas/notes/Renombrada/move",
            json!({ "targetProject": "Archivo" }),
        )
        .await;
        assert_eq!(moved.status(), StatusCode::OK);

        let deleted = app
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri("/api/projects/Archivo/notes/Renombrada")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(deleted.status(), StatusCode::OK);
        assert!(storage.list_notes("Archivo").unwrap().is_empty());
    }

    #[tokio::test]
    async fn save_endpoint_reports_automatic_rename() {
        let (_temp, storage, _events, app) = test_app();
        storage.create_note("Ideas", "Vieja", "# Vieja").unwrap();

        let response = json_request(
            app,
            Method::PUT,
            "/api/projects/Ideas/notes/Vieja",
            json!({ "content": "# Nueva\n\nTexto" }),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(payload["renamed"], true);
        assert_eq!(payload["note"], "Nueva");
    }

    #[tokio::test]
    async fn exposes_board_crud_over_http() {
        let (_temp, _storage, _events, app) = test_app();
        let created = json_request(
            app.clone(),
            Method::POST,
            "/api/projects/Inbox/boards",
            json!({ "title": "Clase YouTube" }),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);

        let appended = json_request(
            app.clone(),
            Method::POST,
            "/api/projects/Inbox/boards/Clase%20YouTube/items",
            json!({
                "item": {
                    "id": "item_123",
                    "kind": "text",
                    "x": 120,
                    "y": 80,
                    "width": 260,
                    "height": 160,
                    "text": "Idea"
                }
            }),
        )
        .await;
        assert_eq!(appended.status(), StatusCode::OK);

        let read = app
            .oneshot(
                Request::builder()
                    .uri("/api/projects/Inbox/boards/Clase%20YouTube")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(read.status(), StatusCode::OK);
        let body = to_bytes(read.into_body(), usize::MAX).await.unwrap();
        assert!(String::from_utf8_lossy(&body).contains("\"loqboard\""));
        assert!(String::from_utf8_lossy(&body).contains("\"Idea\""));
    }
}
