(() => {
  function meta(selector) {
    return document.querySelector(selector)?.getAttribute("content")?.trim() || null;
  }

  function resolveUrl(value, base = location.href) {
    if (!value) return null;
    try {
      return new URL(value, base).toString();
    } catch {
      return null;
    }
  }

  function linkHref(selector) {
    return resolveUrl(document.querySelector(selector)?.getAttribute("href"));
  }

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

  const video = document.querySelector("video");
  const canonicalUrl = linkHref('link[rel="canonical"]') || location.href;
  const domain = location.hostname.replace(/^www\./, "");
  const videoId = youtubeId(location.href);
  const image =
    resolveUrl(meta('meta[property="og:image"]')) ||
    resolveUrl(meta('meta[name="twitter:image"]')) ||
    linkHref('link[rel="image_src"]');

  return {
    title:
      document.title ||
      meta('meta[property="og:title"]') ||
      meta('meta[name="twitter:title"]') ||
      domain,
    description:
      meta('meta[name="description"]') ||
      meta('meta[property="og:description"]') ||
      meta('meta[name="twitter:description"]'),
    imageUrl: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : image,
    siteName: meta('meta[property="og:site_name"]'),
    canonicalUrl,
    faviconUrl:
      linkHref('link[rel="icon"]') ||
      linkHref('link[rel="shortcut icon"]') ||
      resolveUrl("/favicon.ico", location.origin),
    selectedText: window.getSelection()?.toString().trim() || null,
    url: location.href,
    domain,
    youtubeVideoId: videoId,
    youtubeTimestamp:
      location.hostname.includes("youtube.com") && video
        ? Number(video.currentTime)
        : null,
  };
})();
