import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, Heart, MessageCircle, Send, Share2, Trash2, Vote } from "lucide-react";
import { Avatar } from "./Avatar";
import { api, cachedMediaBlobUrl, mediaBlobUrl } from "../lib/api";
import type { Comment, Community, Post } from "../types";

const PHOTO = /\n?\[\[uorqui-photo:([a-zA-Z0-9_-]+)\]\]\s*$/;
const demoAccepted: Record<string, string> = {
  "demo-question": "comment-question-1",
};

function relative(value?: string) {
  if (!value) return "";
  const min = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (min < 60) return min < 1 ? "agora" : `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

function CommentPhoto({ id }: { id: string }) {
  const [url, setUrl] = useState(() => cachedMediaBlobUrl(id));
  useEffect(() => { if (!url) void mediaBlobUrl(id).then(setUrl).catch(() => {}); }, [id, url]);
  return url ? <div className="comment-photo-wrap"><img className="comment-photo" src={url} alt="Foto da resposta" /></div> : null;
}

export function PostCard({ post, companyName, community, onLike, onRead, canDelete, onDelete, currentUid, canAdmin, showToast }: {
  post: Post; companyName?: string; community?: Community;
  onLike: (post: Post) => Promise<{liked:boolean;reactionCount:number}> | {liked:boolean;reactionCount:number};
  onRead: (post: Post) => Promise<void> | void; canDelete?: boolean; onDelete?: (post: Post) => Promise<void> | void;
  currentUid?: string; canAdmin?: boolean; initialCommentsOpen?: boolean; initialCommentId?: string; onChanged?: () => Promise<void> | void; showToast?: (m:string)=>void;
}) {
  const [open, setOpen] = useState(post.id === "demo-question");
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [liked, setLiked] = useState(Boolean(post.liked));
  const [reactions, setReactions] = useState(Number(post.reactionCount || 0));
  const [accepted, setAccepted] = useState(post.acceptedCommentId || demoAccepted[post.id] || "");
  const [resolved, setResolved] = useState(Boolean(post.isResolved || accepted));

  const load = async () => {
    if (loaded) return;
    const result = await api<{comments: Comment[]}>(`/posts/${post.id}/comments`);
    setComments(result.comments); setLoaded(true);
  };
  useEffect(() => { if (open) void load(); }, [open]);

  const scope = post.scope === "world" ? "🌎 Mundo" : post.scope === "community" ? `Comunidade · ${community?.name || post.communityName || "Comunidade"}` : `🏢 ${companyName || post.companyName || "Empresa"}`;

  const like = async () => { const r = await onLike(post); setLiked(r.liked); setReactions(r.reactionCount); };
  const accept = async (id: string) => { await api(`/posts/${post.id}/solution`, {method:"POST", body:JSON.stringify({commentId:id})}); setAccepted(id); setResolved(true); showToast?.("Solução marcada e publicação concluída."); };
  const add = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f=e.currentTarget; const text=String(new FormData(f).get("text")||"").trim(); if(!text)return; const r=await api<{comment:Comment}>(`/posts/${post.id}/comments`,{method:"POST",body:JSON.stringify({text})}); setComments(c=>[...c,r.comment]); f.reset(); };

  return <article className="post-card">
    <header className="post-head"><Avatar name={post.authorName}/><div className="post-author"><div><strong>{post.authorName || "Usuário"}</strong><span> · {relative(post.createdAt)}</span></div><small className={`scope ${post.scope}`}>{scope}</small></div>{canDelete&&onDelete&&<button className="post-delete" onClick={()=>onDelete(post)}><Trash2 size={17}/></button>}</header>
    <div className="post-content">
      {post.type === "announcement" ? <div className="announcement"><small>📢 COMUNICADO{post.requiresReadReceipt?" · LEITURA SOLICITADA":""}</small><strong>{post.title}</strong><p>{post.text}</p>{post.requiresReadReceipt&&!post.hasRead&&post.authorUid!==currentUid&&<button className="btn small" onClick={()=>onRead(post)}>Confirmar leitura</button>}</div>
      : post.type === "poll" ? <div className="poll-block"><span className="post-kind"><Vote size={13}/> ENQUETE</span><p className="poll-question">{post.text}</p>{post.pollOptions?.map(o=><div className="poll-option" key={o.id}><span className="poll-option-copy"><b>{o.text}</b><small>{o.voteCount||0} votos</small></span></div>)}</div>
      : post.type === "event" ? <div className="event-block"><span className="post-kind"><CalendarDays size={13}/> EVENTO</span><h3>{post.title}</h3><p>{post.text}</p><div className="event-meta"><CalendarDays size={16}/><strong>{post.eventStart ? new Date(post.eventStart).toLocaleString("pt-BR") : ""}</strong></div></div>
      : <>{post.type==="question"&&<span className="post-kind">PERGUNTA</span>}<p>{post.text}</p></>}
      {resolved && (post.type==="post"||post.type==="question") && <span className="solution"><CheckCircle2 size={14}/> Concluído</span>}
    </div>
    <footer className="post-actions"><button className={liked?"liked":""} onClick={like}><Heart size={18} fill={liked?"currentColor":"none"}/><span className="action-count">{reactions}</span><span className="action-label">curtidas</span></button><button className={open?"active":""} onClick={()=>{setOpen(v=>!v);void load();}}><MessageCircle size={18}/><span className="action-count">{post.commentCount||comments.length}</span><span className="action-label">respostas</span></button><button onClick={()=>showToast?.("Link copiado na demonstração.")}><Share2 size={18}/><span className="action-label">compartilhar</span></button></footer>
    {open && <section className="inline-comments"><div className="inline-comment-list">{comments.map(c=>{const m=c.text.match(PHOTO);const text=c.text.replace(PHOTO,"").trim();return <article className="inline-comment" key={c.id}><Avatar name={c.authorName} size={34}/><div className="inline-comment-body"><strong>{c.authorName||"Usuário"}</strong>{text&&<p>{text}</p>}{m?.[1]&&<CommentPhoto id={m[1]}/>}<div className="inline-comment-actions"><button className={c.liked?"inline-comment-like liked":"inline-comment-like"}><Heart size={14}/><span>Curtir</span>{Number(c.reactionCount||0)>0&&<b>{c.reactionCount}</b>}</button>{accepted===c.id?<span className="solution"><CheckCircle2 size={13}/> Solução aceita</span>:!accepted&&(post.type==="post"||post.type==="question")&&(post.authorUid===currentUid||(canAdmin&&post.scope!=="world"))&&post.authorUid!==c.authorUid?<button type="button" className="text-button solution-button" onClick={()=>accept(c.id)}><CheckCircle2 size={13}/> Marcar como solução</button>:null}</div></div></article>})}</div><form className="inline-comment-form" onSubmit={add}><textarea name="text" rows={2} placeholder="Escreva uma resposta…"/><button className="btn small"><Send size={15}/> Responder</button></form></section>}
  </article>;
}
