const form = document.querySelector("#capture-form");
const submitButton = document.querySelector("#submit");
const statusElement = document.querySelector("#status");

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  setStatus("Leyendo la pestaña...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) {
      throw new Error("No se pudo acceder a la pestaña activa.");
    }

    const injection = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    const pageData = injection[0]?.result ?? {};

    const response = await fetch("http://localhost:3210/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: document.querySelector("#project").value,
        note: document.querySelector("#note").value,
        title: tab.title || "Página sin título",
        url: tab.url,
        selectedText: pageData.selectedText ?? null,
        comment: document.querySelector("#comment").value || null,
        youtubeTimestamp: pageData.youtubeTimestamp ?? null,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `El servidor respondió ${response.status}.`);
    }

    setStatus("Captura guardada. Ya puedes cerrar este popup.");
    document.querySelector("#comment").value = "";
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo guardar la captura.";
    setStatus(
      `${message} Comprueba que Loquera esté abierta y vuelve a intentar.`,
      true,
    );
  } finally {
    submitButton.disabled = false;
  }
});
