export {};

const UNAVAILABLE_CLASS = "uorqui-creator-unavailable";
const BADGE_CLASS = "uorqui-creator-unavailable-badge";

const style = document.createElement("style");
style.dataset.uorquiCreatorAvailability = "1";
style.textContent = `
.${UNAVAILABLE_CLASS}{position:relative;opacity:.72;filter:saturate(.72)}
.${UNAVAILABLE_CLASS} button,.${UNAVAILABLE_CLASS} a[role="button"]{pointer-events:none!important;cursor:not-allowed!important}
.${BADGE_CLASS}{display:inline-flex;align-items:center;margin-left:7px;padding:3px 7px;border-radius:999px;font-size:10px!important;font-weight:800;line-height:1.2;letter-spacing:.01em;background:#eef0f3;color:#686d75;white-space:nowrap}
.uorqui-creator-unavailable-note{margin-top:12px;padding:10px 12px;border:1px solid #e1e4e8;border-radius:10px;background:#f7f8fa;color:#5f6670;font-size:13px;line-height:1.4}
`;
document.head.appendChild(style);

function syncCreatorAvailability() {
  // Navegação e plano Free permanecem exatamente como antes.
  // Somente o card do modo Criador fica indisponível temporariamente.
  const page = document.querySelector<HTMLElement>(".creator-focus-page");
  if (!page) return;

  const creatorCard = page.querySelector<HTMLElement>(".premium-card");
  if (!creatorCard) return;

  creatorCard.classList.add(UNAVAILABLE_CLASS);
  creatorCard.setAttribute("aria-disabled", "true");

  const ribbon = creatorCard.querySelector<HTMLElement>(".premium-ribbon");
  if (ribbon && !creatorCard.querySelector(`.${BADGE_CLASS}`)) {
    const badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    badge.textContent = "Indisponível no momento";
    ribbon.insertAdjacentElement("afterend", badge);
  }

  if (!creatorCard.querySelector(".uorqui-creator-unavailable-note")) {
    const note = document.createElement("div");
    note.className = "uorqui-creator-unavailable-note";
    note.textContent = "O modo Criador está temporariamente indisponível. O modo Free continua funcionando normalmente.";
    creatorCard.appendChild(note);
  }

  creatorCard.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
  });
}

let queued = false;
function scheduleSync() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    syncCreatorAvailability();
  });
}

const observer = new MutationObserver(scheduleSync);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("load", scheduleSync, { once: true });
syncCreatorAvailability();
