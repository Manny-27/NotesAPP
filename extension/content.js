(() => {
  const video = document.querySelector("video");

  return {
    selectedText: window.getSelection()?.toString().trim() || null,
    youtubeTimestamp:
      location.hostname.includes("youtube.com") && video
        ? Number(video.currentTime)
        : null,
  };
})();
