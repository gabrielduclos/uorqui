import { Heart, MessageCircle, Share2 } from "lucide-react";
import { Avatar } from "./Avatar";
import type { Community, Post } from "../types";

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
  return new Intl.NumberFormat("pt-BR", { notation: value > 999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

export function PostCard({
  post,
  companyName,
  community,
  onLike,
  onComments,
  onRead,
}: {
  post: Post;
  companyName?: string;
  community?: Community;
  onLike: (post: Post) => void;
  onComments: (post: Post) => void;
  onRead: (post: Post) => void;
}) {
  const scope = post.scope === "world"
    ? "🌎 Mundo"
    : post.scope === "community"
      ? `Comunidade · ${community?.name || post.communityName || "Comunidade"}`
      : `🏢 ${companyName || post.companyName || "Empresa"}`;

  return (
    <article className="post-card">
      <header className="post-head">
        <Avatar name={post.authorName} mediaId={post.authorAvatarMediaId} />
        <div className="post-author">
          <div><strong>{post.authorName || "Usuário"}</strong><span> · {relative(post.createdAt)}</span></div>
          <small className={`scope ${post.scope}`}>{scope}</small>
        </div>
      </header>

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
          <div className="attachment-note">{post.attachments.length} anexo(s) — abra a publicação para visualizar</div>
        )}
      </div>

      <footer className="post-actions">
        <button className={post.liked ? "liked" : ""} onClick={() => onLike(post)} aria-label="Curtir">
          <Heart size={18} fill={post.liked ? "currentColor" : "none"} /> <span>{count(post.reactionCount)}</span>
        </button>
        <button onClick={() => onComments(post)} aria-label="Abrir respostas">
          <MessageCircle size={18} /> <span>{count(post.commentCount)} respostas</span>
        </button>
        {post.scope !== "world" && <button aria-label="Compartilhar"><Share2 size={18} /></button>}
      </footer>
    </article>
  );
}
