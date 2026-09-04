import { auth } from "./firebase";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

const inFlightMutations = new Map<string, Promise<any>>();
const inFlightReads = new Map<string, Promise<any>>();
const mediaUrlCache = new Map<string, Promise<string>>();
const resolvedMediaUrls = new Map<string, string>();
const MEDIA_CACHE_VERSION = "uorqui-media-v122";
const MEDIA_CACHE_TTL = 15 * 60 * 1000;
const BOOTSTRAP_FULL_REFRESH_TTL = 5 * 60 * 1000;
let initialBootstrapNormalized = false;
let bootstrapSnapshot: any = null;
let bootstrapSnapshotUid = "";
let bootstrapFullAt = 0;
let bootstrapSmokeBypassUntil = 0;

function mutationKey(path: string, init: RequestInit) {
  const method = String(init.method || "GET").toUpperCase();
  let bodyKey = "";
  if (typeof init.body === "string") bodyKey = init.body.slice(0, 1000);
  return `${method}:${path}:${bodyKey}`;
}

function bootstrapCompanyId(path: string) {
  if (!path.startsWith("/bootstrap")) return "";
  const queryIndex = path.indexOf("?");
  if (queryIndex < 0) return "";
  return new URLSearchParams(path.slice(queryIndex + 1)).get("companyId") || "";
}

function sharedCompanyId() {
  try {
    return new URLSearchParams(window.location.search).get("company") || "";
  } catch {
    return "";
  }
}

function bootstrapPathForCompany(path: string, companyId: string) {
  const queryIndex = path.indexOf("?");
  const params = new URLSearchParams(queryIndex >= 0 ? path.slice(queryIndex + 1) : "");
  params.set("companyId", companyId);
  return `/bootstrap?${params.toString()}`;
}

function normalizeReadPath(path: string) {
  if (!path.startsWith("/bootstrap")) return path;

  const requestedCompanyId = bootstrapCompanyId(path);
  const storedCompanyId = localStorage.getItem("uorqui-company") || "";
  const sharedCompany = sharedCompanyId();
  const firstBootstrap = !initialBootstrapNormalized;
  initialBootstrapNormalized = true;

  if (firstBootstrap && requestedCompanyId && sharedCompany === requestedCompanyId) {
    if (storedCompanyId !== requestedCompanyId) {
      localStorage.setItem("uorqui-company", requestedCompanyId);
    }
    return path;
  }

  if (storedCompanyId && requestedCompanyId && requestedCompanyId !== storedCompanyId) {
    return bootstrapPathForCompany(path, storedCompanyId);
  }

  if (storedCompanyId && !requestedCompanyId) {
    return `/bootstrap?companyId=${encodeURIComponent(storedCompanyId)}`;
  }

  return path;
}

function bootstrapRefreshPath(path: string) {
  const queryIndex = path.indexOf("?");
  return queryIndex >= 0
    ? `/bootstrap-refresh${path.slice(queryIndex)}`
    : "/bootstrap-refresh";
}

function canUseBootstrapRefresh(uid: string, path: string) {
  if (!bootstrapSnapshot || bootstrapSnapshotUid !== uid || !bootstrapFullAt) return false;
  if (Date.now() - bootstrapFullAt >= BOOTSTRAP_FULL_REFRESH_TTL) return false;

  const requestedCompanyId = bootstrapCompanyId(path);
  const currentCompanyId = String(bootstrapSnapshot?.selectedCompanyId || "");
  // Troca de empresa precisa do bootstrap completo para repor os blocos
  // administrativos (members/allCompanyCommunities) da empresa correta.
  if (requestedCompanyId && requestedCompanyId !== currentCompanyId) return false;
  return true;
}

function mergePostRuntimeState(nextPost: any, previousPost: any) {
  if (!previousPost) {
    return {
      ...nextPost,
      liked: Boolean(nextPost?.liked),
      hasRead: Boolean(nextPost?.hasRead),
      myPollOptionId: nextPost?.myPollOptionId || ""
    };
  }
  return {
    ...previousPost,
    ...nextPost,
    liked: nextPost?.liked === undefined ? Boolean(previousPost?.liked) : Boolean(nextPost.liked),
    hasRead: nextPost?.hasRead === undefined ? Boolean(previousPost?.hasRead) : Boolean(nextPost.hasRead),
    myPollOptionId: nextPost?.myPollOptionId === undefined
      ? (previousPost?.myPollOptionId || "")
      : (nextPost?.myPollOptionId || "")
  };
}

function mergeBootstrapRefresh(refreshPayload: any) {
  if (!bootstrapSnapshot || !refreshPayload || typeof refreshPayload !== "object") return refreshPayload;

  const previousPostMap = new Map<string, any>();
  for (const post of [
    ...(Array.isArray(bootstrapSnapshot.posts) ? bootstrapSnapshot.posts : []),
    ...(Array.isArray(bootstrapSnapshot.worldPosts) ? bootstrapSnapshot.worldPosts : [])
  ]) {
    if (post?.id) previousPostMap.set(String(post.id), post);
  }

  const posts = Array.isArray(refreshPayload.posts)
    ? refreshPayload.posts.map((post: any) => mergePostRuntimeState(post, previousPostMap.get(String(post?.id || ""))))
    : bootstrapSnapshot.posts;
  const worldPosts = Array.isArray(refreshPayload.worldPosts)
    ? refreshPayload.worldPosts.map((post: any) => mergePostRuntimeState(post, previousPostMap.get(String(post?.id || ""))))
    : bootstrapSnapshot.worldPosts;

  return {
    ...bootstrapSnapshot,
    ...refreshPayload,
    communities: Array.isArray(refreshPayload.communities)
      ? refreshPayload.communities
      : bootstrapSnapshot.communities,
    communityMap: refreshPayload.communityMap && typeof refreshPayload.communityMap === "object"
      ? { ...(bootstrapSnapshot.communityMap || {}), ...refreshPayload.communityMap }
      : bootstrapSnapshot.communityMap,
    posts,
    worldPosts,
    notifications: Array.isArray(refreshPayload.notifications)
      ? refreshPayload.notifications
      : bootstrapSnapshot.notifications,
    // O refresh leve deliberadamente não consulta esses blocos caros.
    allCompanyCommunities: Array.isArray(refreshPayload.allCompanyCommunities)
      ? refreshPayload.allCompanyCommunities
      : bootstrapSnapshot.allCompanyCommunities,
    members: Array.isArray(refreshPayload.members)
      ? refreshPayload.members
      : bootstrapSnapshot.members
  };
}

function shouldInvalidateBootstrapSnapshot(path: string) {
  if (path === "/me" || path.startsWith("/superadmin/companies/")) return true;
  if (path.startsWith("/companies/")) return true;
  if (path === "/companies") return true;
  if (path.startsWith("/community-join-requests/")) return true;
  if (path === "/communities") return true;
  if (path.startsWith("/communities/")) {
    // Preferência de push não altera a estrutura do bootstrap.
    if (path.includes("/notification-preference")) return false;
    // Curtidas/comentários/posts não passam por /communities/*; aqui ficam
    // somente entrada, saída, membros, convites e gestão da comunidade.
    return true;
  }
  return false;
}

function clearBootstrapSnapshot() {
  bootstrapSnapshot = null;
  bootstrapSnapshotUid = "";
  bootstrapFullAt = 0;
  bootstrapSmokeBypassUntil = 0;
}

function patchSnapshotPost(postId: string, patch: Record<string, any>) {
  if (!bootstrapSnapshot || !postId) return;
  const patchList = (items: any[]) => (Array.isArray(items)
    ? items.map(item => String(item?.id || "") === postId ? { ...item, ...patch } : item)
    : items);
  bootstrapSnapshot = {
    ...bootstrapSnapshot,
    posts: patchList(bootstrapSnapshot.posts),
    worldPosts: patchList(bootstrapSnapshot.worldPosts)
  };
}

function applyMutationToBootstrapSnapshot(path: string, payload: any) {
  if (!bootstrapSnapshot || !payload || typeof payload !== "object") return;

  const reactionMatch = path.match(/^\/posts\/([^/]+)\/reaction$/);
  if (reactionMatch && payload.liked !== undefined) {
    patchSnapshotPost(decodeURIComponent(reactionMatch[1]), {
      liked: Boolean(payload.liked),
      reactionCount: Number(payload.reactionCount || 0)
    });
    return;
  }

  const readMatch = path.match(/^\/posts\/([^/]+)\/read$/);
  if (readMatch && payload.ok) {
    patchSnapshotPost(decodeURIComponent(readMatch[1]), { hasRead: true });
    return;
  }

  const pollMatch = path.match(/^\/posts\/([^/]+)\/poll-vote$/);
  if (pollMatch && payload.optionId) {
    patchSnapshotPost(decodeURIComponent(pollMatch[1]), {
      myPollOptionId: String(payload.optionId || ""),
      pollOptions: Array.isArray(payload.pollOptions) ? payload.pollOptions : undefined,
      pollTotalVotes: Number(payload.pollTotalVotes || 0)
    });
  }
}

async function executeApi<T>(path: string, init: RequestInit = {}, bootstrapRetry = false): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiError("Faça login para continuar.", 401);

  if (bootstrapSnapshotUid && bootstrapSnapshotUid !== user.uid) clearBootstrapSnapshot();

  const method = String(init.method || "GET").toUpperCase();
  const isBootstrapRead = (method === "GET" || method === "HEAD") && path.startsWith("/bootstrap");
  let transportPath = path;
  let usingBootstrapRefresh = false;

  if (isBootstrapRead && canUseBootstrapRefresh(user.uid, path)) {
    transportPath = bootstrapRefreshPath(path);
    usingBootstrapRefresh = true;
  }

  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const selectedCompanyId = localStorage.getItem("uorqui-company") || "";
  if (selectedCompanyId) headers.set("X-Uorqui-Company", selectedCompanyId);

  if (
    init.body &&
    !(init.body instanceof Blob) &&
    !(init.body instanceof ArrayBuffer) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  let response = await fetch(`/api${transportPath}`, { ...init, headers });

  // Endpoint leve ausente/perfil removido: volta ao bootstrap completo. 429 e
  // erros transitórios do Firestore NÃO fazem retry pesado para não duplicar
  // leituras quando a cota estiver pressionada.
  if (usingBootstrapRefresh && [404, 409, 501].includes(response.status)) {
    clearBootstrapSnapshot();
    usingBootstrapRefresh = false;
    transportPath = path;
    response = await fetch(`/api${transportPath}`, { ...init, headers });
  }

  const type = response.headers.get("content-type") || "";
  let payload: any = type.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new ApiError(
      typeof payload === "string" ? payload : payload?.error || "Erro no Uorqui.",
      response.status
    );
  }

  if (isBootstrapRead && payload && typeof payload === "object" && !Array.isArray(payload)) {
    if (usingBootstrapRefresh) {
      payload = mergeBootstrapRefresh(payload);
    } else {
      bootstrapFullAt = Date.now();
    }
    bootstrapSnapshot = payload;
    bootstrapSnapshotUid = user.uid;

    // App.tsx executa um /social/feed apenas como smoke test logo depois do
    // bootstrap. Ele não usa esse resultado. Marcamos uma única chamada para
    // ser respondida localmente e evitamos repetir uma consulta social pesada
    // em todo evento realtime.
    bootstrapSmokeBypassUntil = Date.now() + 2500;

    const activeCompanyId = localStorage.getItem("uorqui-company") || "";
    const responseCompanyId = String(payload.selectedCompanyId || "");
    const availableCompanyIds = new Set(
      Array.isArray(payload.companies)
        ? payload.companies.map((company: any) => String(company?.id || "")).filter(Boolean)
        : []
    );

    if (activeCompanyId && responseCompanyId && activeCompanyId !== responseCompanyId) {
      if (!bootstrapRetry && availableCompanyIds.has(activeCompanyId)) {
        return executeApi<T>(bootstrapPathForCompany(path, activeCompanyId), init, true);
      }

      if (!availableCompanyIds.has(activeCompanyId)) {
        localStorage.setItem("uorqui-company", responseCompanyId);
      }
    }
  }

  if (method !== "GET" && method !== "HEAD") {
    if (shouldInvalidateBootstrapSnapshot(path)) clearBootstrapSnapshot();
    else applyMutationToBootstrapSnapshot(path, payload);
  }

  return payload as T;
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const method = String(init.method || "GET").toUpperCase();
  const effectivePath = method === "GET" || method === "HEAD"
    ? normalizeReadPath(path)
    : path;

  // O refresh() de App.tsx chama /social/feed logo após o bootstrap somente
  // para validar o formato da rota. A resposta não alimenta o estado nessa
  // chamada. Bypass único evita uma segunda bateria de leituras a cada evento.
  if (
    (method === "GET" || method === "HEAD") &&
    effectivePath === "/social/feed" &&
    bootstrapSmokeBypassUntil > Date.now()
  ) {
    bootstrapSmokeBypassUntil = 0;
    return {
      followingCount: 0,
      posts: [],
      communities: []
    } as T;
  }

  if (method === "GET" || method === "HEAD") {
    const key = `${method}:${effectivePath}`;
    const existing = inFlightReads.get(key);
    if (existing) return existing as Promise<T>;
    const request = executeApi<T>(effectivePath, init).finally(() => inFlightReads.delete(key));
    inFlightReads.set(key, request);
    return request;
  }

  const key = mutationKey(path, init);
  const existing = inFlightMutations.get(key);
  if (existing) return existing as Promise<T>;

  const request = executeApi<T>(path, init).finally(() => {
    inFlightMutations.delete(key);
  });

  inFlightMutations.set(key, request);
  return request;
}

function mediaCacheName() {
  const uid = auth.currentUser?.uid || "anonymous";
  return `${MEDIA_CACHE_VERSION}-${uid}`;
}

function mediaCacheRequest(mediaId: string) {
  return new Request(`${location.origin}/__uorqui_media_cache__/${encodeURIComponent(mediaId)}`);
}

async function persistentMediaBlob(mediaId: string): Promise<Blob | null> {
  if (!("caches" in window) || !auth.currentUser) return null;
  try {
    const cache = await caches.open(mediaCacheName());
    const key = mediaCacheRequest(mediaId);
    const cached = await cache.match(key);
    if (!cached) return null;
    const cachedAt = Number(cached.headers.get("X-Uorqui-Cached-At") || "0");
    if (!cachedAt || Date.now() - cachedAt > MEDIA_CACHE_TTL) {
      await cache.delete(key);
      return null;
    }
    return cached.blob();
  } catch {
    return null;
  }
}

async function persistMediaBlob(mediaId: string, blob: Blob) {
  if (!("caches" in window) || !auth.currentUser) return;
  try {
    const cache = await caches.open(mediaCacheName());
    await cache.put(mediaCacheRequest(mediaId), new Response(blob, {
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "X-Uorqui-Cached-At": String(Date.now())
      }
    }));
  } catch {
    // Cache persistente é uma otimização. A mídia continua funcionando sem ele.
  }
}

export async function clearCurrentUserMediaCache() {
  if (!("caches" in window)) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await caches.delete(`${MEDIA_CACHE_VERSION}-${uid}`);
  } catch {}
}

export function cachedMediaBlobUrl(mediaId: string): string {
  return resolvedMediaUrls.get(mediaId) || "";
}

export function cacheMediaBlobUrl(mediaId: string, blob: Blob): string {
  const cached = resolvedMediaUrls.get(mediaId);
  if (cached) return cached;

  const url = URL.createObjectURL(blob);
  resolvedMediaUrls.set(mediaId, url);
  mediaUrlCache.set(mediaId, Promise.resolve(url));
  void persistMediaBlob(mediaId, blob);
  return url;
}

export async function mediaBlobUrl(mediaId: string): Promise<string> {
  const resolved = resolvedMediaUrls.get(mediaId);
  if (resolved) return resolved;

  const cached = mediaUrlCache.get(mediaId);
  if (cached) return cached;

  const request = (async () => {
    const user = auth.currentUser;
    if (!user) throw new ApiError("Faça login para continuar.", 401);

    const persisted = await persistentMediaBlob(mediaId);
    if (persisted) {
      const url = URL.createObjectURL(persisted);
      resolvedMediaUrls.set(mediaId, url);
      return url;
    }

    const token = await user.getIdToken();
    const response = await fetch(`/api/media/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "force-cache"
    });

    if (!response.ok) {
      throw new ApiError("Não foi possível carregar a mídia.", response.status);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    resolvedMediaUrls.set(mediaId, url);
    void persistMediaBlob(mediaId, blob);
    return url;
  })().catch((error) => {
    mediaUrlCache.delete(mediaId);
    throw error;
  });

  mediaUrlCache.set(mediaId, request);
  return request;
}

function prioritizedImageIds(
  posts: Array<{ attachments?: Array<{ id: string; contentType?: string }> }>,
  maxImages: number
) {
  const firstPerPost: string[] = [];
  const remaining: string[] = [];

  for (const post of posts) {
    const images = (post.attachments || [])
      .filter((attachment) => String(attachment.contentType || "").startsWith("image/") && attachment.id)
      .map((attachment) => attachment.id);
    if (!images.length) continue;
    firstPerPost.push(images[0]);
    remaining.push(...images.slice(1));
  }

  return Array.from(new Set([...firstPerPost, ...remaining])).slice(0, maxImages);
}

export async function prefetchPostMedia(
  posts: Array<{ attachments?: Array<{ id: string; contentType?: string }> }>,
  maxImages = 16
): Promise<void> {
  const imageIds = prioritizedImageIds(posts, maxImages);
  if (!imageIds.length) return;

  const concurrency = 3;
  let cursor = 0;

  const worker = async () => {
    while (cursor < imageIds.length) {
      const index = cursor++;
      await mediaBlobUrl(imageIds[index]).catch(() => "");
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, imageIds.length) }, () => worker())
  );
}
