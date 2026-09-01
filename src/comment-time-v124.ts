export {};

type CommentSnapshot = {
  id?: string;
  authorUid?: string;
  createdAt?: string;
  text?: string;
};

let latestComments: CommentSnapshot[] = [];
const originalFetch = window.fetch.bind(window);

window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  try {
    const input = args[0];
    const rawUrl = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.origin);
    if (/\/api\/posts\/[^/]+\/comments$/.test(url.pathname) && response.ok) {
      const payload = await response.clone().json().catch(() => null);
      if (Array.isArray(payload?.comments)) {
        latestComments = payload.comments;
        queueMicrotask(syncCommentTimes);
      }
    }
  } catch {}
  return response;
};

function relativeTime(value?: string) {
  if (!value) return "agora";
  const stamp = new Date(value).getTime();
  if (!Number.isFinite(stamp)) return "agora";
  const seconds = Math.max(0, Math.floor((Date.now() - stamp) / 1000));
  if (seconds < 45) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}

function syncCommentTimes() {
  document.querySelectorAll<HTMLElement>(".inline-comment-list").forEach((list) => {
    const comments = Array.from(list.querySelectorAll<HTMLElement>(".inline-comment"));
    comments.forEach((element, index) => {
      const body = element.querySelector<HTMLElement>(".inline-comment-body");
      const author = body?.querySelector<HTMLElement>(":scope > strong");
      if (!body || !author) return;

      let stamp = element.dataset.commentCreatedAt || "";
      const candidate = latestComments[index];
      if (candidate?.createdAt) {
        const authorUid = element.dataset.authorUid || "";
        if (!candidate.authorUid || !authorUid || candidate.authorUid === authorUid) {
          stamp = candidate.createdAt;
          element.dataset.commentCreatedAt = stamp;
        }
      }

      let label = body.querySelector<HTMLElement>(":scope > .comment-relative-time");
      if (!label) {
        label = document.createElement("span");
        label.className = "comment-relative-time";
        author.insertAdjacentElement("afterend", label);
      }
      label.textContent = ` · ${relativeTime(stamp)}`;
      label.title = stamp ? new Date(stamp).toLocaleString("pt-BR") : "Publicado agora";
    });
  });
}

const commentTimeObserver = new MutationObserver(syncCommentTimes);
commentTimeObserver.observe(document.documentElement, { childList: true, subtree: true });
window.setInterval(syncCommentTimes, 60_000);
syncCommentTimes();
