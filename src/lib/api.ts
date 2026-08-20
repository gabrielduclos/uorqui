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

  // GETs may run in parallel. Write actions are deduplicated while the same
  // request is in flight, preventing accidental double submits/double clicks.
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

export async function mediaBlobUrl(mediaId: string): Promise<string> {
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

    return URL.createObjectURL(await response.blob());
  })();

  mediaUrlCache.set(mediaId, request);
  return request;
}

export async function prefetchPostMedia(
  posts: Array<{ attachments?: Array<{ id: string; contentType?: string }> }>
): Promise<void> {
  const imageIds = Array.from(new Set(
    posts
      .flatMap((post) => post.attachments || [])
      .filter((attachment) => String(attachment.contentType || "").startsWith("image/"))
      .map((attachment) => attachment.id)
      .filter(Boolean)
  ));

  if (!imageIds.length) return;

  // Load images before the new feed is swapped into view, so text and photos
  // appear together instead of each image popping in afterward.
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
