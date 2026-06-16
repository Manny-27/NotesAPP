const API = "http://127.0.0.1:3210/api";
const state = { tab: null, page: {}, projects: [] };

const $ = (selector) => document.querySelector(selector);
const statusElement = $("#status");

function setStatus(message, error = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

async function request(path, init) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error(
      "No se pudo conectar con Loquera. Abre la app de escritorio e intenta de nuevo.",
    );
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Error ${response.status}`);
  return result;
}

const segment = (value) => encodeURIComponent(value);

function youtubeId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/")[1] || null;
    if (!["youtube.com", "m.youtube.com"].includes(host)) return null;
    if (url.pathname === "/watch") return url.searchParams.get("v");
    if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2];
  } catch {}
  return null;
}

function formatTime(value) {
  const total = Math.max(0, Math.floor(value || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function readPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error("No se pudo acceder a la pestaña activa.");
  const injection = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
  state.tab = tab;
  state.page = injection[0]?.result ?? {};

  const id = youtubeId(tab.url);
  $("#page-title").textContent = tab.title || "Página sin título";
  $("#page-url").textContent = tab.url;
  if (id) {
    $("#source").textContent = "YouTube";
    $("#thumbnail").src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    $("#thumbnail").hidden = false;
    if (state.page.youtubeTimestamp != null) {
      $("#timestamp").textContent = `Timestamp ${formatTime(state.page.youtubeTimestamp)}`;
      $("#timestamp").hidden = false;
    }
  }
  {
    const id = state.page.youtubeVideoId || youtubeId(tab.url);
    $("#page-title").textContent = state.page.title || tab.title || "Página sin título";
    $("#page-url").textContent = state.page.description || state.page.canonicalUrl || tab.url;
    $("#source").textContent = state.page.siteName || state.page.domain || "Página web";
    $("#thumbnail").hidden = true;
    $("#timestamp").hidden = true;
    if (id) {
      $("#source").textContent = "YouTube";
      $("#thumbnail").src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
      $("#thumbnail").hidden = false;
      if (state.page.youtubeTimestamp != null) {
        $("#timestamp").textContent = `Timestamp ${formatTime(state.page.youtubeTimestamp)}`;
        $("#timestamp").hidden = false;
      }
    } else if (state.page.imageUrl) {
      $("#thumbnail").src = state.page.imageUrl;
      $("#thumbnail").hidden = false;
    }
  }
  updatePreview();
}

function fillProjectSelect(select, preferred = "Inbox") {
  select.innerHTML = "";
  state.projects.forEach((project) => {
    const option = new Option(project, project);
    select.add(option);
  });
  if (state.projects.includes(preferred)) select.value = preferred;
}

async function loadNotes(project, select, preferred = "Capturas") {
  const { notes } = await request(`/projects/${segment(project)}/notes`);
  select.innerHTML = "";
  notes.forEach((note) => select.add(new Option(note, note)));
  select.add(new Option("+ Crear nota nueva", "__new__"));
  if (notes.includes(preferred)) select.value = preferred;
  toggleNewNote(select);
}

async function loadBoards(project, select, preferred = "Recursos") {
  const { boards } = await request(`/projects/${segment(project)}/boards`);
  select.innerHTML = "";
  boards.forEach((board) => select.add(new Option(board, board)));
  select.add(new Option("+ Crear pizarra nueva", "__new__"));
  if (boards.includes(preferred)) select.value = preferred;
  toggleNewBoard(select);
}

function toggleNewNote(select) {
  const prefix = select.id === "send-note" ? "send" : "quick";
  $(`#${prefix}-new-wrap`).classList.toggle("visible", select.value === "__new__");
}

function toggleNewBoard(select) {
  $("#board-new-wrap").classList.toggle("visible", select.value === "__new__");
}

async function loadLibrary() {
  const { projects } = await request("/projects");
  state.projects = projects;
  if (!projects.includes("Inbox")) {
    await request("/projects", {
      method: "POST",
      body: JSON.stringify({ name: "Inbox" }),
    });
    state.projects.push("Inbox");
    state.projects.sort();
  }
  for (const id of ["send-project", "quick-project", "board-project"]) {
    fillProjectSelect($(`#${id}`));
  }
  await Promise.all([
    loadNotes($("#send-project").value, $("#send-note")),
    loadNotes($("#quick-project").value, $("#quick-note")),
    loadBoards($("#board-project").value, $("#board-select")),
  ]);
  $("#connection").classList.add("online");
  $("#connection b").textContent = "Conectado";
}

function capturePayload(project, note, comment = null) {
  return {
    project,
    note,
    title: state.tab?.title || "Página sin título",
    url: state.tab?.url || "",
    selectedText: state.page.selectedText ?? null,
    comment: comment || null,
    youtubeTimestamp: state.page.youtubeTimestamp ?? null,
    title: state.page.title || state.tab?.title || "Página sin título",
    url: state.page.url || state.tab?.url || "",
    description: state.page.description ?? null,
    canonicalUrl: state.page.canonicalUrl ?? null,
    domain: state.page.domain ?? null,
    siteName: state.page.siteName ?? null,
    imageUrl: state.page.imageUrl ?? null,
    faviconUrl: state.page.faviconUrl ?? null,
    youtubeVideoId: state.page.youtubeVideoId ?? youtubeId(state.tab?.url || ""),
  };
}

async function ensureNewNote(project, select, input) {
  if (select.value !== "__new__") return select.value;
  const title = input.value.trim();
  if (!title) throw new Error("Escribe un nombre para la nueva nota.");
  const result = await request(`/projects/${segment(project)}/notes`, {
    method: "POST",
    body: JSON.stringify({ title, content: `# ${title}\n\n` }),
  });
  return result.note;
}

async function ensureNewBoard(project, select, input) {
  if (select.value !== "__new__") return select.value;
  const title = input.value.trim();
  if (!title) throw new Error("Escribe un nombre para la nueva pizarra.");
  const result = await request(`/projects/${segment(project)}/boards`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  return result.board;
}

function boardYoutubeItem(comment = "") {
  const url = state.tab?.url || "";
  const videoId = youtubeId(url);
  if (!videoId) throw new Error("La pestaña actual no parece ser un video de YouTube.");
  const timestamp = state.page.youtubeTimestamp ?? null;
  const canonical = timestamp
    ? `https://youtube.com/watch?v=${videoId}&t=${Math.floor(timestamp)}s`
    : `https://youtube.com/watch?v=${videoId}`;
  return {
    id: `item_${crypto.randomUUID()}`,
    kind: "youtube",
    x: 120,
    y: 80,
    width: 420,
    height: 340,
    title: state.tab?.title || "Video de YouTube",
    url: canonical,
    videoId,
    timestamp,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    note: comment || "",
  };
}

function boardCaptureItem(comment = "") {
  const url = state.page.canonicalUrl || state.page.url || state.tab?.url || "";
  const videoId = state.page.youtubeVideoId || youtubeId(url);
  const timestamp = state.page.youtubeTimestamp ?? null;
  const canonical = videoId && timestamp
    ? `https://youtube.com/watch?v=${videoId}&t=${Math.floor(timestamp)}s`
    : videoId
      ? `https://youtube.com/watch?v=${videoId}`
      : url;
  return {
    id: `item_${crypto.randomUUID()}`,
    kind: videoId ? "youtube" : "link",
    x: 120,
    y: 80,
    width: 420,
    height: videoId ? 340 : 280,
    pinned: false,
    title: state.page.title || state.tab?.title || "Enlace",
    description: state.page.description ?? null,
    url: canonical,
    canonicalUrl: canonical,
    domain: state.page.domain ?? null,
    siteName: state.page.siteName ?? null,
    imageUrl: state.page.imageUrl ?? null,
    faviconUrl: state.page.faviconUrl ?? null,
    selectedText: state.page.selectedText ?? null,
    videoId: videoId || null,
    timestamp,
    thumbnailUrl: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null,
    note: comment || "",
  };
}

async function saveCapture(project, note, comment) {
  await request("/capture", {
    method: "POST",
    body: JSON.stringify(capturePayload(project, note, comment)),
  });
  setStatus(`Captura guardada en ${project} / ${note}.`);
}

function updatePreview() {
  const selected = state.page.selectedText;
  const comment = $("#send-comment").value.trim();
  const parts = [
    youtubeId(state.tab?.url || "") ? "Miniatura y enlace de YouTube" : "Título, URL y dominio",
    selected ? "texto seleccionado" : null,
    comment ? "comentario" : null,
  ].filter(Boolean);
  $("#capture-preview").textContent = `Se guardará: ${parts.join(", ")}.`;
}

document.querySelectorAll(".tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".mode").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    $(`#${button.dataset.mode}-mode`).classList.add("active");
  });
});

$("#send-project").addEventListener("change", (event) =>
  loadNotes(event.target.value, $("#send-note")).catch((error) =>
    setStatus(error.message, true),
  ),
);
$("#quick-project").addEventListener("change", (event) =>
  loadNotes(event.target.value, $("#quick-note")).catch((error) =>
    setStatus(error.message, true),
  ),
);
$("#board-project").addEventListener("change", (event) =>
  loadBoards(event.target.value, $("#board-select")).catch((error) =>
    setStatus(error.message, true),
  ),
);
$("#send-note").addEventListener("change", (event) => toggleNewNote(event.target));
$("#quick-note").addEventListener("change", (event) => toggleNewNote(event.target));
$("#board-select").addEventListener("change", (event) => toggleNewBoard(event.target));
$("#send-comment").addEventListener("input", updatePreview);

$("#quick-capture").addEventListener("click", async (event) => {
  event.target.disabled = true;
  try {
    await saveCapture("Inbox", "Capturas", null);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    event.target.disabled = false;
  }
});

$("#send-capture").addEventListener("click", async (event) => {
  event.target.disabled = true;
  try {
    const project = $("#send-project").value;
    const note = await ensureNewNote(project, $("#send-note"), $("#send-new-note"));
    await saveCapture(project, note, $("#send-comment").value.trim());
    $("#send-comment").value = "";
    updatePreview();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    event.target.disabled = false;
  }
});

$("#save-quick-note").addEventListener("click", async (event) => {
  event.target.disabled = true;
  try {
    const project = $("#quick-project").value;
    const note = await ensureNewNote(project, $("#quick-note"), $("#quick-new-note"));
    const text = $("#quick-text").value.trim();
    if (!text) throw new Error("Escribe una idea antes de guardar.");
    const current = await request(
      `/projects/${segment(project)}/notes/${segment(note)}`,
    );
    const stamp = new Date().toLocaleString();
    const content = `${current.content.trimEnd()}\n\n## Nota rápida - ${stamp}\n\n${text}\n`;
    await request(`/projects/${segment(project)}/notes/${segment(note)}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
    $("#quick-text").value = "";
    setStatus(`Nota rápida guardada en ${project} / ${note}.`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    event.target.disabled = false;
  }
});

$("#send-board").addEventListener("click", async (event) => {
  event.target.disabled = true;
  try {
    const project = $("#board-project").value;
    const board = await ensureNewBoard(project, $("#board-select"), $("#board-new"));
    await request(`/projects/${segment(project)}/boards/${segment(board)}/items`, {
      method: "POST",
      body: JSON.stringify({
        item: boardCaptureItem($("#board-note").value.trim()),
      }),
    });
    $("#board-note").value = "";
    setStatus(`Video enviado a ${project} / ${board}.`);
    await loadBoards(project, $("#board-select"), board);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    event.target.disabled = false;
  }
});

$("#copy-url").addEventListener("click", async () => {
  await navigator.clipboard.writeText(state.tab?.url || "");
  setStatus("URL copiada.");
});

Promise.all([readPage(), loadLibrary()]).catch((error) => {
  $("#connection b").textContent = "Sin conexión";
  setStatus(error.message, true);
});
