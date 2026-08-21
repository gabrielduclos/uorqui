import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CalendarDays, CalendarPlus, CheckCircle2, Download, FileText, Heart, MapPin,
  MessageCircle, RotateCcw, Send, Share2, ShieldAlert, Trash2, Vote
} from "lucide-react";
import { Avatar } from "./Avatar";
import { api, cachedMediaBlobUrl, mediaBlobUrl } from "../lib/api";
import type { Attachment, Comment, Community, PollOption, Post } from "../types";

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

type LikeResult = {
  liked: boolean;
  reactionCount: number;
};

function formatBytes(size = 0) {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState(() => cachedMediaBlobUrl(attachment.id));
  const [failed, setFailed] = useState(false);
  const isImage = String(attachment.contentType || "").startsWith("image/");

  useEffect(() => {
    let active = true;
    const cached = cachedMediaBlobUrl(attachment.id);
    if (cached) {
      setUrl(cached);
      setFailed(false);
      return () => { active = false; };
    }

    setUrl("");
    setFailed(false);
    mediaBlobUrl(attachment.id)
      .then((next) => active && setUrl(next))
      .catch(() => active && setFailed(true));

    return () => { active = false; };
  }, [attachment.id]);

  if (isImage) {
    return (
      <div className="post-image-wrap">
        {url ? (
          <img className="post-image" src={url} alt={attachment.name || "Foto da publicação"} loading="eager" decoding="async" />
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

function postPermalink(post: Post) {
  const url = new URL("/", window.location.origin);
  url.searchParams.set("post", post.id);
  if (post.scope !== "world" && post.companyId) url.searchParams.set("company", post.companyId);
  return url.toString();
}

function calendarUtc(value: string) {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function eventEnd(post: Post) {
  if (post.eventEnd) return post.eventEnd;
  return new Date(new Date(post.eventStart || Date.now()).getTime() + 60 * 60 * 1000).toISOString();
}

function eventDateLabel(post: Post) {
  if (!post.eventStart) return "";
  try {
    const start = new Date(post.eventStart);
    const end = post.eventEnd ? new Date(post.eventEnd) : null;
    const startLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(start);
    if (!end) return startLabel;
    const endLabel = new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(end);
    return `${startLabel} – ${endLabel}`;
  } catch {
    return new Date(post.eventStart).toLocaleString("pt-BR");
  }
}

function icsEscape(value = "") {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
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
  initialCommentsOpen = false,
  onChanged,
  showToast,
}: {
  post: Post;
  companyName?: string;
  community?: Community;
  onLike: (post: Post) => Promise<LikeResult> | LikeResult;
  onRead: (post: Post) => Promise<void> | void;
  canDelete?: boolean;
  onDelete?: (post: Post) => Promise<void> | void;
  currentUid?: string;
  canAdmin?: boolean;
  initialCommentsOpen?: boolean;
  onChanged?: () => Promise<void> | void;
  showToast?: (message: string) => void;
}) {
  const [commentsOpen, setCommentsOpen] = useState(initialCommentsOpen);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsBusy, setCommentsBusy] = useState(false);
  const commentsRequestRef = useRef<Promise<void> | null>(null);
  const likeBusyRef = useRef(false);
  const pollBusyRef = useRef(false);
  const [localCommentCount, setLocalCommentCount] = useState(Number(post.commentCount || 0));
  const [localLiked, setLocalLiked] = useState(Boolean(post.liked));
  const [localReactionCount, setLocalReactionCount] = useState(Number(post.reactionCount || 0));
  const [resolved, setResolved] = useState(Boolean(post.isResolved));
  const [resolveBusy, setResolveBusy] = useState(false);
  const [pollOptions, setPollOptions] = useState<PollOption[]>(post.pollOptions || []);
  const [pollTotal, setPollTotal] = useState(Number(post.pollTotalVotes || 0));
  const [myPollOptionId, setMyPollOptionId] = useState(post.myPollOptionId || "");
  const [pollBusy, setPollBusy] = useState(false);

  useEffect(() => setLocalCommentCount(Number(post.commentCount || 0)), [post.commentCount]);
  useEffect(() => {
    setLocalLiked(Boolean(post.liked));
    setLocalReactionCount(Number(post.reactionCount || 0));
  }, [post.liked, post.reactionCount]);
  useEffect(() => setResolved(Boolean(post.isResolved)), [post.isResolved]);
  useEffect(() => {
    setPollOptions(post.pollOptions || []);
    setPollTotal(Number(post.pollTotalVotes || 0));
    setMyPollOptionId(post.myPollOptionId || "");
  }, [post.pollOptions, post.pollTotalVotes, post.myPollOptionId]);

  const scope = post.scope === "world"
    ? "🌎 Mundo"
    : post.scope === "community"
      ? `${community?.visibility === "public" || post.communityVisibility === "public" ? "Comunidade pública" : "Comunidade"} · ${community?.name || post.communityName || "Comunidade"}`
      : `🏢 ${companyName || post.companyName || "Empresa"}`;

  const canResolve = (post.type === "post" || post.type === "question") && (
    post.authorUid === currentUid || (canAdmin && post.scope !== "world")
  );

  const loadComments = () => {
    if (commentsLoaded) return Promise.resolve();
    if (commentsRequestRef.current) return commentsRequestRef.current;

    setCommentsBusy(true);
    const request = api<{ comments: Comment[] }>(`/posts/${post.id}/comments`)
      .then((result) => {
        setComments(result.comments);
        setLocalCommentCount(result.comments.length);
        setCommentsLoaded(true);
      })
      .catch((error) => {
        commentsRequestRef.current = null;
        showToast?.(error instanceof Error ? error.message : "Não foi possível carregar as respostas.");
      })
      .finally(() => setCommentsBusy(false));

    commentsRequestRef.current = request;
    return request;
  };

  const warmComments = () => {
    if (!commentsLoaded && !post.deletedByAdmin) void loadComments();
  };

  const toggleComments = () => {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next) warmComments();
  };

  const toggleLike = async () => {
    if (likeBusyRef.current) return;
    likeBusyRef.current = true;

    const previousLiked = localLiked;
    const previousCount = localReactionCount;
    const nextLiked = !previousLiked;

    setLocalLiked(nextLiked);
    setLocalReactionCount(Math.max(0, previousCount + (nextLiked ? 1 : -1)));

    try {
      const result = await onLike(post);
      setLocalLiked(Boolean(result.liked));
      setLocalReactionCount(Math.max(0, Number(result.reactionCount || 0)));
    } catch {
      setLocalLiked(previousLiked);
      setLocalReactionCount(previousCount);
    } finally {
      likeBusyRef.current = false;
    }
  };

  useEffect(() => {
    if (initialCommentsOpen) {
      setCommentsOpen(true);
      warmComments();
    }
    // Deve executar somente quando a navegação pedir a abertura das respostas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCommentsOpen]);

  const addComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("text") || "").trim();
    if (!text || commentsBusy) return;
    setCommentsBusy(true);
    try {
      const result = await api<{ comment: Comment }>(`/posts/${post.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ text })
      });
      setComments((current) => [...current, result.comment]);
      setLocalCommentCount((current) => current + 1);
      form.reset();
      void onChanged?.();
    } catch (error) {
      showToast?.(error instanceof Error ? error.message : "Não foi possível comentar.");
    } finally {
      setCommentsBusy(false);
    }
  };

  const acceptSolution = async (commentId: string) => {
    try {
      await api(`/posts/${post.id}/solution`, { method: "POST", body: JSON.stringify({ commentId }) });
      setResolved(true);
      showToast?.("Solução marcada e publicação resolvida.");
      await onChanged?.();
    } catch (error) {
      showToast?.(error instanceof Error ? error.message : "Não foi possível marcar a solução.");
    }
  };

  const toggleResolved = async () => {
    if (resolveBusy) return;
    setResolveBusy(true);
    try {
      const next = !resolved;
      await api(`/posts/${post.id}/resolve`, { method: "POST", body: JSON.stringify({ resolved: next }) });
      setResolved(next);
      showToast?.(next ? "Publicação marcada como resolvida." : "Publicação reaberta.");
      void onChanged?.();
    } catch (error) {
      showToast?.(error instanceof Error ? error.message : "Não foi possível alterar o status.");
    } finally {
      setResolveBusy(false);
    }
  };

  const votePoll = async (optionId: string) => {
    if (pollBusyRef.current || myPollOptionId === optionId) return;
    if (!pollOptions.some((option) => option.id === optionId)) return;

    pollBusyRef.current = true;
    const previousOptions = pollOptions.map((option) => ({ ...option }));
    const previousTotal = pollTotal;
    const previousOptionId = myPollOptionId;
    const optimisticOptions = previousOptions.map((option) => {
      let voteCount = Number(option.voteCount || 0);
      if (previousOptionId && option.id === previousOptionId) voteCount = Math.max(0, voteCount - 1);
      if (option.id === optionId) voteCount += 1;
      return { ...option, voteCount };
    });

    setPollBusy(true);
    setMyPollOptionId(optionId);
    setPollOptions(optimisticOptions);
    setPollTotal(previousOptionId ? previousTotal : previousTotal + 1);

    try {
      const result = await api<{ optionId: string; pollOptions: PollOption[]; pollTotalVotes: number }>(`/posts/${post.id}/poll-vote`, {
        method: "POST",
        body: JSON.stringify({ optionId })
      });
      setMyPollOptionId(result.optionId);
      setPollOptions(result.pollOptions);
      setPollTotal(result.pollTotalVotes);
      void onChanged?.();
    } catch (error) {
      setMyPollOptionId(previousOptionId);
      setPollOptions(previousOptions);
      setPollTotal(previousTotal);
      showToast?.(error instanceof Error ? error.message : "Não foi possível registrar seu voto.");
    } finally {
      pollBusyRef.current = false;
      setPollBusy(false);
    }
  };

  const share = async () => {
    const url = postPermalink(post);
    const title = post.type === "event" ? post.title || "Evento no Uorqui" : post.title || "Publicação no Uorqui";
    try {
      if (navigator.share) {
        await navigator.share({ title, text: post.text?.slice(0, 180) || title, url });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        showToast?.("Link da publicação copiado.");
        return;
      }
      window.prompt("Copie o link da publicação:", url);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          showToast?.("Link da publicação copiado.");
        } else {
          window.prompt("Copie o link da publicação:", url);
        }
      } catch {
        window.prompt("Copie o link da publicação:", url);
      }
    }
  };

  const openGoogleCalendar = () => {
    if (!post.eventStart) return;
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: post.title || "Evento Uorqui",
      dates: `${calendarUtc(post.eventStart)}/${calendarUtc(eventEnd(post))}`,
      details: `${post.text || ""}\n\n${postPermalink(post)}`,
      location: post.eventLocation || ""
    });
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  const downloadIcs = () => {
    if (!post.eventStart) return;
    const uid = `${post.id}@uorqui`;
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Uorqui//Eventos//PT-BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${icsEscape(uid)}`,
      `DTSTAMP:${calendarUtc(new Date().toISOString())}`,
      `DTSTART:${calendarUtc(post.eventStart)}`,
      `DTEND:${calendarUtc(eventEnd(post))}`,
      `SUMMARY:${icsEscape(post.title || "Evento Uorqui")}`,
      `DESCRIPTION:${icsEscape(`${post.text || ""}\n\n${postPermalink(post)}`)}`,
      `LOCATION:${icsEscape(post.eventLocation || "")}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(post.title || "evento-uorqui").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.ics`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
              </div>
            ) : post.type === "poll" ? (
              <div className="poll-block">
                <span className="post-kind"><Vote size={13} /> ENQUETE</span>
                <p className="poll-question">{post.text}</p>
                <div className="poll-options">
                  {pollOptions.map((option) => {
                    const pct = pollTotal ? Math.round((Number(option.voteCount || 0) / pollTotal) * 100) : 0;
                    const selected = myPollOptionId === option.id;
                    return (
                      <button key={option.id} className={`poll-option ${selected ? "selected" : ""}`} disabled={pollBusy} onClick={() => votePoll(option.id)}>
                        <span className="poll-progress" style={{ width: `${pct}%` }} />
                        <span className="poll-option-copy"><b>{option.text}</b><small>{pct}% · {option.voteCount || 0}</small></span>
                        {selected && <CheckCircle2 size={17} />}
                      </button>
                    );
                  })}
                </div>
                <small className="poll-total">{pollTotal} {pollTotal === 1 ? "voto" : "votos"}{myPollOptionId ? " · você já votou" : ""}</small>
              </div>
            ) : post.type === "event" ? (
              <div className="event-block">
                <span className="post-kind"><CalendarDays size={13} /> EVENTO</span>
                <h3>{post.title || "Evento"}</h3>
                <div className="event-meta"><CalendarDays size={16} /><strong>{eventDateLabel(post)}</strong></div>
                {post.eventLocation && <div className="event-meta"><MapPin size={16} /><span>{post.eventLocation}</span></div>}
                {post.text && <p>{post.text}</p>}
                <div className="event-calendar-actions">
                  <button className="btn small secondary" onClick={openGoogleCalendar}><CalendarPlus size={16} /> Google Agenda</button>
                  <button className="btn small secondary" onClick={downloadIcs}><Download size={16} /> Adicionar à agenda</button>
                </div>
              </div>
            ) : (
              <>
                {post.type === "question" && <span className="post-kind">PERGUNTA</span>}
                <p>{post.text}</p>
              </>
            )}

            {post.type === "announcement" && post.requiresReadReceipt && post.authorUid !== currentUid && (
              <div className={`read-confirmation-box ${post.hasRead ? "confirmed" : ""}`}>
                <div>
                  <strong>{post.hasRead ? "Leitura confirmada" : "Confirmação de leitura solicitada"}</strong>
                  <small>
                    {post.hasRead
                      ? "Sua confirmação foi registrada."
                      : "Esta pendência continuará no sino até você confirmar a leitura."}
                  </small>
                </div>
                <button
                  className={`btn small ${post.hasRead ? "secondary" : ""}`}
                  disabled={post.hasRead}
                  onClick={() => onRead(post)}
                >
                  {post.hasRead ? "✓ Confirmado" : "Confirmar leitura"}
                </button>
              </div>
            )}

            {(resolved || post.acceptedCommentId) && (post.type === "post" || post.type === "question") && (
              <span className="solution"><CheckCircle2 size={14} /> Concluído</span>
            )}

            {!!post.attachments?.length && (
              <div className={`post-attachments ${post.attachments.length === 1 ? "one" : ""}`}>
                {post.attachments.map((attachment) => <AttachmentPreview key={attachment.id} attachment={attachment} />)}
              </div>
            )}
          </div>

          <footer className="post-actions">
            <button className={localLiked ? "liked" : ""} onClick={toggleLike} aria-label="Curtir" aria-pressed={localLiked}>
              <Heart size={18} fill={localLiked ? "currentColor" : "none"} />
              <span className="action-count">{count(localReactionCount)}</span>
              <span className="action-label">curtidas</span>
            </button>
            <button
              className={commentsOpen ? "active" : ""}
              onPointerEnter={warmComments}
              onPointerDown={warmComments}
              onFocus={warmComments}
              onClick={toggleComments}
              aria-label="Abrir respostas"
            >
              <MessageCircle size={18} />
              <span className="action-count">{count(localCommentCount)}</span>
              <span className="action-label">respostas</span>
            </button>
            <button onClick={share} aria-label="Compartilhar publicação"><Share2 size={18} /><span className="action-label">compartilhar</span></button>
            {canResolve && (
              <button
                className={`resolve-action ${resolved ? "resolved" : ""}`}
                disabled={resolveBusy}
                onClick={toggleResolved}
                aria-label={resolved ? "Reabrir assunto" : "Marcar como concluído"}
                title={resolved ? "Reabrir assunto" : "Marcar como concluído"}
              >
                {resolved ? <RotateCcw size={18} /> : <CheckCircle2 size={18} />}
                <span className="action-label">{resolved ? "Reabrir assunto" : "Marcar como concluído"}</span>
              </button>
            )}
          </footer>

          {commentsOpen && (
            <section className="inline-comments">
              {commentsBusy && !commentsLoaded && <div className="inline-comments-loading">Carregando respostas…</div>}
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
