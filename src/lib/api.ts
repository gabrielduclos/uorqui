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
let initialBootstrapNormalized = false;

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

async function executeApi<T>(path: string, init: RequestInit = {}, bootstrapRetry = false): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiError("Faça login para continuar.", 401);

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

  const response = await fetch(`/api${path}`, { ...init, headers });
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new ApiError(
      typeof payload === "string" ? payload : payload?.error || "Erro no Uorqui.",
      response.status
    );
  }

  const method = String(init.method || "GET").toUpperCase();
  if (
    (method === "GET" || method === "HEAD") &&
    path.startsWith("/bootstrap") &&
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload)
  ) {
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

  return payload as T;
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const method = String(init.method || "GET").toUpperCase();
  const effectivePath = method === "GET" || method === "HEAD"
    ? normalizeReadPath(path)
    : path;

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
