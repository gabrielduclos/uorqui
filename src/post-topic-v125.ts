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
  aiContentMode?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceImageUrl?: string;
  sourceImageUrls?: string[];
  sourceHeadline?: string;
  sourcePublishedAt?: string;
};

const knownPosts = new Map<string, PostMeta>();
const originalPostTopicFetch = window.fetch.bind(window);

installRichNewsStyles();

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
  if (post.scope !== "community" || !post.communityName) return -1;

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

function resolvePost(card: HTMLElement, available: PostMeta[]) {
  const rememberedId = card.dataset.uorquiPostId || "";
  if (rememberedId) {
    const remembered = knownPosts.get(rememberedId);
    if (remembered?.scope === "community" && remembered.communityName) return remembered;
  }

  let best: PostMeta | null = null;
  let bestScore = -1;
  for (const post of available) {
    const score = candidateScore(card, post);
    if (score > bestScore) {
      best = post;
      bestScore = score;
    }
  }
  return best && bestScore >= 6 ? best : null;
}

function syncPostTopics() {
  const available = [...knownPosts.values()].filter(post => post.scope === "community" && post.communityName);
  if (!available.length) return;

  document.querySelectorAll<HTMLElement>(".post-card").forEach((card) => {
    const post = resolvePost(card, available);
    if (!post?.communityName) return;

    const authorBlock = card.querySelector<HTMLElement>(".post-author");
    const scopeLabel = authorBlock?.querySelector<HTMLElement>(".scope");
    if (!authorBlock || !scopeLabel) return;

    // O assunto faz parte da mesma linha de contexto da publicação.
    // Ex.: Comunidades - Tecnologia & IA - Inteligência artificial
    const topic = String(post.topicName || "").trim();
    const label = ["Comunidades", String(post.communityName).trim(), topic]
      .filter(Boolean)
      .join(" - ");

    if (scopeLabel.textContent !== label) scopeLabel.textContent = label;

    // Remove o rótulo separado usado pela versão anterior para evitar duplicação.
    authorBlock.querySelector<HTMLElement>(".post-topic-v125")?.remove();
    card.dataset.uorquiPostId = post.id;

    syncRichNewsCard(card, post);
  });
}

function syncRichNewsCard(card: HTMLElement, post: PostMeta) {
  if (post.aiContentMode !== "news" || !post.sourceUrl || !post.sourceName) return;

  const sourceCard = card.querySelector<HTMLElement>(".ai-news-card");
  if (!sourceCard) return;

  const imageUrls = uniqueImageUrls([
    ...(Array.isArray(post.sourceImageUrls) ? post.sourceImageUrls : []),
    post.sourceImageUrl || "",
    sourceCard.querySelector<HTMLImageElement>("img")?.src || ""
  ]).slice(0, 4);
  const signature = `${post.id}|${imageUrls.join("|")}|${post.sourceUrl}`;

  if (sourceCard.dataset.uorquiNewsSignature === signature && sourceCard.classList.contains("uorqui-news-inline-v126")) return;

  const wrapper = document.createElement("div");
  wrapper.className = "ai-news-card uorqui-news-inline-v126";
  wrapper.dataset.uorquiNewsSignature = signature;

  if (imageUrls.length) {
    const gallery = document.createElement("div");
    gallery.className = `uorqui-news-gallery-v126 ${gallerySizeClass(imageUrls.length)}`;

    imageUrls.forEach((url, index) => {
      const figure = document.createElement("figure");
      const image = document.createElement("img");
      image.src = url;
      image.alt = index === 0 ? String(post.sourceHeadline || "Imagem da notícia") : `Imagem ${index + 1} da notícia`;
      image.loading = index === 0 ? "eager" : "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => {
        figure.remove();
        rebalanceGallery(gallery);
      });
      figure.appendChild(image);
      gallery.appendChild(figure);
    });

    wrapper.appendChild(gallery);
  }

  const footer = document.createElement("div");
  footer.className = "uorqui-news-source-row-v126";

  const sourceCopy = sourceCard.querySelector<HTMLElement>(".ai-news-source")?.cloneNode(true) as HTMLElement | null;
  if (sourceCopy) {
    footer.appendChild(sourceCopy);
  } else {
    const copy = document.createElement("span");
    copy.className = "ai-news-source";
    const title = document.createElement("span");
    title.textContent = `Fonte: ${post.sourceName}`;
    copy.appendChild(title);
    footer.appendChild(copy);
  }

  const sourceLink = document.createElement("a");
  sourceLink.className = "uorqui-news-source-link-v126";
  sourceLink.href = post.sourceUrl;
  sourceLink.target = "_blank";
  sourceLink.rel = "noopener noreferrer";
  sourceLink.textContent = "Ver fonte original ↗";
  sourceLink.setAttribute("aria-label", `Abrir fonte original: ${post.sourceName}`);
  footer.appendChild(sourceLink);

  wrapper.appendChild(footer);
  sourceCard.replaceWith(wrapper);
}

function uniqueImageUrls(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const url = String(value || "").trim();
    if (!/^https?:\/\//i.test(url)) return;
    const key = url.replace(/#.*$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    result.push(url);
  });
  return result;
}

function gallerySizeClass(length: number) {
  if (length <= 1) return "one";
  if (length === 2) return "two";
  if (length === 3) return "three";
  return "four";
}

function rebalanceGallery(gallery: HTMLElement) {
  const count = gallery.querySelectorAll("figure").length;
  gallery.classList.remove("one", "two", "three", "four");
  if (!count) {
    gallery.remove();
    return;
  }
  gallery.classList.add(gallerySizeClass(count));
}

function installRichNewsStyles() {
  if (document.getElementById("uorqui-rich-news-v126-style")) return;
  const style = document.createElement("style");
  style.id = "uorqui-rich-news-v126-style";
  style.textContent = `
    .ai-news-card.uorqui-news-inline-v126 {
      display: block;
      overflow: hidden;
      cursor: default;
      text-decoration: none;
    }
    .uorqui-news-gallery-v126 {
      display: grid;
      gap: 2px;
      width: 100%;
      overflow: hidden;
      background: rgba(127,127,127,.12);
    }
    .uorqui-news-gallery-v126 figure {
      min-width: 0;
      min-height: 0;
      margin: 0;
      overflow: hidden;
      background: rgba(127,127,127,.08);
    }
    .uorqui-news-gallery-v126 img {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 150px;
      max-height: 360px;
      object-fit: cover;
    }
    .uorqui-news-gallery-v126.one {
      grid-template-columns: 1fr;
    }
    .uorqui-news-gallery-v126.one figure {
      aspect-ratio: 16 / 9;
    }
    .uorqui-news-gallery-v126.two {
      grid-template-columns: repeat(2, minmax(0,1fr));
    }
    .uorqui-news-gallery-v126.two figure {
      aspect-ratio: 1 / 1;
    }
    .uorqui-news-gallery-v126.three,
    .uorqui-news-gallery-v126.four {
      grid-template-columns: repeat(2, minmax(0,1fr));
      grid-template-rows: repeat(2, minmax(120px, 1fr));
      max-height: 420px;
    }
    .uorqui-news-gallery-v126.three figure:first-child {
      grid-row: 1 / span 2;
    }
    .uorqui-news-source-row-v126 {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
    }
    .uorqui-news-source-row-v126 .ai-news-source {
      min-width: 0;
      padding: 0;
    }
    .uorqui-news-source-link-v126 {
      flex: 0 0 auto;
      font-size: 12px;
      font-weight: 650;
      text-decoration: none;
      white-space: nowrap;
    }
    @media (max-width: 560px) {
      .uorqui-news-gallery-v126 img {
        min-height: 110px;
        max-height: 300px;
      }
      .uorqui-news-gallery-v126.three,
      .uorqui-news-gallery-v126.four {
        grid-template-rows: repeat(2, minmax(92px, 1fr));
        max-height: 330px;
      }
      .uorqui-news-source-row-v126 {
        align-items: flex-start;
        flex-direction: column;
        gap: 5px;
      }
    }
  `;
  document.head.appendChild(style);
}

const postTopicObserver = new MutationObserver(syncPostTopics);
postTopicObserver.observe(document.documentElement, { childList: true, subtree: true });
syncPostTopics();
