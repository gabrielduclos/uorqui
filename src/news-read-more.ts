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
  padding-bottom:1.35em;
}
.post-card.${COLLAPSED_CLASS} .post-content > p::after{
  content:"Ler mais";
  position:absolute;
  right:0;
  bottom:0;
  z-index:1;
  padding-left:32px;
  font-weight:700;
  line-height:1.35em;
  color:var(--primary, #2563eb);
  background:linear-gradient(90deg, transparent 0%, var(--card, #fff) 28%, var(--card, #fff) 100%);
}
@media (prefers-color-scheme: dark){
  .post-card.${COLLAPSED_CLASS} .post-content > p::after{
    background:linear-gradient(90deg, transparent 0%, var(--card, #111827) 28%, var(--card, #111827) 100%);
  }
}
`;
document.head.appendChild(style);

function newsText(card: HTMLElement) {
  if (!card.querySelector(".ai-news-card")) return null;
  return card.querySelector<HTMLElement>(".post-content > p");
}

function syncCard(card: HTMLElement) {
  const paragraph = newsText(card);
  if (!paragraph) {
    card.classList.remove(COLLAPSED_CLASS, EXPANDED_CLASS);
    return;
  }

  const text = String(paragraph.textContent || "").trim();
  if (text.length <= NEWS_PREVIEW_MIN_LENGTH) {
    card.classList.remove(COLLAPSED_CLASS);
    paragraph.removeAttribute("role");
    paragraph.removeAttribute("tabindex");
    paragraph.removeAttribute("aria-expanded");
    paragraph.removeAttribute("aria-label");
    return;
  }

  if (!card.classList.contains(EXPANDED_CLASS)) {
    card.classList.add(COLLAPSED_CLASS);
    paragraph.setAttribute("role", "button");
    paragraph.setAttribute("tabindex", "0");
    paragraph.setAttribute("aria-expanded", "false");
    paragraph.setAttribute("aria-label", "Ler notícia completa");
  }
}

function syncNewsCards(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(".post-card").forEach(syncCard);
}

function expandNews(paragraph: HTMLElement) {
  const card = paragraph.closest<HTMLElement>(`.post-card.${COLLAPSED_CLASS}`);
  if (!card) return;
  card.classList.remove(COLLAPSED_CLASS);
  card.classList.add(EXPANDED_CLASS);
  paragraph.setAttribute("aria-expanded", "true");
  paragraph.setAttribute("aria-label", "Notícia completa");
}

document.addEventListener("click", (event) => {
  const target = event.target as Element | null;
  const paragraph = target?.closest<HTMLElement>(`.post-card.${COLLAPSED_CLASS} .post-content > p`);
  if (!paragraph) return;
  expandNews(paragraph);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target as Element | null;
  const paragraph = target?.closest<HTMLElement>(`.post-card.${COLLAPSED_CLASS} .post-content > p`);
  if (!paragraph) return;
  event.preventDefault();
  expandNews(paragraph);
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
