export {};

const BAD_IMAGE_RE = /(?:logo|favicon|brandmark|sprite|avatar|author|perfil|profile|pixel|tracking|doubleclick|google[-_.]?news|googlenews|gnews[-_.]?logo|placeholder|default[-_.]?image|no[-_.]?image|banner|newsletter|advert|publicidade|social[-_.]?share|icon[-_.]?|badge|widget|recommended|related|recomendad)/i;

function safeDecode(value: string) {
  try { return decodeURIComponent(value); }
  catch { return value; }
}

function imageIdentity(value: string) {
  try {
    const url = new URL(value, window.location.origin);

    for (const key of ["url", "src", "image", "img"]) {
      const nested = url.searchParams.get(key);
      if (!nested) continue;
      const decoded = safeDecode(nested);
      if (/^https?:\/\//i.test(decoded) && decoded !== value) return imageIdentity(decoded);
    }

    let path = safeDecode(url.pathname).toLowerCase();
    path = path
      .replace(/[-_](?:\d{2,4})x(?:\d{2,4})(?=\.[a-z0-9]{2,5}$)/gi, "")
      .replace(/[-_](?:w|h)?\d{2,4}(?=\.[a-z0-9]{2,5}$)/gi, "")
      .replace(/\/(?:w|h|width|height)[-_]?\d{2,4}\//gi, "/")
      .replace(/\/\d{2,4}x\d{2,4}\//g, "/");

    const parts = path.split("/").filter(Boolean);
    const file = parts[parts.length - 1] || path;
    const normalizedFile = file
      .replace(/(?:[-_](?:crop|resize|scaled|thumb|thumbnail))+(?=\.[a-z0-9]{2,5}$)/gi, "")
      .replace(/[-_]\d{2,4}(?=\.[a-z0-9]{2,5}$)/gi, "");

    return `${url.hostname.toLowerCase()}|${normalizedFile || path}`;
  } catch {
    return String(value || "").split(/[?#]/)[0].toLowerCase();
  }
}

function isBadNewsImage(value = "") {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    const host = url.hostname.toLowerCase();
    const full = url.toString().toLowerCase();

    if (/\.svg(?:\?|$)/i.test(full)) return true;
    if (BAD_IMAGE_RE.test(full)) return true;
    if (/(?:^|\.)gstatic\.com$/i.test(host)) return true;
    if (/(?:^|\.)googleusercontent\.com$/i.test(host)) return true;
    if (/(?:^|\.)news\.google\./i.test(host)) return true;

    return false;
  } catch {
    return true;
  }
}

function galleryClass(count: number) {
  if (count <= 1) return "one";
  if (count === 2) return "two";
  if (count === 3) return "three";
  return "four";
}

function rebalanceGallery(gallery: HTMLElement) {
  const count = gallery.querySelectorAll(":scope > figure").length;
  gallery.classList.remove("one", "two", "three", "four");
  if (!count) {
    gallery.remove();
    return;
  }
  gallery.classList.add(galleryClass(count));
}

function cleanupGallery(gallery: HTMLElement) {
  const seen = new Set<string>();
  const figures = [...gallery.querySelectorAll<HTMLElement>(":scope > figure")];

  for (const figure of figures) {
    const image = figure.querySelector<HTMLImageElement>("img");
    const src = String(image?.currentSrc || image?.src || "").trim();
    const identity = src ? imageIdentity(src) : "";

    if (!src || isBadNewsImage(src) || !identity || seen.has(identity)) {
      figure.remove();
      continue;
    }
    seen.add(identity);
  }

  rebalanceGallery(gallery);
}

function cleanupNativeCard(card: HTMLElement) {
  const seen = new Set<string>();
  const images = [...card.querySelectorAll<HTMLImageElement>("img")];

  for (const image of images) {
    const src = String(image.currentSrc || image.src || "").trim();
    const identity = src ? imageIdentity(src) : "";

    if (!src || isBadNewsImage(src) || !identity || seen.has(identity)) {
      const figure = image.closest("figure");
      if (figure) figure.remove();
      else image.remove();
      continue;
    }
    seen.add(identity);
  }
}

function cleanupNewsImages(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".uorqui-news-gallery-v126").forEach(cleanupGallery);
  root.querySelectorAll<HTMLElement>(".ai-news-card:not(.uorqui-news-inline-v126)").forEach(cleanupNativeCard);
}

let scheduled = false;
function scheduleCleanup() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    cleanupNewsImages();
  });
}

const observer = new MutationObserver(scheduleCleanup);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("load", scheduleCleanup, { once: true });
scheduleCleanup();
