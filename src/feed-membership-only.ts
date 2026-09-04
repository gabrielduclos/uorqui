export {};

type BootstrapLike = { communities?: Array<{ id?: string }> };
type SocialFeedPost = { scope?: string; communityId?: string };
type SocialFeedLike = { posts?: SocialFeedPost[] };

const upstreamFetch = globalThis.fetch.bind(globalThis);
const hiddenAttr = "data-uorqui-membership-hidden";
const customEmptyClass = "uorqui-membership-feed-empty";
let memberCommunityIds = new Set<string>();
let syncQueued = false;

function requestMeta(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : null;
  const method = String(init?.method || request?.method || "GET").toUpperCase();
  const raw = request?.url || String(input || "");
  try {
    return { method, url: new URL(raw, location.origin) };
  } catch {
    return { method, url: null as URL | null };
  }
}

function jsonResponse(value: unknown, original: Response) {
  const headers = new Headers(original.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.delete("Content-Length");
  return new Response(JSON.stringify(value), {
    status: original.status,
    statusText: original.statusText,
    headers,
  });
}

function rememberMemberships(value: BootstrapLike | null | undefined) {
  const ids = Array.isArray(value?.communities)
    ? value!.communities!
      .map((community) => String(community?.id || "").trim())
      .filter(Boolean)
    : [];
  memberCommunityIds = new Set(ids);
  scheduleSync();
}

function filterSocialFeed(value: SocialFeedLike | null | undefined) {
  if (!value || !Array.isArray(value.posts)) return value;
  return {
    ...value,
    posts: value.posts.filter((post) =>
      post?.scope === "community" &&
      Boolean(post.communityId) &&
      memberCommunityIds.has(String(post.communityId))
    ),
  };
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const meta = requestMeta(input, init);
  const response = await upstreamFetch(input, init);
  if (!response.ok || meta.method !== "GET" || !meta.url) return response;

  if (meta.url.pathname === "/api/bootstrap" || meta.url.pathname === "/api/bootstrap-refresh") {
    try {
      rememberMemberships(await response.clone().json() as BootstrapLike);
    } catch {}
    return response;
  }

  if (meta.url.pathname === "/api/social/feed") {
    try {
      const value = await response.clone().json() as SocialFeedLike;
      return jsonResponse(filterSocialFeed(value), response);
    } catch {
      return response;
    }
  }

  return response;
};

function activeHomeTab() {
  const button = document.querySelector<HTMLElement>(".topbar .tabs button.active");
  return (button?.textContent || "").trim().toLocaleLowerCase("pt-BR");
}

function restoreFeed() {
  document.querySelectorAll<HTMLElement>(`[${hiddenAttr}="1"]`).forEach((element) => {
    element.style.removeProperty("display");
    element.removeAttribute(hiddenAttr);
  });
  document.querySelectorAll<HTMLElement>(".feed-community-suggestions[data-uorqui-membership-suggestions='1']").forEach((element) => {
    element.style.removeProperty("display");
    element.removeAttribute("data-uorqui-membership-suggestions");
  });
  document.querySelector(`.${customEmptyClass}`)?.remove();
}

function syncFeed() {
  syncQueued = false;
  const home = document.querySelector<HTMLElement>(".social-home");
  const feed = home?.querySelector<HTMLElement>(".social-feed");
  if (!home || !feed || activeHomeTab() !== "para você") {
    restoreFeed();
    return;
  }

  const suggestions = feed.querySelector<HTMLElement>(".feed-community-suggestions");
  if (suggestions) {
    suggestions.style.display = "none";
    suggestions.setAttribute("data-uorqui-membership-suggestions", "1");
  }

  const cards = Array.from(feed.querySelectorAll<HTMLElement>(".post-card"));
  for (const card of cards) {
    const isWorld = Boolean(card.querySelector(".scope.world"));
    if (isWorld) {
      card.style.display = "none";
      card.setAttribute(hiddenAttr, "1");
    } else if (card.getAttribute(hiddenAttr) === "1") {
      card.style.removeProperty("display");
      card.removeAttribute(hiddenAttr);
    }
  }

  const visibleCards = cards.filter((card) => card.getAttribute(hiddenAttr) !== "1");
  const loading = Boolean(feed.querySelector(".feed-loading-spinner"));
  const nativeEmpty = feed.querySelector<HTMLElement>(".empty-state:not(.uorqui-membership-feed-empty)");

  if (nativeEmpty) {
    const title = nativeEmpty.querySelector<HTMLElement>("h3");
    if (title) title.textContent = "Nada ainda";
  }

  let customEmpty = feed.querySelector<HTMLElement>(`.${customEmptyClass}`);
  if (!visibleCards.length && !loading && !nativeEmpty) {
    if (!customEmpty) {
      customEmpty = document.createElement("div");
      customEmpty.className = `empty-state ${customEmptyClass}`;
      customEmpty.innerHTML = "<h3>Nada ainda</h3><p>As publicações das comunidades que você participa aparecerão aqui.</p>";
      feed.appendChild(customEmpty);
    }
  } else {
    customEmpty?.remove();
  }
}

function scheduleSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(syncFeed);
}

const observer = new MutationObserver(scheduleSync);
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
window.addEventListener("uorqui:realtime-refresh", scheduleSync);
window.addEventListener("popstate", scheduleSync);
window.addEventListener("focus", scheduleSync);
scheduleSync();
