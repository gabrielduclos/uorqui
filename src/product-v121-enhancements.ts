import { api } from "./lib/api";

type CachedPost = {
  id: string;
  authorUid?: string;
  authorName?: string;
  scope?: string;
  companyId?: string;
  communityId?: string;
  type?: "post" | "question" | "announcement" | "poll" | "event" | string;
  text?: string;
  title?: string;
  eventStart?: string;
  eventEnd?: string;
  eventLocation?: string;
  editedAt?: string;
  deletedByAdmin?: boolean;
};

type MentionUser = {
  uid: string;
  displayName: string;
  email: string;
  handle: string;
};

const postCache = new Map<string, CachedPost>();
let currentUid = "";
let enhanceScheduled = false;
let mentionRequest = 0;
let mentionIndex = 0;
let mentionUsers: MentionUser[] = [];
let mentionTarget: HTMLTextAreaElement | null = null;
let mentionStart = 0;
let mentionEnd = 0;
const cepTimers = new WeakMap<HTMLInputElement, number>();

function normalize(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function cachePost(post?: CachedPost | null) {
  if (post?.id) postCache.set(post.id, post);
}

function capturePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return;
  const data = payload as Record<string, unknown>;
  const me = data.me as { uid?: string } | undefined;
  if (me?.uid) currentUid = me.uid;

  const arrays = [data.posts, data.worldPosts, data.results, data.items];
  for (const collection of arrays) {
    if (Array.isArray(collection)) collection.forEach((item) => cachePost(item as CachedPost));
  }
  if (data.post && typeof data.post === "object") cachePost(data.post as CachedPost);
  scheduleEnhance();
}

const nativeFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const response = await nativeFetch(input, init);
  if (response.ok) {
    let rawUrl = "";
    if (typeof input === "string") rawUrl = input;
    else if (input instanceof URL) rawUrl = input.toString();
    else rawUrl = input.url;

    try {
      const url = new URL(rawUrl, location.origin);
      const path = url.pathname;
      const capturesPosts =
        path === "/api/bootstrap" ||
        path === "/api/search" ||
        /^\/api\/communities\/[^/]+\/posts$/.test(path) ||
        /^\/api\/posts\/[^/]+$/.test(path);
      if (capturesPosts) {
        void response.clone().json().then(capturePayload).catch(() => {});
      }
    } catch {}
  }
  return response;
}) as typeof window.fetch;

function showToast(message: string) {
  document.querySelector(".uorqui-enhancement-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "uorqui-enhancement-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

function findHomeButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".side-nav button, .mobile-nav button"))
    .find((button) => normalize(button.textContent || "") === "inicio");
}

document.addEventListener("click", (event) => {
  const target = event.target as Element | null;
  const bell = target?.closest<HTMLButtonElement>(".top-bell");
  if (!bell || !bell.classList.contains("active")) return;
  event.preventDefault();
  event.stopPropagation();
  if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
  queueMicrotask(() => findHomeButton()?.click());
}, true);

function cepStatus(input: HTMLInputElement) {
  const label = input.closest("label");
  if (!label) return null;
  let status = label.querySelector<HTMLElement>(".uorqui-cep-status");
  if (!status) {
    status = document.createElement("small");
    status.className = "uorqui-cep-status";
    label.appendChild(status);
  }
  return status;
}

function setFormValue(form: HTMLFormElement, name: string, value: string) {
  if (!value) return;
  const input = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function lookupCep(input: HTMLInputElement) {
  const digits = input.value.replace(/\D/g, "").slice(0, 8);
  const status = cepStatus(input);
  if (digits.length !== 8) {
    if (status) {
      status.textContent = "";
      status.className = "uorqui-cep-status";
    }
    return;
  }

  if (input.dataset.uorquiLastCep === digits) return;
  input.dataset.uorquiLastCep = digits;
  if (status) {
    status.textContent = "Buscando endereço…";
    status.className = "uorqui-cep-status";
  }

  try {
    const result = await api<{
      postalCode: string;
      street: string;
      complement: string;
      district: string;
      city: string;
      state: string;
    }>(`/cep/${digits}`);
    const form = input.closest("form");
    if (!form) return;
    input.value = result.postalCode || `${digits.slice(0, 5)}-${digits.slice(5)}`;
    setFormValue(form, "street", result.street);
    setFormValue(form, "district", result.district);
    setFormValue(form, "city", result.city);
    setFormValue(form, "state", result.state);
    const complement = form.querySelector<HTMLInputElement>("[name=\"complement\"]");
    if (complement && !complement.value && result.complement) setFormValue(form, "complement", result.complement);
    if (status) {
      status.textContent = "Endereço encontrado. Complete o número.";
      status.className = "uorqui-cep-status ok";
    }
  } catch (error) {
    delete input.dataset.uorquiLastCep;
    if (status) {
      status.textContent = error instanceof Error ? error.message : "Não foi possível consultar o CEP.";
      status.className = "uorqui-cep-status error";
    }
  }
}

document.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.name !== "postalCode") return;
  const previous = cepTimers.get(input);
  if (previous) window.clearTimeout(previous);
  cepTimers.set(input, window.setTimeout(() => void lookupCep(input), 300));
}, true);

document.addEventListener("blur", (event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement && input.name === "postalCode") void lookupCep(input);
}, true);

const mentionMenu = document.createElement("div");
mentionMenu.className = "uorqui-mention-menu";
mentionMenu.hidden = true;
document.body.appendChild(mentionMenu);

function textareaSupportsMentions(textarea: HTMLTextAreaElement) {
  return Boolean(textarea.closest(".composer-form, .inline-comment-form, .uorqui-edit-form"));
}

function currentCommunityId(textarea: HTMLTextAreaElement) {
  const composer = textarea.closest<HTMLFormElement>(".composer-form");
  if (!composer) return "";
  const selectedAudience = Array.from(composer.querySelectorAll<HTMLButtonElement>(".audience-row button.selected"))
    .find((button) => normalize(button.textContent || "").includes("comunidade"));
  if (!selectedAudience) return "";
  const select = composer.querySelector<HTMLSelectElement>("select");
  return select?.value || "";
}

function mentionMatch(textarea: HTMLTextAreaElement) {
  const cursor = textarea.selectionStart ?? textarea.value.length;
  const before = textarea.value.slice(0, cursor);
  const match = before.match(/(?:^|\s)@([A-Za-zÀ-ÿ0-9._-]{0,60})$/);
  if (!match) return null;
  const query = match[1] || "";
  return {
    query,
    start: cursor - query.length - 1,
    end: cursor,
  };
}

function positionMentionMenu(textarea: HTMLTextAreaElement) {
  const rect = textarea.getBoundingClientRect();
  const width = Math.min(360, Math.max(240, rect.width));
  mentionMenu.style.width = `${width}px`;
  mentionMenu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left))}px`;
  const below = rect.bottom + 5;
  const menuHeight = Math.min(260, mentionMenu.scrollHeight || 220);
  const top = below + menuHeight < window.innerHeight ? below : Math.max(8, rect.top - menuHeight - 5);
  mentionMenu.style.top = `${top}px`;
}

function renderMentionMenu() {
  if (!mentionTarget) {
    mentionMenu.hidden = true;
    return;
  }
  mentionMenu.innerHTML = "";
  if (!mentionUsers.length) {
    const empty = document.createElement("div");
    empty.className = "uorqui-mention-empty";
    empty.textContent = "Nenhum usuário encontrado.";
    mentionMenu.appendChild(empty);
  } else {
    mentionUsers.forEach((user, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `uorqui-mention-option ${index === mentionIndex ? "active" : ""}`;
      button.innerHTML = `
        <span class="uorqui-mention-avatar">${escapeHtml((user.displayName || user.email || "U").slice(0, 2).toUpperCase())}</span>
        <span class="uorqui-mention-copy">
          <strong>${escapeHtml(user.displayName || user.email || "Usuário")}</strong>
          <small>@${escapeHtml(user.handle)}${user.email ? ` · ${escapeHtml(user.email)}` : ""}</small>
        </span>`;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => chooseMention(index));
      mentionMenu.appendChild(button);
    });
  }
  mentionMenu.hidden = false;
  positionMentionMenu(mentionTarget);
}

function chooseMention(index: number) {
  const textarea = mentionTarget;
  const user = mentionUsers[index];
  if (!textarea || !user) return;
  const before = textarea.value.slice(0, mentionStart);
  const after = textarea.value.slice(mentionEnd);
  const inserted = `@${user.handle} `;
  textarea.value = `${before}${inserted}${after}`;
  const cursor = before.length + inserted.length;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  closeMentions();
}

function closeMentions() {
  mentionTarget = null;
  mentionUsers = [];
  mentionIndex = 0;
  mentionMenu.hidden = true;
}

async function updateMentionSearch(textarea: HTMLTextAreaElement) {
  if (!textareaSupportsMentions(textarea)) return closeMentions();
  const match = mentionMatch(textarea);
  if (!match) return closeMentions();
  const companyId = localStorage.getItem("uorqui-company") || "";
  if (!companyId) return closeMentions();

  mentionTarget = textarea;
  mentionStart = match.start;
  mentionEnd = match.end;
  mentionIndex = 0;
  const requestId = ++mentionRequest;
  try {
    const params = new URLSearchParams({ companyId, q: match.query });
    const communityId = currentCommunityId(textarea);
    if (communityId) params.set("communityId", communityId);
    const result = await api<{ users: MentionUser[] }>(`/mentions?${params.toString()}`);
    if (requestId !== mentionRequest || mentionTarget !== textarea) return;
    mentionUsers = result.users || [];
    renderMentionMenu();
  } catch {
    if (requestId === mentionRequest) closeMentions();
  }
}

document.addEventListener("input", (event) => {
  const textarea = event.target;
  if (textarea instanceof HTMLTextAreaElement && textareaSupportsMentions(textarea)) {
    void updateMentionSearch(textarea);
  }
}, true);

document.addEventListener("keydown", (event) => {
  if (mentionMenu.hidden || !mentionTarget || event.target !== mentionTarget) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    mentionIndex = mentionUsers.length ? (mentionIndex + 1) % mentionUsers.length : 0;
    renderMentionMenu();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    mentionIndex = mentionUsers.length ? (mentionIndex - 1 + mentionUsers.length) % mentionUsers.length : 0;
    renderMentionMenu();
  } else if (event.key === "Enter" && mentionUsers.length) {
    event.preventDefault();
    chooseMention(mentionIndex);
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeMentions();
  }
}, true);

document.addEventListener("click", (event) => {
  if (mentionMenu.hidden) return;
  const target = event.target as Node | null;
  if (target && !mentionMenu.contains(target) && target !== mentionTarget) closeMentions();
});

window.addEventListener("resize", () => mentionTarget && positionMentionMenu(mentionTarget));
window.addEventListener("scroll", () => mentionTarget && positionMentionMenu(mentionTarget), true);

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] || char));
}

function postSignature(post: CachedPost) {
  return [post.title || "", post.text || ""]
    .map(normalize)
    .filter((value) => value.length >= 2)
    .sort((a, b) => b.length - a.length);
}

function matchOwnPost(card: HTMLElement, used: Set<string>) {
  const sharedId = new URLSearchParams(location.search).get("post") || "";
  if (sharedId && card.closest(".shared-post-page")) {
    const shared = postCache.get(sharedId);
    if (shared?.authorUid === currentUid) return shared;
  }

  const content = normalize(card.querySelector<HTMLElement>(".post-content")?.textContent || "");
  const author = normalize(card.querySelector<HTMLElement>(".post-author strong")?.textContent || "");
  const candidates = Array.from(postCache.values())
    .filter((post) => post.authorUid === currentUid && !post.deletedByAdmin && post.scope !== "world" && !used.has(post.id))
    .map((post) => {
      const signatures = postSignature(post);
      const score = Math.max(0, ...signatures.filter((signature) => content.includes(signature)).map((signature) => signature.length));
      const authorMatches = !post.authorName || normalize(post.authorName) === author;
      return { post, score: authorMatches ? score : 0 };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) return null;
  return candidates[0].post;
}

function ensureEditButtons() {
  if (!currentUid || !postCache.size) return;
  const used = new Set<string>();
  document.querySelectorAll<HTMLElement>(".post-card:not(.post-tombstone)").forEach((card) => {
    const existing = card.querySelector<HTMLButtonElement>(".uorqui-post-edit");
    if (existing?.dataset.postId) {
      used.add(existing.dataset.postId);
      return;
    }
    const post = matchOwnPost(card, used);
    if (!post) return;
    used.add(post.id);

    const head = card.querySelector<HTMLElement>(".post-head");
    if (!head) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "uorqui-post-edit";
    button.dataset.postId = post.id;
    button.setAttribute("aria-label", "Editar publicação");
    button.title = "Editar publicação";
    button.innerHTML = "✎ <span>Editar</span>";
    button.addEventListener("click", () => openEditModal(post));
    const deleteButton = head.querySelector(".post-delete");
    if (deleteButton) head.insertBefore(button, deleteButton);
    else head.appendChild(button);

    if (post.editedAt && !head.querySelector(".uorqui-edited-mark")) {
      const mark = document.createElement("small");
      mark.className = "uorqui-edited-mark";
      mark.textContent = "· editado";
      head.querySelector(".post-author > div")?.appendChild(mark);
    }
  });
}

function isoToLocal(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function openEditModal(post: CachedPost) {
  document.querySelector(".uorqui-edit-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "uorqui-edit-backdrop";
  const modal = document.createElement("section");
  modal.className = "uorqui-edit-modal";
  const titleField = post.type === "announcement" || post.type === "event"
    ? `<label><span>${post.type === "event" ? "Nome do evento" : "Título"}</span><input name="title" maxlength="180" required value="${escapeHtml(post.title || "")}"></label>`
    : "";
  const eventFields = post.type === "event"
    ? `<div class="uorqui-edit-grid">
        <label><span>Início</span><input name="eventStart" type="datetime-local" required value="${escapeHtml(isoToLocal(post.eventStart))}"></label>
        <label><span>Término</span><input name="eventEnd" type="datetime-local" value="${escapeHtml(isoToLocal(post.eventEnd))}"></label>
      </div>
      <label><span>Local ou link</span><input name="eventLocation" maxlength="240" value="${escapeHtml(post.eventLocation || "")}"></label>`
    : "";
  const note = post.type === "poll"
    ? "As opções e os votos da enquete são preservados; você pode editar apenas a pergunta."
    : "Fotos, arquivos, público e tipo da publicação são preservados.";

  modal.innerHTML = `
    <div class="uorqui-edit-head"><h3>Editar publicação</h3><button type="button" class="uorqui-edit-close" aria-label="Fechar">×</button></div>
    <form class="uorqui-edit-form">
      ${titleField}
      ${eventFields}
      <label><span>${post.type === "poll" ? "Pergunta" : post.type === "event" ? "Descrição" : "Texto"}</span><textarea name="text" maxlength="5000" ${post.type === "event" ? "" : "required"}>${escapeHtml(post.text || "")}</textarea></label>
      <small class="uorqui-edit-note">${note}</small>
      <div class="uorqui-edit-actions"><button type="button" class="secondary" data-cancel>Cancelar</button><button type="submit" class="primary">Salvar alterações</button></div>
    </form>`;
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  modal.querySelector<HTMLButtonElement>(".uorqui-edit-close")?.addEventListener("click", close);
  modal.querySelector<HTMLButtonElement>("[data-cancel]")?.addEventListener("click", close);
  backdrop.addEventListener("mousedown", (event) => { if (event.target === backdrop) close(); });

  const form = modal.querySelector<HTMLFormElement>("form")!;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    submit.disabled = true;
    submit.textContent = "Salvando…";
    const data = new FormData(form);
    const payload: Record<string, string> = { text: String(data.get("text") || "").trim() };
    if (post.type === "announcement" || post.type === "event") payload.title = String(data.get("title") || "").trim();
    if (post.type === "event") {
      const start = String(data.get("eventStart") || "");
      const end = String(data.get("eventEnd") || "");
      payload.eventStart = start ? new Date(start).toISOString() : "";
      payload.eventEnd = end ? new Date(end).toISOString() : "";
      payload.eventLocation = String(data.get("eventLocation") || "").trim();
    }

    try {
      const result = await api<{ post: CachedPost }>(`/posts/${encodeURIComponent(post.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      cachePost(result.post);
      showToast("Publicação atualizada.");
      close();
      scheduleEnhance();
    } catch (error) {
      submit.disabled = false;
      submit.textContent = "Salvar alterações";
      showToast(error instanceof Error ? error.message : "Não foi possível editar a publicação.");
    }
  });
}

function enhance() {
  enhanceScheduled = false;
  ensureEditButtons();
}

function scheduleEnhance() {
  if (enhanceScheduled) return;
  enhanceScheduled = true;
  requestAnimationFrame(enhance);
}

const observer = new MutationObserver(scheduleEnhance);
observer.observe(document.documentElement, { childList: true, subtree: true });
scheduleEnhance();
