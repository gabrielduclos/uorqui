import { auth } from "./firebase";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiError("Faça login para continuar.", 401);
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof Blob) && !(init.body instanceof ArrayBuffer) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`/api${path}`, { ...init, headers });
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new ApiError(typeof payload === "string" ? payload : payload?.error || "Erro no Uorqui.", response.status);
  }
  return payload as T;
}

export async function mediaBlobUrl(mediaId: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new ApiError("Faça login para continuar.", 401);
  const token = await user.getIdToken();
  const response = await fetch(`/api/media/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new ApiError("Não foi possível carregar a mídia.", response.status);
  return URL.createObjectURL(await response.blob());
}
