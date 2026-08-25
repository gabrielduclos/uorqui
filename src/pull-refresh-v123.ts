const FEED_REFRESH_DISTANCE = 72;
const FULL_REFRESH_DISTANCE = 220;
const MAX_PULL_DISTANCE = 280;

let startX = 0;
let startY = 0;
let pullDistance = 0;
let gestureActive = false;
let pulling = false;
let hideTimer = 0;

function isStandalonePwa() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function currentScrollTop() {
  const documentTop = Math.max(
    0,
    window.scrollY || 0,
    document.documentElement.scrollTop || 0,
    document.body.scrollTop || 0,
    document.scrollingElement?.scrollTop || 0
  );
  const mainTop = Math.max(0, document.querySelector<HTMLElement>(".main")?.scrollTop || 0);
  return Math.max(documentTop, mainTop);
}

function isHomeFeed() {
  return Boolean(document.querySelector(".main .quick-compose") && document.querySelector(".main .feed"));
}

function gestureBlocked(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable=true], video, .uorqui-media-lightbox, .modal, .modal-backdrop, .uorqui-community-edit-backdrop")
  );
}

function ensureIndicator() {
  let indicator = document.getElementById("uorqui-pull-refresh");
  if (indicator) return indicator;
  indicator = document.createElement("div");
  indicator.id = "uorqui-pull-refresh";
  indicator.setAttribute("aria-live", "polite");
  indicator.innerHTML = '<span class="uorqui-pull-spinner" aria-hidden="true">↻</span><strong>Puxe para atualizar</strong>';
  document.body.appendChild(indicator);
  return indicator;
}

function syncFeedIndicatorPosition() {
  const indicator = ensureIndicator();
  const header = document.querySelector<HTMLElement>(".topbar");
  const bottom = Math.max(0, Math.round(header?.getBoundingClientRect().bottom || 0));
  indicator.style.setProperty("--uorqui-feed-indicator-top", `${bottom + 8}px`);
}

function setIndicator(message: string, visible = true, spinning = false, mode: "feed" | "full" = "feed") {
  const indicator = ensureIndicator();
  if (mode === "feed") syncFeedIndicatorPosition();
  indicator.querySelector("strong")!.textContent = message;
  indicator.classList.toggle("visible", visible);
  indicator.classList.toggle("spinning", spinning);
  indicator.classList.toggle("feed-mode", mode === "feed");
  indicator.classList.toggle("full-mode", mode === "full");
}

function resetPull(immediate = false) {
  gestureActive = false;
  pulling = false;
  pullDistance = 0;
  document.documentElement.classList.remove("uorqui-pulling");
  document.documentElement.classList.add("uorqui-pull-settling");
  document.documentElement.style.setProperty("--uorqui-pull-offset", "0px");
  window.setTimeout(() => document.documentElement.classList.remove("uorqui-pull-settling"), immediate ? 0 : 190);
}

function hideIndicatorLater(delay = 700) {
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => setIndicator("Puxe para atualizar", false, false, "feed"), delay);
}

function softRefreshFeed() {
  const companyPicker = document.querySelector<HTMLSelectElement>(".company-picker select");
  if (companyPicker?.value) {
    companyPicker.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}

function fullRefresh() {
  setIndicator("Atualizando o Uorqui inteiro…", true, true, "full");
  resetPull();
  window.setTimeout(() => window.location.reload(), 120);
}

function scrollHomeToTop() {
  const behavior: ScrollBehavior = "smooth";
  try { window.scrollTo({ top: 0, left: 0, behavior }); } catch { window.scrollTo(0, 0); }
  try { document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior }); } catch {}
  try { document.querySelector<HTMLElement>(".main")?.scrollTo({ top: 0, left: 0, behavior }); } catch {}
}

function isHomeButton(button: HTMLButtonElement) {
  if (!button.closest(".side-nav, .mobile-nav")) return false;
  return (button.textContent || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR") === "início";
}

document.addEventListener("click", (event) => {
  const target = event.target as Element | null;
  const button = target?.closest<HTMLButtonElement>("button");
  if (!button || !isHomeButton(button)) return;
  window.requestAnimationFrame(() => window.requestAnimationFrame(scrollHomeToTop));
}, true);

window.addEventListener("resize", () => {
  if (document.getElementById("uorqui-pull-refresh")?.classList.contains("feed-mode")) syncFeedIndicatorPosition();
}, { passive: true });

if (isStandalonePwa()) {
  document.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1 || currentScrollTop() > 1 || gestureBlocked(event.target)) {
      gestureActive = false;
      return;
    }
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    pullDistance = 0;
    pulling = false;
    gestureActive = true;
  }, { passive: true });

  document.addEventListener("touchmove", (event) => {
    if (!gestureActive || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    if (deltaY <= 0 || Math.abs(deltaX) > deltaY * 0.8) {
      if (pulling) resetPull(true);
      gestureActive = false;
      return;
    }

    if (currentScrollTop() > 1) {
      resetPull(true);
      return;
    }

    if (deltaY < 8) return;
    pulling = true;
    pullDistance = Math.min(MAX_PULL_DISTANCE, deltaY);
    event.preventDefault();

    const visualDistance = Math.min(108, Math.round(pullDistance * 0.42));
    document.documentElement.classList.remove("uorqui-pull-settling");
    document.documentElement.classList.add("uorqui-pulling");
    document.documentElement.style.setProperty("--uorqui-pull-offset", `${visualDistance}px`);

    const homeFeed = isHomeFeed();
    if (pullDistance >= FULL_REFRESH_DISTANCE) {
      setIndicator("Solte para recarregar o Uorqui inteiro", true, false, "full");
    } else if (homeFeed && pullDistance >= FEED_REFRESH_DISTANCE) {
      setIndicator("Solte para atualizar somente o feed", true, false, "feed");
    } else if (homeFeed) {
      setIndicator("Puxe para atualizar o feed", true, false, "feed");
    } else {
      setIndicator("Puxe mais para recarregar o Uorqui", true, false, "full");
    }
  }, { passive: false });

  const finishPull = () => {
    if (!gestureActive && !pulling) return;
    const distance = pullDistance;
    const homeFeed = isHomeFeed();

    if (distance >= FULL_REFRESH_DISTANCE) {
      fullRefresh();
      return;
    }

    resetPull();
    if (distance >= FEED_REFRESH_DISTANCE && homeFeed) {
      setIndicator("Atualizando somente o feed…", true, true, "feed");
      if (!softRefreshFeed()) {
        setIndicator("Não foi possível atualizar o feed", true, false, "feed");
        hideIndicatorLater(1200);
        return;
      }
      hideIndicatorLater(1000);
      return;
    }

    hideIndicatorLater(220);
  };

  document.addEventListener("touchend", finishPull, { passive: true });
  document.addEventListener("touchcancel", () => {
    resetPull();
    hideIndicatorLater(120);
  }, { passive: true });
}
