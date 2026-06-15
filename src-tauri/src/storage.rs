use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

#[derive(Clone)]
pub struct Storage {
    root: PathBuf,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRequest {
    pub project: String,
    pub note: String,
    pub title: String,
    pub url: String,
    pub selected_text: Option<String>,
    pub comment: Option<String>,
    pub youtube_timestamp: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOutcome {
    pub note: String,
    pub renamed: bool,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveOutcome {
    pub from_project: String,
    pub to_project: String,
    pub note: String,
}

impl Storage {
    pub fn default() -> io::Result<Self> {
        let documents = dirs::document_dir()
            .or_else(|| dirs::home_dir().map(|home| home.join("Documents")))
            .ok_or_else(|| {
                io::Error::new(io::ErrorKind::NotFound, "carpeta personal no encontrada")
            })?;

        Self::new(documents.join("Loquera"))
    }

    pub fn new(root: PathBuf) -> io::Result<Self> {
        fs::create_dir_all(&root)?;
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn list_projects(&self) -> io::Result<Vec<String>> {
        let mut projects = fs::read_dir(&self.root)?
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false))
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        projects.sort_by_key(|name| name.to_lowercase());
        Ok(projects)
    }

    pub fn create_project(&self, name: &str) -> io::Result<String> {
        let project = sanitize_name(name)?;
        fs::create_dir_all(self.root.join(&project))?;
        Ok(project)
    }

    pub fn list_notes(&self, project: &str) -> io::Result<Vec<String>> {
        let project = sanitize_name(project)?;
        let directory = self.root.join(project);
        if !directory.exists() {
            return Ok(Vec::new());
        }

        let mut notes = fs::read_dir(directory)?
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_type()
                    .map(|kind| kind.is_file())
                    .unwrap_or(false)
            })
            .filter_map(|entry| {
                let path = entry.path();
                if path.extension().and_then(|value| value.to_str()) == Some("md") {
                    path.file_stem()
                        .map(|stem| stem.to_string_lossy().into_owned())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        notes.sort_by_key(|name| name.to_lowercase());
        Ok(notes)
    }

    pub fn read_note(&self, project: &str, note: &str) -> io::Result<String> {
        fs::read_to_string(self.note_path(project, note)?)
    }

    pub fn create_note(&self, project: &str, title: &str, content: &str) -> io::Result<String> {
        let project = self.create_project(project)?;
        let note = sanitize_note_name(title)?;
        let path = self.root.join(project).join(format!("{note}.md"));

        if path.exists() {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "ya existe una nota con ese nombre",
            ));
        }

        fs::write(path, content)?;
        Ok(note)
    }

    pub fn save_note(&self, project: &str, note: &str, content: &str) -> io::Result<SaveOutcome> {
        let project = self.create_project(project)?;
        let note = sanitize_note_name(note)?;
        let current_path = self.root.join(&project).join(format!("{note}.md"));
        fs::write(&current_path, content)?;

        let Some(title) = markdown_title(content) else {
            return Ok(SaveOutcome {
                note,
                renamed: false,
                warning: None,
            });
        };
        let new_note = sanitize_note_name(title)?;
        if new_note == note {
            return Ok(SaveOutcome {
                note,
                renamed: false,
                warning: None,
            });
        }

        let target_path = self.root.join(project).join(format!("{new_note}.md"));
        if target_path.exists() {
            return Ok(SaveOutcome {
                note,
                renamed: false,
                warning: Some(
                    "El título cambió, pero ya existe una nota con ese nombre.".to_string(),
                ),
            });
        }

        fs::rename(current_path, target_path)?;
        Ok(SaveOutcome {
            note: new_note,
            renamed: true,
            warning: None,
        })
    }

    pub fn delete_note(&self, project: &str, note: &str) -> io::Result<()> {
        let path = self.note_path(project, note)?;
        if !path.exists() {
            return Err(io::Error::new(io::ErrorKind::NotFound, "la nota no existe"));
        }
        fs::remove_file(path)
    }

    pub fn rename_note(&self, project: &str, note: &str, new_name: &str) -> io::Result<String> {
        let source = self.note_path(project, note)?;
        if !source.exists() {
            return Err(io::Error::new(io::ErrorKind::NotFound, "la nota no existe"));
        }
        let project = sanitize_name(project)?;
        let new_note = sanitize_note_name(new_name)?;
        let target = self.root.join(project).join(format!("{new_note}.md"));
        if target != source && target.exists() {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "ya existe una nota con ese nombre",
            ));
        }
        if target != source {
            fs::rename(source, target)?;
        }
        Ok(new_note)
    }

    pub fn move_note(
        &self,
        project: &str,
        note: &str,
        target_project: &str,
        create_target_project: bool,
    ) -> io::Result<MoveOutcome> {
        let from_project = sanitize_name(project)?;
        let to_project = sanitize_name(target_project)?;
        let note = sanitize_note_name(note)?;
        let source = self.root.join(&from_project).join(format!("{note}.md"));
        if !source.exists() {
            return Err(io::Error::new(io::ErrorKind::NotFound, "la nota no existe"));
        }

        let target_directory = self.root.join(&to_project);
        if !target_directory.exists() {
            if create_target_project {
                fs::create_dir_all(&target_directory)?;
            } else {
                return Err(io::Error::new(
                    io::ErrorKind::NotFound,
                    "el proyecto destino no existe",
                ));
            }
        }

        let target = target_directory.join(format!("{note}.md"));
        if target.exists() {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "ya existe una nota con ese nombre en el proyecto destino",
            ));
        }
        fs::rename(source, target)?;
        Ok(MoveOutcome {
            from_project,
            to_project,
            note,
        })
    }

    pub fn append_capture(&self, capture: &CaptureRequest) -> io::Result<(String, String)> {
        let project = self.create_project(&capture.project)?;
        let note = sanitize_note_name(&capture.note)?;
        let path = self.root.join(&project).join(format!("{note}.md"));
        let block = format_capture(capture, Local::now());
        let needs_leading_break = path
            .metadata()
            .map(|metadata| metadata.len() > 0)
            .unwrap_or(false);

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)?;
        if needs_leading_break {
            writeln!(file)?;
        }
        file.write_all(block.as_bytes())?;
        Ok((project, note))
    }

    fn note_path(&self, project: &str, note: &str) -> io::Result<PathBuf> {
        let project = sanitize_name(project)?;
        let note = sanitize_note_name(note)?;
        Ok(self.root.join(project).join(format!("{note}.md")))
    }
}

fn sanitize_note_name(value: &str) -> io::Result<String> {
    let without_extension = value
        .trim()
        .strip_suffix(".md")
        .or_else(|| value.trim().strip_suffix(".MD"))
        .unwrap_or(value.trim());
    sanitize_name(without_extension)
}

fn sanitize_name(value: &str) -> io::Result<String> {
    let mut sanitized = String::with_capacity(value.len());
    let mut previous_was_separator = false;

    for character in value.trim().chars() {
        let allowed = character.is_alphanumeric() || matches!(character, '-' | '_' | ' ');
        if allowed {
            sanitized.push(character);
            previous_was_separator = false;
        } else if !previous_was_separator {
            sanitized.push('-');
            previous_was_separator = true;
        }
    }

    let sanitized = sanitized
        .trim_matches(|character: char| character == '-' || character == ' ' || character == '.')
        .trim()
        .to_string();

    if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "el nombre debe contener letras o números",
        ));
    }

    Ok(sanitized)
}

fn format_capture(capture: &CaptureRequest, captured_at: DateTime<Local>) -> String {
    let youtube_id = youtube_video_id(&capture.url);
    let timestamp = capture
        .youtube_timestamp
        .filter(|value| value.is_finite())
        .map(|seconds| seconds.max(0.0).floor() as u64);
    let display_url = youtube_id
        .as_ref()
        .map(|video_id| youtube_url(video_id, timestamp))
        .unwrap_or_else(|| capture.url.trim().to_string());
    let mut markdown = format!("## Captura - {}\n\n", captured_at.format("%Y-%m-%d %H:%M"),);

    if let Some(video_id) = &youtube_id {
        markdown.push_str(&format!(
            "[![{}](https://img.youtube.com/vi/{video_id}/hqdefault.jpg)]({display_url})\n\n",
            escape_markdown_alt(capture.title.trim())
        ));
    }

    markdown.push_str(&format!(
        "**Título:** {}  \n**URL:** {}  \n",
        capture.title.trim(),
        display_url
    ));

    if youtube_id.is_some() {
        markdown.push_str("**Origen:** YouTube  \n");
    } else if let Some(domain) = link_domain(&capture.url) {
        markdown.push_str(&format!("**Dominio:** {domain}  \n"));
    }

    if let Some(seconds) = timestamp {
        markdown.push_str(&format!(
            "**Timestamp:** {}  \n",
            format_timestamp(seconds as f64)
        ));
    }

    if let Some(selected_text) = non_empty(capture.selected_text.as_deref()) {
        let quoted = selected_text
            .lines()
            .map(|line| format!("> {line}"))
            .collect::<Vec<_>>()
            .join("\n");
        markdown.push_str(&format!("\n### Texto seleccionado\n\n{quoted}\n"));
    }

    if let Some(comment) = non_empty(capture.comment.as_deref()) {
        markdown.push_str(&format!("\n### Comentario\n\n{}\n", comment.trim()));
    }

    markdown.push_str("\n---\n");
    markdown
}

fn markdown_title(content: &str) -> Option<&str> {
    content
        .lines()
        .next()
        .and_then(|line| line.strip_prefix("# "))
        .map(str::trim)
        .filter(|title| !title.is_empty())
}

fn youtube_video_id(value: &str) -> Option<String> {
    let url = url::Url::parse(value).ok()?;
    let host = url.host_str()?.trim_start_matches("www.");
    let id = match host {
        "youtu.be" => url.path_segments()?.next()?.to_string(),
        "youtube.com" | "m.youtube.com" => {
            let mut segments = url.path_segments()?;
            match segments.next() {
                Some("watch") => url
                    .query_pairs()
                    .find(|(key, _)| key == "v")
                    .map(|(_, value)| value.into_owned())?,
                Some("shorts") => segments.next()?.to_string(),
                _ => return None,
            }
        }
        _ => return None,
    };
    valid_youtube_id(&id).then_some(id)
}

fn valid_youtube_id(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn youtube_url(video_id: &str, timestamp: Option<u64>) -> String {
    let mut url = format!("https://youtube.com/watch?v={video_id}");
    if let Some(seconds) = timestamp {
        url.push_str(&format!("&t={seconds}s"));
    }
    url
}

fn link_domain(value: &str) -> Option<String> {
    url::Url::parse(value)
        .ok()?
        .host_str()
        .map(|host| host.trim_start_matches("www.").to_string())
}

fn escape_markdown_alt(value: &str) -> String {
    value.replace(['[', ']'], "")
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.filter(|text| !text.trim().is_empty())
}

fn format_timestamp(seconds: f64) -> String {
    let total = seconds.max(0.0).floor() as u64;
    let hours = total / 3600;
    let minutes = (total % 3600) / 60;
    let seconds = total % 60;

    if hours > 0 {
        format!("{hours:02}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes:02}:{seconds:02}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_paths_without_allowing_traversal() {
        assert_eq!(sanitize_name("../../Inbox").unwrap(), "Inbox");
        assert_eq!(sanitize_name("Ideas: 2026").unwrap(), "Ideas- 2026");
        assert!(sanitize_name("..").is_err());
    }

    #[test]
    fn formats_youtube_timestamp() {
        assert_eq!(format_timestamp(83.9), "01:23");
        assert_eq!(format_timestamp(3_661.0), "01:01:01");
    }

    #[test]
    fn creates_and_reads_markdown_files() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(temp.path().join("Loquera")).unwrap();

        let project = storage.create_project("Inbox").unwrap();
        let note = storage
            .create_note(&project, "Primera nota", "# Hola")
            .unwrap();

        assert_eq!(storage.read_note(&project, &note).unwrap(), "# Hola");
        assert_eq!(storage.list_projects().unwrap(), vec!["Inbox"]);
        assert_eq!(storage.list_notes(&project).unwrap(), vec!["Primera nota"]);
    }

    #[test]
    fn save_renames_note_from_first_heading() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(temp.path().join("Loquera")).unwrap();
        storage
            .create_note("Ideas", "Anterior", "# Anterior")
            .unwrap();

        let result = storage
            .save_note("Ideas", "Anterior", "# Nueva Idea\n\nContenido")
            .unwrap();

        assert!(result.renamed);
        assert_eq!(result.note, "Nueva Idea");
        assert_eq!(
            storage.read_note("Ideas", "Nueva Idea").unwrap(),
            "# Nueva Idea\n\nContenido"
        );
    }

    #[test]
    fn deletes_renames_and_moves_notes_safely() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(temp.path().join("Loquera")).unwrap();
        storage.create_note("Ideas", "Uno", "# Uno").unwrap();
        let renamed = storage.rename_note("Ideas", "Uno", "Dos").unwrap();
        assert_eq!(renamed, "Dos");

        storage.create_project("Archivo").unwrap();
        let moved = storage.move_note("Ideas", "Dos", "Archivo", false).unwrap();
        assert_eq!(moved.to_project, "Archivo");
        storage.delete_note("Archivo", "Dos").unwrap();
        assert!(storage.list_notes("Archivo").unwrap().is_empty());
    }

    #[test]
    fn enriches_youtube_capture_with_clickable_thumbnail() {
        let capture = CaptureRequest {
            project: "Inbox".into(),
            note: "Capturas".into(),
            title: "Video".into(),
            url: "https://youtu.be/dQw4w9WgXcQ".into(),
            selected_text: None,
            comment: None,
            youtube_timestamp: Some(123.0),
        };
        let markdown = format_capture(&capture, Local::now());
        assert!(markdown.contains("img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"));
        assert!(markdown.contains("watch?v=dQw4w9WgXcQ&t=123s"));
        assert!(markdown.contains("**Origen:** YouTube"));
        assert!(markdown.contains("**Timestamp:** 02:03"));
    }

    #[test]
    fn recognizes_supported_youtube_url_shapes() {
        assert_eq!(
            youtube_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".into())
        );
        assert_eq!(
            youtube_video_id("https://youtube.com/shorts/dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".into())
        );
        assert_eq!(
            youtube_video_id("https://example.com/watch?v=dQw4w9WgXcQ"),
            None
        );
    }

    #[test]
    fn save_keeps_current_file_when_heading_name_conflicts() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(temp.path().join("Loquera")).unwrap();
        storage.create_note("Ideas", "Actual", "# Actual").unwrap();
        storage.create_note("Ideas", "Existe", "# Existe").unwrap();

        let result = storage
            .save_note("Ideas", "Actual", "# Existe\n\nNuevo contenido")
            .unwrap();

        assert!(!result.renamed);
        assert!(result.warning.is_some());
        assert_eq!(
            storage.read_note("Ideas", "Actual").unwrap(),
            "# Existe\n\nNuevo contenido"
        );
        assert_eq!(storage.read_note("Ideas", "Existe").unwrap(), "# Existe");
    }
}
