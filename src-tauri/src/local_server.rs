use crate::storage::{CaptureRequest, Storage};
use axum::{
    extract::State,
    http::{Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::{io, sync::Arc};
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};

const ADDRESS: &str = "127.0.0.1:3210";

pub async fn serve(storage: Storage) -> io::Result<()> {
    let app = router(storage);
    let listener = tokio::net::TcpListener::bind(ADDRESS).await?;
    println!("Servidor de capturas disponible en http://{ADDRESS}");
    axum::serve(listener, app).await
}

fn router(storage: Storage) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    Router::new()
        .route("/api/health", get(health))
        .route("/api/capture", post(capture))
        .with_state(Arc::new(storage))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

async fn capture(
    State(storage): State<Arc<Storage>>,
    Json(payload): Json<CaptureRequest>,
) -> impl IntoResponse {
    if payload.title.trim().is_empty() || payload.url.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": "title y url son obligatorios" })),
        );
    }

    match storage.append_capture(&payload) {
        Ok(()) => (
            StatusCode::CREATED,
            Json(json!({ "ok": true, "message": "captura guardada" })),
        ),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": error.to_string() })),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;

    #[tokio::test]
    async fn health_and_capture_work_end_to_end() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(temp.path().join("Loquera")).unwrap();
        let app = router(storage.clone());

        let health = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(health.status(), StatusCode::OK);

        let payload = serde_json::json!({
            "project": "Inbox",
            "note": "Capturas",
            "title": "Página de prueba",
            "url": "https://example.com",
            "selectedText": "Texto elegido",
            "comment": "Comentario",
            "youtubeTimestamp": 83
        });
        let captured = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/capture")
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(captured.status(), StatusCode::CREATED);
        let markdown = storage.read_note("Inbox", "Capturas").unwrap();
        assert!(markdown.contains("**YouTube timestamp:** 01:23"));
        assert!(markdown.contains("> Texto elegido"));
        assert!(markdown.contains("Comentario"));
    }
}
