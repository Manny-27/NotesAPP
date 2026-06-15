use chrono::{DateTime, Local};
use serde::Deserialize;
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

    pub fn save_note(&self, project: &str, note: &str, content: &str) -> io::Result<()> {
        let project = self.create_project(project)?;
        let note = sanitize_note_name(note)?;
        fs::write(self.root.join(project).join(format!("{note}.md")), content)
    }

    pub fn append_capture(&self, capture: &CaptureRequest) -> io::Result<()> {
        let project = self.create_project(&capture.project)?;
        let note = sanitize_note_name(&capture.note)?;
        let path = self.root.join(project).join(format!("{note}.md"));
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
        file.write_all(block.as_bytes())
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
    let mut markdown = format!(
        "## Captura - {}\n\n**Título:** {}  \n**URL:** {}  \n",
        captured_at.format("%Y-%m-%d %H:%M"),
        capture.title.trim(),
        capture.url.trim()
    );

    if let Some(seconds) = capture.youtube_timestamp.filter(|value| value.is_finite()) {
        markdown.push_str(&format!(
            "**YouTube timestamp:** {}  \n",
            format_timestamp(seconds)
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
}
