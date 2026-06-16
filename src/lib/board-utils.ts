import type { BoardDocument, BoardItem } from "../api";

export function createEmptyBoard(title: string): BoardDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    type: "loqboard",
    title,
    createdAt: now,
    updatedAt: now,
    items: [],
    snapshot: undefined,
  };
}

export function youtubeVideoId(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/")[1] || null;
    if (!["youtube.com", "m.youtube.com"].includes(host)) return null;
    if (url.pathname === "/watch") return url.searchParams.get("v");
    if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2];
  } catch {
    return null;
  }
  return null;
}

export function youtubeTimestamp(value: string) {
  try {
    const url = new URL(value);
    const raw = url.searchParams.get("t") || url.searchParams.get("start");
    if (!raw) return null;
    const match = raw.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?/);
    if (!match) return null;
    if (/^\d+$/.test(raw)) return Number(raw);
    const [, hours = "0", minutes = "0", seconds = "0"] = match;
    return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  } catch {
    return null;
  }
}

export function createYoutubeItem(url: string, title = "Video de YouTube"): BoardItem {
  const videoId = youtubeVideoId(url);
  const timestamp = youtubeTimestamp(url);
  return {
    id: `item_${crypto.randomUUID()}`,
    kind: "youtube",
    x: 120,
    y: 90,
    width: 420,
    height: 340,
    pinned: false,
    title,
    url,
    videoId,
    timestamp,
    thumbnailUrl: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null,
    note: "",
  };
}

export function createLinkItem(url: string, title = "Enlace"): BoardItem {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  return {
    id: `item_${crypto.randomUUID()}`,
    kind: "link",
    x: 180,
    y: 140,
    width: 420,
    height: 280,
    pinned: false,
    title,
    url,
    canonicalUrl: url,
    domain: parsed?.hostname.replace(/^www\./, "") || null,
    faviconUrl: parsed ? `${parsed.origin}/favicon.ico` : null,
    note: "",
  };
}

export function createTextItem(): BoardItem {
  return {
    id: `item_${crypto.randomUUID()}`,
    kind: "text",
    x: 580,
    y: 120,
    width: 260,
    height: 160,
    pinned: false,
    text: "Nueva tarjeta",
  };
}

export function createCodeItem(): BoardItem {
  return {
    id: `item_${crypto.randomUUID()}`,
    kind: "code",
    x: 240,
    y: 160,
    width: 520,
    height: 320,
    pinned: false,
    title: "Bloque de código",
    language: "typescript",
    code: "function example() {\n  return true\n}",
  };
}

export function youtubeEmbedUrl(item: BoardItem) {
  if (!item.videoId) return null;
  const start = item.timestamp ? `?start=${Math.floor(item.timestamp)}` : "";
  return `https://www.youtube.com/embed/${item.videoId}${start}`;
}

export function safeHttpUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
