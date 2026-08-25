import { api } from "./lib/api";

type CommunitySnapshot = {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  visibility?: "public" | "private";
};

const communityCache = new Map<string, CommunitySnapshot>();
let canAdmin = false;
let enhanceQueued = false;

function normalize(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function cacheBootstrap(payload: any) {
  if (!payload || typeof payload !== "object") return;
  if (typeof payload.canAdmin === "boolean") canAdmin = payload.canAdmin;
  const communities = [
    ...(Array.isArray(payload.communities) ? payload.communities : []),
    ...(Array.isArray(payload.allCompanyCommunities) ? payload.allCompanyCommunities : []),
  ];
  communities.forEach((community: CommunitySnapshot) => {
    if (community?.id) communityCache.set(community.id, community);
  });
}

const previousFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  let rawUrl = "";
  if (typeof input === "string") rawUrl = input;
  else if (input instanceof URL) rawUrl = input.toString();
  else rawUrl = input.url;

  let nextInit = init;
  try {
    const url = new URL(rawUrl, location.origin);
    if (url.pathname === "/api/media/upload" && init?.body instanceof Blob) {
      const scope = url.searchParams.get("scope") || "";
      if (scope !== "avatar") {
        const optimized = await optimizeUpload(init.body, String(new Headers(init.headers).get("X-File-Name") || "arquivo"));
        if (optimized !== init.body) {
          const headers = new Headers(init.headers);
          headers.set("Content-Type", optimized.type || "application/octet-stream");
          if (optimized instanceof File) headers.set("X-File-Name", optimized.name);
          nextInit = { ...init, body: optimized, headers };
        }
      }
    }
  } catch (error) {
    if (error instanceof Error) throw error;
  }

  const response = await previousFetch(input, nextInit);
  if (response.ok) {
    try {
      const url = new URL(rawUrl, location.origin);
      if (url.pathname === "/api/bootstrap") {
        void response.clone().json().then(cacheBootstrap).catch(() => {});
      }
    } catch {}
  }
  return response;
}) as typeof window.fetch;

async function optimizeUpload(blob: Blob, originalName: string): Promise<Blob> {
  const type = String(blob.type || "").toLowerCase();
  if (type.startsWith("image/")) return compressImage(blob, originalName);
  if (type.startsWith("video/")) return optimizeVideo(blob, originalName);
  return blob;
}

function fileNameBase(name: string) {
  return String(name || "arquivo").replace(/\.[^.]+$/, "") || "arquivo";
}

async function compressImage(blob: Blob, originalName: string): Promise<Blob> {
  if (blob.size < 350 * 1024) return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const maxEdge = 1920;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!result || result.size >= blob.size) return blob;
    return new File([result], `${fileNameBase(originalName)}.webp`, { type: "image/webp", lastModified: Date.now() });
  } catch {
    if (blob.size > 20 * 1024 * 1024) throw new Error("A foto é grande demais. Escolha uma imagem de até 20 MB.");
    return blob;
  }
}

function recorderMimeType() {
  if (!("MediaRecorder" in window)) return "";
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function optimizeVideo(blob: Blob, originalName: string): Promise<Blob> {
  const hardLimit = 20 * 1024 * 1024;
  if (blob.size <= 8 * 1024 * 1024) return blob;

  const type = String(blob.type || "").toLowerCase();
  if (!["video/mp4", "video/webm", "video/quicktime"].includes(type)) {
    throw new Error("Use vídeo MP4, WebM ou MOV.");
  }

  const mimeType = recorderMimeType();
  const captureSupported = "captureStream" in HTMLMediaElement.prototype && "captureStream" in HTMLCanvasElement.prototype;
  if (!mimeType || !captureSupported) {
    if (blob.size > hardLimit) throw new Error("Neste navegador, envie vídeos de até 20 MB. Em navegadores compatíveis o Uorqui otimiza vídeos maiores automaticamente.");
    return blob;
  }

  try {
    const compressed = await transcodeVideo(blob, originalName, mimeType);
    if (compressed.size <= hardLimit && compressed.size < blob.size) return compressed;
    if (blob.size <= hardLimit) return blob;
    throw new Error("O vídeo continua acima de 20 MB depois da otimização. Reduza a duração ou resolução.");
  } catch (error) {
    if (blob.size <= hardLimit) return blob;
    throw error instanceof Error ? error : new Error("Não foi possível otimizar este vídeo.");
  }
}

async function transcodeVideo(blob: Blob, originalName: string, mimeType: string): Promise<File> {
  const sourceUrl = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.src = sourceUrl;
  video.playsInline = true;
  video.muted = true;
  video.preload = "metadata";

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Não foi possível ler o vídeo."));
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("Vídeo inválido.");
    if (video.duration > 180) throw new Error("Para manter o armazenamento controlado, envie vídeos de até 3 minutos.");

    const maxWidth = 1280;
    const maxHeight = 720;
    const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth), maxHeight / Math.max(1, video.videoHeight));
    const width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
    const height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("O navegador não conseguiu preparar a otimização do vídeo.");

    const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(24);
    const sourceStream = (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream();
    const mixed = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...sourceStream.getAudioTracks(),
    ]);
    const recorder = new MediaRecorder(mixed, { mimeType, videoBitsPerSecond: 1_600_000, audioBitsPerSecond: 96_000 });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("Falha ao compactar o vídeo."));
    });

    let frame = 0;
    const draw = () => {
      if (!video.ended && !video.paused) {
        ctx.drawImage(video, 0, 0, width, height);
        frame = requestAnimationFrame(draw);
      }
    };

    recorder.start(1000);
    await video.play();
    draw();
    await new Promise<void>((resolve) => { video.onended = () => resolve(); });
    cancelAnimationFrame(frame);
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;
    mixed.getTracks().forEach((track) => track.stop());
    const result = new Blob(chunks, { type: mimeType.split(";")[0] || "video/webm" });
    return new File([result], `${fileNameBase(originalName)}.webm`, { type: result.type || "video/webm", lastModified: Date.now() });
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
}

function showToast(message: string) {
  document.querySelector(".uorqui-media-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "uorqui-media-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

function enhanceComposer() {
  document.querySelectorAll<HTMLFormElement>(".composer-form").forEach((form) => {
    const input = form.querySelector<HTMLInputElement>(".file-button input[type=file]");
    if (input) {
      input.accept = "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";
      const label = input.closest<HTMLLabelElement>(".file-button");
      if (label && !label.dataset.uorquiMediaLabel) {
        label.dataset.uorquiMediaLabel = "1";
        const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
        if (textNode) textNode.textContent = " Fotos e vídeos";
      }
    }

    if (form.dataset.uorquiPreferredScope) return;
    form.dataset.uorquiPreferredScope = "1";
    const audienceButtons = Array.from(form.querySelectorAll<HTMLButtonElement>(".audience-row button"));
    const community = audienceButtons.find((button) => normalize(button.textContent || "").includes("comunidade"));
    if (community && !community.disabled && !community.classList.contains("selected")) {
      queueMicrotask(() => community.click());
    }
  });
}

function isVideoName(name: string) {
  return /\.(mp4|webm|mov|m4v)$/i.test(name.trim());
}

function enhanceVideoCards() {
  document.querySelectorAll<HTMLElement>(".post-file").forEach((card) => {
    if (card.dataset.uorquiVideo === "1") return;
    const name = card.querySelector("strong")?.textContent || "";
    if (!isVideoName(name)) return;
    const link = card.querySelector<HTMLAnchorElement>("a.post-file-download[href]");
    if (!link?.href) return;

    const wrap = document.createElement("div");
    wrap.className = "post-video-wrap";
    wrap.dataset.uorquiVideo = "1";
    const video = document.createElement("video");
    video.className = "uorqui-post-video";
    video.src = link.href;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("controlsList", "nodownload");
    wrap.appendChild(video);
    const caption = document.createElement("small");
    caption.className = "uorqui-video-name";
    caption.textContent = name;
    wrap.appendChild(caption);
    card.replaceWith(wrap);
  });
}

function enhanceGalleries() {
  document.querySelectorAll<HTMLElement>(".post-attachments").forEach((container) => {
    const media = Array.from(container.children).filter((child) =>
      child.classList.contains("post-image-wrap") || child.classList.contains("post-video-wrap"),
    );
    container.classList.toggle("uorqui-media-gallery", media.length > 1 && media.length === container.children.length);
    if (media.length > 1) container.dataset.mediaCount = String(media.length);
  });
}

function mediaFromContainer(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img.post-image, video.uorqui-post-video"))
    .map((element) => ({
      type: element instanceof HTMLVideoElement ? "video" : "image",
      src: element instanceof HTMLVideoElement ? element.currentSrc || element.src : element.src,
    }))
    .filter((item) => item.src);
}

function openLightbox(container: HTMLElement, source: Element) {
  const media = mediaFromContainer(container);
  if (!media.length) return;
  const sources = Array.from(container.querySelectorAll("img.post-image, video.uorqui-post-video"));
  let index = Math.max(0, sources.indexOf(source));

  const overlay = document.createElement("div");
  overlay.className = "uorqui-media-lightbox";
  overlay.innerHTML = `
    <button class="uorqui-lightbox-close" type="button" aria-label="Fechar">×</button>
    <button class="uorqui-lightbox-prev" type="button" aria-label="Anterior">‹</button>
    <div class="uorqui-lightbox-stage"></div>
    <button class="uorqui-lightbox-next" type="button" aria-label="Próxima">›</button>
    <div class="uorqui-lightbox-counter"></div>`;
  document.body.appendChild(overlay);

  const stage = overlay.querySelector<HTMLElement>(".uorqui-lightbox-stage")!;
  const counter = overlay.querySelector<HTMLElement>(".uorqui-lightbox-counter")!;
  const render = () => {
    stage.innerHTML = "";
    const item = media[index];
    if (item.type === "video") {
      const video = document.createElement("video");
      video.src = item.src;
      video.controls = true;
      video.playsInline = true;
      video.autoplay = true;
      stage.appendChild(video);
    } else {
      const image = document.createElement("img");
      image.src = item.src;
      image.alt = "Mídia da publicação";
      stage.appendChild(image);
    }
    counter.textContent = media.length > 1 ? `${index + 1} / ${media.length}` : "";
    overlay.querySelector<HTMLButtonElement>(".uorqui-lightbox-prev")!.hidden = media.length < 2;
    overlay.querySelector<HTMLButtonElement>(".uorqui-lightbox-next")!.hidden = media.length < 2;
  };
  const close = () => overlay.remove();
  const move = (delta: number) => { index = (index + delta + media.length) % media.length; render(); };
  overlay.querySelector(".uorqui-lightbox-close")?.addEventListener("click", close);
  overlay.querySelector(".uorqui-lightbox-prev")?.addEventListener("click", () => move(-1));
  overlay.querySelector(".uorqui-lightbox-next")?.addEventListener("click", () => move(1));
  overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
  document.addEventListener("keydown", function key(event) {
    if (!overlay.isConnected) return document.removeEventListener("keydown", key);
    if (event.key === "Escape") close();
    if (event.key === "ArrowLeft" && media.length > 1) move(-1);
    if (event.key === "ArrowRight" && media.length > 1) move(1);
  });
  render();
}

document.addEventListener("click", (event) => {
  const target = event.target as Element | null;
  const image = target?.closest<HTMLImageElement>("img.post-image");
  if (image) {
    const container = image.closest<HTMLElement>(".post-attachments");
    if (container) {
      event.preventDefault();
      openLightbox(container, image);
    }
  }
});

function findCommunityByName(name: string) {
  const normalized = normalize(name);
  const matches = Array.from(communityCache.values()).filter((community) => normalize(community.name) === normalized);
  return matches.length === 1 ? matches[0] : null;
}

function openCommunityEditor(community: CommunitySnapshot) {
  document.querySelector(".uorqui-community-edit-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "uorqui-community-edit-backdrop";
  backdrop.innerHTML = `
    <section class="uorqui-community-edit-modal">
      <div class="uorqui-community-edit-head"><h3>Editar comunidade</h3><button type="button" data-close aria-label="Fechar">×</button></div>
      <form>
        <label><span>Nome</span><input name="name" maxlength="90" required></label>
        <label><span>Descrição</span><textarea name="description" maxlength="280" rows="4" placeholder="Que assuntos ficam nesta comunidade?"></textarea></label>
        <div class="uorqui-community-edit-actions"><button type="button" class="secondary" data-cancel>Cancelar</button><button type="submit" class="primary">Salvar alterações</button></div>
      </form>
    </section>`;
  const form = backdrop.querySelector<HTMLFormElement>("form")!;
  form.querySelector<HTMLInputElement>("[name=name]")!.value = community.name || "";
  form.querySelector<HTMLTextAreaElement>("[name=description]")!.value = community.description || "";
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector("[data-close]")?.addEventListener("click", close);
  backdrop.querySelector("[data-cancel]")?.addEventListener("click", close);
  backdrop.addEventListener("mousedown", (event) => { if (event.target === backdrop) close(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    submit.disabled = true;
    submit.textContent = "Salvando…";
    try {
      const result = await api<{ community: CommunitySnapshot }>(`/communities/${encodeURIComponent(community.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.querySelector<HTMLInputElement>("[name=name]")!.value.trim(),
          description: form.querySelector<HTMLTextAreaElement>("[name=description]")!.value.trim(),
        }),
      });
      communityCache.set(result.community.id, result.community);
      close();
      showToast("Comunidade atualizada.");
    } catch (error) {
      submit.disabled = false;
      submit.textContent = "Salvar alterações";
      showToast(error instanceof Error ? error.message : "Não foi possível editar a comunidade.");
    }
  });
}

function enhanceCommunityEditors() {
  if (!canAdmin) return;

  document.querySelectorAll<HTMLElement>(".community-detail-head").forEach((head) => {
    if (head.querySelector(".uorqui-community-edit-button")) return;
    const name = head.querySelector(".community-detail-title h2")?.textContent || "";
    const community = findCommunityByName(name);
    if (!community) return;
    const actions = head.querySelector<HTMLElement>(".community-detail-actions");
    if (!actions) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn secondary uorqui-community-edit-button";
    button.textContent = "Editar comunidade";
    button.addEventListener("click", () => openCommunityEditor(community));
    actions.prepend(button);
  });

  document.querySelectorAll<HTMLElement>(".admin-community-row").forEach((row) => {
    if (row.querySelector(".uorqui-community-edit-button")) return;
    const name = row.querySelector(".ellipsis strong")?.textContent || "";
    const community = findCommunityByName(name);
    const actions = row.querySelector<HTMLElement>(".admin-community-actions");
    if (!community || !actions) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn secondary small uorqui-community-edit-button";
    button.textContent = "Editar";
    button.addEventListener("click", () => openCommunityEditor(community));
    actions.prepend(button);
  });
}

function enhance() {
  enhanceQueued = false;
  enhanceComposer();
  enhanceVideoCards();
  enhanceGalleries();
  enhanceCommunityEditors();
}

function queueEnhance() {
  if (enhanceQueued) return;
  enhanceQueued = true;
  requestAnimationFrame(enhance);
}

const observer = new MutationObserver(queueEnhance);
observer.observe(document.documentElement, { childList: true, subtree: true });
queueEnhance();
