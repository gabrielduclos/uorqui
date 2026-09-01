export {};

type PreviewState = {
  signature: string;
  urls: string[];
};

const previewState = new Map<HTMLInputElement, PreviewState>();

function fileSignature(files: File[]) {
  return files.map((file) => `${file.name}:${file.size}:${file.lastModified}:${file.type}`).join("|");
}

function revokeState(input: HTMLInputElement) {
  const state = previewState.get(input);
  if (!state) return;
  state.urls.forEach((url) => URL.revokeObjectURL(url));
  previewState.delete(input);
}

function createMediaCard(file: File, url: string) {
  const card = document.createElement("div");
  card.className = "composer-media-thumb";

  if (file.type.startsWith("image/")) {
    const image = document.createElement("img");
    image.src = url;
    image.alt = "Prévia da foto";
    image.loading = "eager";
    card.appendChild(image);
    return card;
  }

  if (file.type.startsWith("video/")) {
    card.classList.add("is-video");
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", "Prévia do vídeo");
    video.addEventListener("loadedmetadata", () => {
      try {
        if (Number.isFinite(video.duration) && video.duration > 0.15) video.currentTime = 0.1;
      } catch {}
    }, { once: true });
    card.appendChild(video);

    const badge = document.createElement("span");
    badge.className = "composer-video-badge";
    badge.textContent = "Vídeo";
    card.appendChild(badge);
    return card;
  }

  card.classList.add("is-file");
  const fileLabel = document.createElement("span");
  fileLabel.textContent = file.name || "Arquivo";
  card.appendChild(fileLabel);
  return card;
}

function syncComposerPreview() {
  const liveInputs = new Set<HTMLInputElement>();

  document.querySelectorAll<HTMLInputElement>('.composer-form input[type="file"]').forEach((input) => {
    liveInputs.add(input);
    const form = input.closest<HTMLFormElement>(".composer-form");
    const label = input.closest<HTMLElement>(".file-button");
    if (!form || !label) return;

    const files = Array.from(input.files || []).slice(0, 5);
    const signature = fileSignature(files);
    let preview = form.querySelector<HTMLElement>(".composer-media-preview-v125");
    const current = previewState.get(input);

    if (!files.length) {
      if (preview) preview.remove();
      if (current) revokeState(input);
      return;
    }

    if (current?.signature === signature && preview) return;

    revokeState(input);
    if (preview) preview.remove();

    preview = document.createElement("div");
    preview.className = "composer-media-preview-v125";
    preview.setAttribute("aria-label", "Prévia das mídias selecionadas");

    const urls: string[] = [];
    for (const file of files) {
      if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
        const url = URL.createObjectURL(file);
        urls.push(url);
        preview.appendChild(createMediaCard(file, url));
      } else {
        preview.appendChild(createMediaCard(file, ""));
      }
    }

    label.insertAdjacentElement("afterend", preview);
    previewState.set(input, { signature, urls });
  });

  for (const input of [...previewState.keys()]) {
    if (!liveInputs.has(input) || !input.isConnected) revokeState(input);
  }

  upgradePublishedVideos();
}

function isVideoName(value = "") {
  return /\.(mp4|webm|mov|m4v|ogv)$/i.test(value.trim());
}

function upgradePublishedVideos() {
  document.querySelectorAll<HTMLElement>(".post-file").forEach((fileCard) => {
    if (fileCard.dataset.uorquiVideoUpgraded === "1") return;
    const title = fileCard.querySelector<HTMLElement>(".post-file-copy strong")?.textContent || "";
    const download = fileCard.querySelector<HTMLAnchorElement>("a.post-file-download");
    const downloadName = download?.getAttribute("download") || "";
    if (!isVideoName(title) && !isVideoName(downloadName)) return;
    if (!download?.href) return;

    const wrap = document.createElement("div");
    wrap.className = "post-video-wrap-v125";
    const video = document.createElement("video");
    video.src = download.href;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", "Vídeo da publicação");
    wrap.appendChild(video);

    fileCard.dataset.uorquiVideoUpgraded = "1";
    fileCard.replaceWith(wrap);
  });
}

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.type !== "file" || !target.closest(".composer-form")) return;
  queueMicrotask(syncComposerPreview);
});

const composerMediaObserver = new MutationObserver(syncComposerPreview);
composerMediaObserver.observe(document.documentElement, { childList: true, subtree: true });
syncComposerPreview();
