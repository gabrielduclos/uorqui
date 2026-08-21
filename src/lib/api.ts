import type { Comment, PollOption } from "../types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const commentsByPost = new Map<string, Comment[]>([
  ["demo-announcement", [
    { id: "comment-ann-1", postId: "demo-announcement", authorUid: "demo-beatriz", authorName: "Beatriz Alves", text: "Ótima novidade! O benefício também contempla dependentes?", reactionCount: 6, createdAt: ago(24) },
    { id: "comment-ann-2", postId: "demo-announcement", authorUid: "demo-mariana", authorName: "Mariana Costa", text: "Sim. Até três dependentes, com contratação direto pelo aplicativo.", reactionCount: 9, createdAt: ago(18) },
  ]],
  ["demo-question", [
    { id: "comment-question-1", postId: "demo-question", authorUid: "demo-beatriz", authorName: "Beatriz Alves", text: "Os clientes que recebem o checklist antes da primeira reunião avançam quase dois dias mais rápido.", reactionCount: 18, createdAt: ago(46) },
    { id: "comment-question-2", postId: "demo-question", authorUid: "demo-joao", authorName: "João Lima", text: "Consigo criar um gatilho no CRM e deixar os dados básicos pré-preenchidos.", reactionCount: 11, createdAt: ago(35) },
    { id: "comment-question-mine", postId: "demo-question", authorUid: "demo-me", authorName: "Daniel Carvalho", text: "Vamos testar com os próximos dez clientes e comparar com a coorte atual.", reactionCount: 7, liked: true, createdAt: ago(22) },
  ]],
  ["demo-event", [
    { id: "comment-event-1", postId: "demo-event", authorUid: "demo-ana", authorName: "Ana Ribeiro", text: "Quem estiver em visita poderá acompanhar a gravação depois?", reactionCount: 3, createdAt: ago(82) },
  ]],
  ["demo-world", [
    { id: "comment-world-1", postId: "demo-world", authorUid: "demo-lucas", authorName: "Lucas Martins", text: "Ficou excelente — e já gerou boas conversas com o mercado.", reactionCount: 14, createdAt: ago(170) },
  ]],
]);

const commentLikes = new Set(["comment-question-mine"]);
const polls = new Map<string, PollOption[]>([
  ["demo-poll", [
    { id: "poll-1", text: "Diagnóstico e perguntas", voteCount: 42 },
    { id: "poll-2", text: "Negociação de valor", voteCount: 67 },
    { id: "poll-3", text: "Demonstração do produto", voteCount: 31 },
    { id: "poll-4", text: "Contorno de objeções", voteCount: 54 },
  ]],
]);
const myPollVotes = new Map<string, string>();

function bodyOf(init: RequestInit) {
  try {
    return typeof init.body === "string" ? JSON.parse(init.body) : {};
  } catch {
    return {};
  }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const method = String(init.method || "GET").toUpperCase();

  const commentsMatch = path.match(/^\/posts\/([^/?]+)\/comments/);
  if (commentsMatch && method === "GET") {
    return { comments: [...(commentsByPost.get(commentsMatch[1]) || [])] } as T;
  }
  if (commentsMatch && method === "POST") {
    const postId = commentsMatch[1];
    const text = String(bodyOf(init).text || "").trim();
    if (!text) throw new ApiError("Escreva uma resposta.", 400);
    const comment: Comment = {
      id: `demo-comment-${Date.now()}`,
      postId,
      authorUid: "demo-me",
      authorName: "Daniel Carvalho",
      text,
      reactionCount: 0,
      createdAt: new Date().toISOString(),
    };
    commentsByPost.set(postId, [...(commentsByPost.get(postId) || []), comment]);
    return { comment } as T;
  }

  const commentMatch = path.match(/^\/comments\/([^/]+)(\/reaction)?$/);
  if (commentMatch && method === "POST" && commentMatch[2]) {
    const commentId = decodeURIComponent(commentMatch[1]);
    const comment = [...commentsByPost.values()].flat().find((item) => item.id === commentId);
    if (!comment) throw new ApiError("Resposta não encontrada.", 404);
    if (commentLikes.has(commentId)) {
      commentLikes.delete(commentId);
      comment.liked = false;
      comment.reactionCount = Math.max(0, Number(comment.reactionCount || 0) - 1);
    } else {
      commentLikes.add(commentId);
      comment.liked = true;
      comment.reactionCount = Number(comment.reactionCount || 0) + 1;
    }
    return { liked: comment.liked, reactionCount: comment.reactionCount } as T;
  }
  if (commentMatch && method === "DELETE") {
    const commentId = decodeURIComponent(commentMatch[1]);
    let postId = "";
    for (const [candidatePostId, comments] of commentsByPost) {
      if (!comments.some((item) => item.id === commentId)) continue;
      postId = candidatePostId;
      commentsByPost.set(candidatePostId, comments.filter((item) => item.id !== commentId));
      break;
    }
    if (!postId) throw new ApiError("Resposta não encontrada.", 404);
    return { post: { id: postId, commentCount: commentsByPost.get(postId)?.length || 0, isResolved: false, acceptedCommentId: "" } } as T;
  }

  const pollMatch = path.match(/^\/posts\/([^/]+)\/poll-vote$/);
  if (pollMatch && method === "POST") {
    const postId = pollMatch[1];
    const optionId = String(bodyOf(init).optionId || "");
    const options = (polls.get(postId) || []).map((option) => ({ ...option }));
    const previous = myPollVotes.get(postId);
    for (const option of options) {
      if (previous && option.id === previous) option.voteCount = Math.max(0, option.voteCount - 1);
      if (option.id === optionId) option.voteCount += 1;
    }
    myPollVotes.set(postId, optionId);
    polls.set(postId, options);
    return { optionId, pollOptions: options, pollTotalVotes: options.reduce((sum, option) => sum + option.voteCount, 0) } as T;
  }

  return { ok: true } as T;
}

const mediaUrls = new Map<string, string>();

export function cachedMediaBlobUrl(mediaId: string): string {
  return mediaUrls.get(mediaId) || "";
}

export function cacheMediaBlobUrl(mediaId: string, blob: Blob): string {
  const url = URL.createObjectURL(blob);
  mediaUrls.set(mediaId, url);
  return url;
}

export async function mediaBlobUrl(mediaId: string): Promise<string> {
  const url = mediaUrls.get(mediaId);
  if (url) return url;
  throw new ApiError("Mídia não disponível na demonstração.", 404);
}

export async function prefetchPostMedia(
  _posts: Array<{ attachments?: Array<{ id: string; contentType?: string }> }>,
  _maxImages = 16
): Promise<void> {}
