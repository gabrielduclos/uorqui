export {};

function isFeedVisible() {
  return Boolean(document.querySelector(".social-home"));
}

function keepHeaderVisibleOutsideFeed() {
  if (isFeedVisible()) return;
  const header = document.querySelector<HTMLElement>(".topbar");
  if (!header) return;
  if (header.classList.contains("scroll-hidden")) {
    header.classList.remove("scroll-hidden");
  }
  header.style.transition = "";
}

let queued = false;
function scheduleSync() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    keepHeaderVisibleOutsideFeed();
  });
}

const observer = new MutationObserver((mutations) => {
  if (isFeedVisible()) return;
  if (mutations.some((mutation) => mutation.type === "attributes" || mutation.addedNodes.length || mutation.removedNodes.length)) {
    scheduleSync();
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class"]
});

window.addEventListener("scroll", scheduleSync, { passive: true });
window.addEventListener("wheel", scheduleSync, { passive: true });
document.addEventListener("touchmove", scheduleSync, { passive: true, capture: true });
window.addEventListener("popstate", scheduleSync);
window.addEventListener("load", scheduleSync, { once: true });

scheduleSync();
