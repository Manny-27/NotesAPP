export async function openExternalUrl(url: string): Promise<void> {
  const safeUrl = safeExternalUrl(url);
  if (!safeUrl) return;

  if ("__TAURI_INTERNALS__" in window) {
    try {
      const dynamicImport = new Function(
        "specifier",
        "return import(specifier)",
      ) as (specifier: string) => Promise<{
        openUrl?: (url: string) => Promise<void>;
      }>;
      const opener = await dynamicImport("@tauri-apps/plugin-opener");
      if (opener.openUrl) {
        await opener.openUrl(safeUrl);
        return;
      }
    } catch {
      // Fall back to the browser behavior when the opener plugin is not present.
    }
  }

  window.open(safeUrl, "_blank", "noopener,noreferrer");
}

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
