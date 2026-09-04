export {};

const NEWS_PREVIEW_MIN_LENGTH = 320;
const COLLAPSED_CLASS = "uorqui-news-collapsed";
const EXPANDED_CLASS = "uorqui-news-expanded";

const style = document.createElement("style");
style.dataset.uorquiNewsReadMore = "1";
style.textContent = `
.post-card.${COLLAPSED_CLASS} .post-content > p{
  position:relative;
  display:-webkit-box;
  -webkit-box-orient:vertical;
  -webkit-line-clamp:4;
  overflow:hidden;
  cursor:pointer;
  padding-right:5.8rem;
}
.post-card.${COLLAPSED_CLASS} .post-content > p::after{
  content:"Leia mais";
  position:absolute;
  right:0;
  bottom:0;
  z-index:1;
  padding:0 0 0 10px;
  font-weight:750;
  line-height:1.55;
  color:#2563eb;
  background:var(--surface, #fff);
  box-shadow:-16px 0 12px 4px var(--surface, #fff);
  white-space:nowrap;
}
.post-card.${EXPANDED_CLASS} .post-content > p{
  cursor:pointer;
}
.post-card.${EXPANDED_CLASS} .post-content > p::after{
  content:"Leia menos";
  display:block;
  width:max-content;
  margin-top:.35rem;
  font-weight:750;
  color:#2563eb;
  line-height:1.4;
  white-space:nowrap;
}
`;
document.head.appendChild(style);

function newsText(card: HTMLElement) {
  if (!card.querySelector(".ai-news-card")) return null;
  return card.querySelector<HTMLElement>(".post-content > p");
}

function setAccessibility(paragraph: HTMLElement, expanded: boolean) {
  paragraph.setAttribute("role", "button");
  paragraph.setAttribute("tabindex", "0");
  paragraph.setAttribute("aria-expanded", expanded ? "true" : "false");
  paragraph.setAttribute("aria-label", expanded ? "Recolher notícia" : "Ler notícia completa");
}

function clearAccessibility(paragraph: HTMLElement) {
  paragraph.removeAttribute("role");
  paragraph.removeAttribute("tabindex");
  paragraph.removeAttribute("aria-expanded");
  paragraph.removeAttribute("aria-label");
}

function syncCard(card: HTMLElement) {
  const paragraph = newsText(card);
  if (!paragraph) {
    card.classList.remove(COLLAPSED_CLASS, EXPANDED_CLASS);
    return;
  }

  const text = String(paragraph.textContent || "").trim();
  if (text.length <= NEWS_PREVIEW_MIN_LENGTH) {
    card.classList.remove(COLLAPSED_CLASS, EXPANDED_CLASS);
    clearAccessibility(paragraph);
    return;
  }

  if (card.classList.contains(EXPANDED_CLASS)) {
    card.classList.remove(COLLAPSED_CLASS);
    setAccessibility(paragraph, true);
    return;
  }

  card.classList.add(COLLAPSED_CLASS);
  card.classList.remove(EXPANDED_CLASS);
  setAccessibility(paragraph, false);
}

function syncNewsCards(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".post-card").forEach(syncCard);
}

function toggleNews(paragraph: HTMLElement) {
  const card = paragraph.closest<HTMLElement>(`.post-card.${COLLAPSED_CLASS}, .post-card.${EXPANDED_CLASS}`);
  if (!card) return;

  const expanded = card.classList.contains(EXPANDED_CLASS);
  if (expanded) {
    card.classList.remove(EXPANDED_CLASS);
    card.classList.add(COLLAPSED_CLASS);
    setAccessibility(paragraph, false);
    return;
  }

  card.classList.remove(COLLAPSED_CLASS);
  card.classList.add(EXPANDED_CLASS);
  setAccessibility(paragraph, true);
}

document.addEventListener("click", (event) => {
  const target = event.target as Element | null;
  const paragraph = target?.closest<HTMLElement>(`.post-card.${COLLAPSED_CLASS} .post-content > p, .post-card.${EXPANDED_CLASS} .post-content > p`);
  if (!paragraph) return;
  toggleNews(paragraph);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target as Element | null;
  const paragraph = target?.closest<HTMLElement>(`.post-card.${COLLAPSED_CLASS} .post-content > p, .post-card.${EXPANDED_CLASS} .post-content > p`);
  if (!paragraph) return;
  event.preventDefault();
  toggleNews(paragraph);
});

let syncQueued = false;
function scheduleSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    syncNewsCards();
  });
}

const observer = new MutationObserver(scheduleSync);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
window.addEventListener("uorqui:realtime-refresh", scheduleSync);
scheduleSync();
