import { auth } from "./firebase";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

const inFlightMutations = new Map<string, Promise<any>>();
const mediaUrlCache = new Map<string, Promise<string>>();
const resolvedMediaUrls = new Map<string, string>();

function mutationKey(path: string, init: RequestInit) {
  const method = String(init.method || "GET").toUpperCase();
  let bodyKey = "";
  if (typeof init.body === "string") bodyKey = init.body.slice(0, 1000);
  return `${method}:${path}:${bodyKey}`;
}

async function executeApi<T>(path: string, init: RequestInit = {}): Promise<T> {
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

  return payload as T;
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const method = String(init.method || "GET").toUpperCase();

  if (method === "GET" || method === "HEAD") {
    return executeApi<T>(path, init);
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

export function cachedMediaBlobUrl(mediaId: string): string {
  return resolvedMediaUrls.get(mediaId) || "";
}

export function cacheMediaBlobUrl(mediaId: string, blob: Blob): string {
  const cached = resolvedMediaUrls.get(mediaId);
  if (cached) return cached;

  const url = URL.createObjectURL(blob);
  resolvedMediaUrls.set(mediaId, url);
  mediaUrlCache.set(mediaId, Promise.resolve(url));
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

    const token = await user.getIdToken();
    const response = await fetch(`/api/media/${encodeURIComponent(mediaId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      mediaUrlCache.delete(mediaId);
      throw new ApiError("Não foi possível carregar a mídia.", response.status);
    }

    const url = URL.createObjectURL(await response.blob());
    resolvedMediaUrls.set(mediaId, url);
    return url;
  })();

  mediaUrlCache.set(mediaId, request);
  return request;
}

export async function prefetchPostMedia(
  posts: Array<{ attachments?: Array<{ id: string; contentType?: string }> }>,
  maxImages = 16
): Promise<void> {
  const imageIds = Array.from(new Set(
    posts
      .flatMap((post) => post.attachments || [])
      .filter((attachment) => String(attachment.contentType || "").startsWith("image/"))
      .map((attachment) => attachment.id)
      .filter(Boolean)
  )).slice(0, maxImages);

  if (!imageIds.length) return;

  const concurrency = 6;
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
