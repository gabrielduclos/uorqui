export {};

type PostMeta = {
  id: string;
  authorName?: string;
  text?: string;
  title?: string;
  scope?: string;
  communityName?: string;
  topicName?: string;
  createdAt?: string;
};

const knownPosts = new Map<string, PostMeta>();
const originalPostTopicFetch = window.fetch.bind(window);

function normalize(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function rememberPayload(value: unknown) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach(rememberPayload);
    return;
  }
  if (typeof value !== "object") return;

  const object = value as Record<string, unknown>;
  if (
    typeof object.id === "string" &&
    typeof object.scope === "string" &&
    (typeof object.text === "string" || typeof object.title === "string")
  ) {
    knownPosts.set(object.id, object as unknown as PostMeta);
  }

  Object.values(object).forEach(rememberPayload);
}

window.fetch = async (...args) => {
  const response = await originalPostTopicFetch(...args);
  try {
    const contentType = response.headers.get("content-type") || "";
    if (response.ok && contentType.includes("application/json")) {
      const payload = await response.clone().json().catch(() => null);
      if (payload) {
        rememberPayload(payload);
        queueMicrotask(syncPostTopics);
      }
    }
  } catch {}
  return response;
};

function candidateScore(card: HTMLElement, post: PostMeta) {
  if (!post.topicName) return -1;

  const author = normalize(card.querySelector<HTMLElement>(".post-author strong")?.textContent || "");
  const scope = normalize(card.querySelector<HTMLElement>(".post-author .scope")?.textContent || "");
  const content = normalize(card.querySelector<HTMLElement>(".post-content")?.innerText || "");
  const postAuthor = normalize(post.authorName || "");
  const postCommunity = normalize(post.communityName || "");
  const postText = normalize(post.text || post.title || "");

  let score = 0;
  if (author && postAuthor && author === postAuthor) score += 4;
  else if (author && postAuthor) return -1;

  if (postCommunity && scope.includes(postCommunity)) score += 3;
  if (postText) {
    const sample = postText.slice(0, Math.min(100, postText.length));
    if (sample.length >= 12 && content.includes(sample)) score += 7;
    else {
      const words = sample.split(" ").filter(word => word.length >= 4).slice(0, 6);
      const matches = words.filter(word => content.includes(word)).length;
      score += matches;
    }
  }
  return score;
}

function syncPostTopics() {
  const available = [...knownPosts.values()].filter(post => post.topicName);
  if (!available.length) return;

  document.querySelectorAll<HTMLElement>(".post-card").forEach((card) => {
    const existing = card.querySelector<HTMLElement>(".post-topic-v125");
    if (existing) return;

    let best: PostMeta | null = null;
    let bestScore = -1;
    for (const post of available) {
      const score = candidateScore(card, post);
      if (score > bestScore) {
        best = post;
        bestScore = score;
      }
    }

    if (!best?.topicName || bestScore < 6) return;
    const authorBlock = card.querySelector<HTMLElement>(".post-author");
    if (!authorBlock) return;

    const label = document.createElement("span");
    label.className = "post-topic-v125";
    label.textContent = `Assunto · ${best.topicName}`;
    authorBlock.appendChild(label);
    card.dataset.uorquiPostId = best.id;
  });
}

const postTopicObserver = new MutationObserver(syncPostTopics);
postTopicObserver.observe(document.documentElement, { childList: true, subtree: true });
syncPostTopics();
