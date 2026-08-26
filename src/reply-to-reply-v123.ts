export {};

const REPLY_MARKER = /\n?\[\[uorqui-reply:([a-zA-Z0-9_-]+):([^\]]+)\]\]\s*$/;
let enhanceQueued = false;

function normalizeMention(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function encodeName(value: string) {
  return encodeURIComponent(value.replace(/\s+/g, " ").trim()).slice(0, 180);
}

function decodeName(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function formForComment(comment: HTMLElement) {
  const card = comment.closest<HTMLElement>(".post-card, article.post, .feed-item");
  if (card) {
    const form = card.querySelector<HTMLFormElement>(".inline-comment-form");
    if (form) return form;
  }
  const commentsArea = comment.closest<HTMLElement>(".comments-section, .post-comments, .inline-comments");
  return commentsArea?.parentElement?.querySelector<HTMLFormElement>(".inline-comment-form") ||
    comment.parentElement?.parentElement?.querySelector<HTMLFormElement>(".inline-comment-form") || null;
}

function clearReplyTarget(form: HTMLFormElement) {
  delete form.dataset.replyToCommentId;
  delete form.dataset.replyToName;
  form.querySelector(".uorqui-reply-target")?.remove();
}

function setReplyTarget(comment: HTMLElement) {
  const id = comment.id.replace(/^comment-/, "").trim();
  const name = (comment.querySelector(".inline-comment-body > strong")?.textContent || "Usuário").trim();
  const form = formForComment(comment);
  if (!id || !form) return;

  form.dataset.replyToCommentId = id;
  form.dataset.replyToName = name;

  let target = form.querySelector<HTMLElement>(".uorqui-reply-target");
  if (!target) {
    target = document.createElement("div");
    target.className = "uorqui-reply-target";
    form.prepend(target);
  }
  target.innerHTML = `<span>Respondendo a <strong></strong></span><button type="button" aria-label="Cancelar resposta">×</button>`;
  target.querySelector("strong")!.textContent = name;
  target.querySelector("button")!.addEventListener("click", () => clearReplyTarget(form));

  const textarea = form.querySelector<HTMLTextAreaElement>('textarea[name="text"]');
  if (!textarea) return;
  const mention = normalizeMention(name);
  if (!textarea.value.trim() && mention) {
    textarea.value = `@${mention} `;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function decorateStoredReply(comment: HTMLElement) {
  const body = comment.querySelector<HTMLElement>(".inline-comment-body");
  const paragraph = body?.querySelector<HTMLParagraphElement>(":scope > p");
  if (!body || !paragraph) return;
  const raw = paragraph.textContent || "";
  const match = raw.match(REPLY_MARKER);
  if (!match) return;

  const parentId = match[1];
  const parentName = decodeName(match[2]);
  const clean = raw.replace(REPLY_MARKER, "").trim();
  if (paragraph.textContent !== clean) paragraph.textContent = clean;
  comment.classList.add("uorqui-comment-reply");
  comment.dataset.replyToCommentId = parentId;

  let reference = body.querySelector<HTMLButtonElement>(":scope > .uorqui-reply-reference");
  if (!reference) {
    reference = document.createElement("button");
    reference.type = "button";
    reference.className = "uorqui-reply-reference";
    body.insertBefore(reference, paragraph);
  }
  reference.textContent = `Respondendo a ${parentName}`;
  reference.onclick = () => {
    const parent = document.getElementById(`comment-${parentId}`);
    parent?.scrollIntoView({ behavior: "smooth", block: "center" });
    parent?.classList.add("highlighted");
    window.setTimeout(() => parent?.classList.remove("highlighted"), 1800);
  };
}

function enhanceComment(comment: HTMLElement) {
  decorateStoredReply(comment);
  const actions = comment.querySelector<HTMLElement>(".inline-comment-actions");
  if (!actions || actions.querySelector(".uorqui-comment-reply-button")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "uorqui-comment-reply-button";
  button.textContent = "Responder";
  button.addEventListener("click", () => setReplyTarget(comment));
  actions.appendChild(button);
}

function enhance() {
  enhanceQueued = false;
  document.querySelectorAll<HTMLElement>('.inline-comment[id^="comment-"]').forEach(enhanceComment);
}

function queueEnhance() {
  if (enhanceQueued) return;
  enhanceQueued = true;
  requestAnimationFrame(enhance);
}

document.addEventListener("submit", (event) => {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  if (!form?.classList.contains("inline-comment-form")) return;
  const parentId = form.dataset.replyToCommentId || "";
  const parentName = form.dataset.replyToName || "";
  if (!parentId || !parentName) return;

  const textarea = form.querySelector<HTMLTextAreaElement>('textarea[name="text"]');
  if (!textarea) return;
  const marker = `[[uorqui-reply:${parentId}:${encodeName(parentName)}]]`;
  if (!textarea.value.includes(marker)) textarea.value = `${textarea.value.trim()}\n${marker}`.trim();

  window.setTimeout(() => {
    clearReplyTarget(form);
    queueEnhance();
  }, 0);
}, true);

const replyObserver = new MutationObserver(queueEnhance);
replyObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
queueEnhance();
