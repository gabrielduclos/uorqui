export {};

function isBadNewsImage(value = "") {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    const host = url.hostname.toLowerCase();
    const full = url.toString().toLowerCase();

    if (/\.(?:svg)(?:\?|$)/i.test(full)) return true;
    if (/(?:logo|favicon|sprite|avatar|author|perfil|profile|pixel|tracking|doubleclick|google[-_.]?news|googlenews|gnews[-_.]?logo)/i.test(full)) return true;
    if (/(?:^|\.)gstatic\.com$/i.test(host)) return true;
    if (/(?:^|\.)googleusercontent\.com$/i.test(host)) return true;
    if (/(?:^|\.)news\.google\./i.test(host)) return true;

    return false;
  } catch {
    return false;
  }
}

function cleanupNewsImages(root: ParentNode = document) {
  root.querySelectorAll<HTMLImageElement>(".ai-news-card img, .uorqui-news-gallery-v126 img").forEach((image) => {
    if (!isBadNewsImage(image.currentSrc || image.src)) return;

    const figure = image.closest("figure");
    const gallery = image.closest<HTMLElement>(".uorqui-news-gallery-v126");
    if (figure) figure.remove();
    else image.remove();

    if (gallery) {
      const count = gallery.querySelectorAll("figure").length;
      gallery.classList.remove("one", "two", "three", "four");
      if (!count) gallery.remove();
      else gallery.classList.add(count === 1 ? "one" : count === 2 ? "two" : count === 3 ? "three" : "four");
    }
  });
}

const observer = new MutationObserver((records) => {
  for (const record of records) {
    record.addedNodes.forEach((node) => {
      if (node instanceof Element) cleanupNewsImages(node);
    });
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("load", () => cleanupNewsImages());
cleanupNewsImages();
