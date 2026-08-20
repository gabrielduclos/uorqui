import { useEffect, useState, type FormEvent } from "react";
import { Download, FileText, Heart, MessageCircle, Send, Share2, ShieldAlert, Trash2 } from "lucide-react";
import { Avatar } from "./Avatar";
import { api, mediaBlobUrl } from "../lib/api";
import type { Attachment, Comment, Community, Post } from "../types";

function relative(value?: string) {
  if (!value) return "";
  const delta = Date.now() - new Date(value).getTime();
  const min = Math.max(0, Math.floor(delta / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

function count(value = 0) {
  return new Intl.NumberFormat("pt-BR", {
    notation: value > 999 ? "compact" : "standard",
    maximumFractionDigits: 1
  }).format(value);
}

function formatBytes(size = 0) {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const isImage = String(attachment.contentType || "").startsWith("image/");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setUrl("");
    setFailed(false);

    mediaBlobUrl(attachment.id)
      .then((next) => {
        objectUrl = next;
        if (active) setUrl(next);
      })
      .catch(() => active && setFailed(true));

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  if (isImage) {
    return (
      <div className="post-image-wrap">
        {url ? (
          <img className="post-image" src={url} alt={attachment.name || "Foto da publicação"} loading="lazy" />
        ) : (
          <div className="post-image-loading">{failed ? "Não foi possível carregar a foto." : "Carregando foto…"}</div>
        )}
      </div>
    );
  }

  return (
    <div className="post-file">
      <div className="post-file-icon"><FileText size={19} /></div>
      <div className="post-file-copy">
        <strong>{attachment.name || "Arquivo"}</strong>
        <small>{formatBytes(attachment.size)}</small>
      </div>
      {url && (
        <a className="post-file-download" href={url} download={attachment.name || "arquivo"} aria-label={`Baixar ${attachment.name || "arquivo"}`}>
          <Download size={17} />
        </a>
      )}
    </div>
  );
}

export function PostCard({
  post,
  companyName,
  community,
  onLike,
  onRead,
  canDelete = false,
  onDelete,
  currentUid,
  canAdmin = false,
  onChanged,
  showToast,
}: {
  post: Post;
  companyName?: string;
  community?: Community;
  onLike: (post: Post) => Promise<void> | void;
  onRead: (post: Post) => Promise<void> | void;
  canDelete?: boolean;
  onDelete?: (post: Post) => Promise<void> | void;
  currentUid?: string;
  canAdmin?: boolean;
  onChanged?: () => Promise<void> | void;
  showToast?: (message: string) => void;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsBusy, setCommentsBusy] = useState(false);
  const [localCommentCount, setLocalCommentCount] = useState(Number(post.commentCount || 0));

  useEffect(() => {
    setLocalCommentCount(Number(post.commentCount || 0));
  }, [post.commentCount]);

  const scope = post.scope === "world"
    ? "🌎 Mundo"
    : post.scope === "community"
      ? `Comunidade · ${community?.name || post.communityName || "Comunidade"}`
      : `🏢 ${companyName || post.companyName || "Empresa"}`;

  const loadComments = async () => {
    setCommentsBusy(true);
    try {
      const result = await api<{ comments: Comment[] }>(`/posts/${post.id}/comments`);
      setComments(result.comments);
      setLocalCommentCount(result.comments.length);
      setCommentsLoaded(true);
    } catch (error) {
      showToast?.(error instanceof Error ? error.message : "Não foi possível carregar as respostas.");
    } finally {
      setCommentsBusy(false);
    }
  };

  const toggleComments = async () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next && !commentsLoaded && !post.deletedByAdmin) await loadComments();
  };

  const addComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("text") || "").trim();
    if (!text) return;
    setCommentsBusy(true);
    try {
      const result = await api<{ comment: Comment }>(`/posts/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ text })
      });
      setComments((current) => [...current, result.comment]);
      setLocalCommentCount((current) => current + 1);
      form.reset();
      await onChanged?.();
    } catch (error) {
      showToast?.(error instanceof Error ? error.message : "Não foi possível responder.");
    } finally {
      setCommentsBusy(false);
    }
  };

  const acceptSolution = async (commentId: string) => {
    try {
      await api(`/posts/${post.id}/solution`, {
        method: "POST",
        body: JSON.stringify({ commentId })
      });
      showToast?.("Solução marcada.");
      await onChanged?.();
    } catch (error) {
      showToast?.(error instanceof Error ? error.message : "Não foi possível marcar a solução.");
    }
  };

  return (
    <article className={`post-card ${post.deletedByAdmin ? "post-tombstone" : ""}`}>
      <header className="post-head">
        <Avatar name={post.authorName} mediaId={post.authorAvatarMediaId} />
        <div className="post-author">
          <div><strong>{post.authorName || "Usuário"}</strong><span> · {relative(post.deletedAt || post.createdAt)}</span></div>
          <small className={`scope ${post.scope}`}>{scope}</small>
        </div>
        {canDelete && onDelete && (
          <button className="post-delete" onClick={() => onDelete(post)} aria-label="Excluir publicação" title="Excluir publicação">
            <Trash2 size={17} />
          </button>
        )}
      </header>

      {post.deletedByAdmin ? (
        <div className="admin-deleted-message">
          <ShieldAlert size={19} />
          <div>
            <strong>Publicação apagada por um administrador</strong>
            <p>O conteúdo desta publicação foi removido pela administração da empresa.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="post-content">
            {post.type === "announcement" ? (
              <div className="announcement">
                <small>📢 COMUNICADO{post.requiresReadReceipt ? " · LEITURA SOLICITADA" : ""}</small>
                <strong>{post.title || "Comunicado"}</strong>
                <p>{post.text}</p>
                {post.requiresReadReceipt && (
                  <button className={`btn small ${post.hasRead ? "secondary" : ""}`} disabled={post.hasRead} onClick={() => onRead(post)}>
                    {post.hasRead ? "✓ Leitura confirmada" : "Confirmar leitura"}
                  </button>
                )}
              </div>
            ) : (
              <>
                {post.type === "question" && <span className="post-kind">PERGUNTA</span>}
                <p>{post.text}</p>
                {post.acceptedCommentId && <span className="solution">✓ Solução encontrada</span>}
              </>
            )}
            {!!post.attachments?.length && (
              <div className={`post-attachments ${post.attachments.length === 1 ? "one" : ""}`}>
                {post.attachments.map((attachment) => <AttachmentPreview key={attachment.id} attachment={attachment} />)}
              </div>
            )}
          </div>

          <footer className="post-actions">
            <button className={post.liked ? "liked" : ""} onClick={() => onLike(post)} aria-label="Curtir">
              <Heart size={18} fill={post.liked ? "currentColor" : "none"} />
              <span className="action-count">{count(post.reactionCount)}</span>
              <span className="action-label">curtidas</span>
            </button>
            <button className={commentsOpen ? "active" : ""} onClick={toggleComments} aria-label="Abrir respostas">
              <MessageCircle size={18} />
              <span className="action-count">{count(localCommentCount)}</span>
              <span className="action-label">comentários</span>
            </button>
            {post.scope !== "world" && <button aria-label="Compartilhar"><Share2 size={18} /></button>}
          </footer>

          {commentsOpen && (
            <section className="inline-comments">
              {commentsBusy && !commentsLoaded && <div className="inline-comments-loading">Carregando comentários…</div>}
              <div className="inline-comment-list">
                {comments.map((comment) => (
                  <article className="inline-comment" key={comment.id}>
                    <Avatar name={comment.authorName} mediaId={comment.authorAvatarMediaId} size={34} />
                    <div className="inline-comment-body">
                      <strong>{comment.authorName || "Usuário"}</strong>
                      <p>{comment.text}</p>
                      {post.acceptedCommentId === comment.id && <span className="solution">✓ Solução aceita</span>}
                      {!post.acceptedCommentId && post.type === "question" && (post.authorUid === currentUid || canAdmin) && post.authorUid !== comment.authorUid && (
                        <button className="text-button solution-button" onClick={() => acceptSolution(comment.id)}>✓ Marcar como solução</button>
                      )}
                    </div>
                  </article>
                ))}
                {commentsLoaded && !comments.length && <p className="no-comments">Nenhum comentário ainda.</p>}
              </div>
              <form className="inline-comment-form" onSubmit={addComment}>
                <textarea name="text" rows={2} required maxLength={3000} placeholder="Escreva um comentário…" />
                <button className="btn small" disabled={commentsBusy}><Send size={15} /> Comentar</button>
              </form>
            </section>
          )}
        </>
      )}
    </article>
  );
}
