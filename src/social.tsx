import { useEffect, useState } from "react";
import { ArrowLeft, Ban, Search, UserCheck, UserPlus, Users } from "lucide-react";
import { api } from "./lib/api";
import { Avatar } from "./components/Avatar";
import { PostCard } from "./components/PostCard";
import type { Post, UserProfile } from "./types";
import "./social.css";

type PublicPerson = UserProfile & { isFollowing?: boolean };
type PeopleResponse = { me: string; people: PublicPerson[] };
type ProfileResponse = {
  profile: UserProfile;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isBlocked?: boolean;
  isBlockedBy?: boolean;
  isMe: boolean;
  posts: Post[];
};

type LikeResult = { liked: boolean; reactionCount: number };

function currentRoute() {
  const params = new URLSearchParams(location.search);
  return {
    people: params.get("people") === "1",
    profileUid: params.get("profile") || ""
  };
}

function pushRoute(next: { people?: boolean; profileUid?: string }) {
  const params = new URLSearchParams(location.search);
  params.delete("people");
  params.delete("profile");
  if (next.people) params.set("people", "1");
  if (next.profileUid) params.set("profile", next.profileUid);
  const query = params.toString();
  history.pushState({}, "", `${location.pathname}${query ? `?${query}` : ""}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function closeSocialToFeed() {
  const params = new URLSearchParams(location.search);
  params.delete("people");
  params.delete("profile");
  const query = params.toString();
  history.replaceState({}, "", `${location.pathname}${query ? `?${query}` : ""}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.dispatchEvent(new CustomEvent("uorqui:go-feed"));
}


export function SocialLayer() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const update = () => setRoute(currentRoute());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);

  useEffect(() => {
    const install = () => {
      const nav = document.querySelector(".side-nav");
      if (!nav || nav.querySelector("[data-social-people]")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.socialPeople = "1";
      button.className = "social-nav-button";
      button.innerHTML = '<span class="social-nav-icon">◎</span><span>Pessoas</span>';
      button.addEventListener("click", () => pushRoute({ people: true }));
      const searchButton = Array.from(nav.querySelectorAll("button")).find((item) => item.textContent?.trim().includes("Buscar"));
      if (searchButton?.nextSibling) nav.insertBefore(button, searchButton.nextSibling);
      else nav.appendChild(button);
    };
    install();
    const observer = new MutationObserver(install);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onAuthorClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const postHead = target.closest<HTMLElement>(".post-head");
      if (postHead && (target.closest(".avatar") || target.closest(".post-author strong"))) {
        const uid = postHead.dataset.authorUid || "";
        event.preventDefault();
        event.stopPropagation();
        if (uid) pushRoute({ profileUid: uid });
        return;
      }

      const comment = target.closest<HTMLElement>(".inline-comment");
      if (comment && (target.closest(".avatar") || target.closest(".inline-comment-body > strong"))) {
        const uid = comment.dataset.authorUid || "";
        event.preventDefault();
        event.stopPropagation();
        if (uid) pushRoute({ profileUid: uid });
      }
    };

    document.addEventListener("click", onAuthorClick, true);
    return () => document.removeEventListener("click", onAuthorClick, true);
  }, []);

  if (!route.people && !route.profileUid) return null;

  return (
    <div className="social-overlay">
      <div className="social-shell">
        {route.profileUid
          ? <PublicProfile uid={route.profileUid} onBack={closeSocialToFeed} />
          : <PeopleDirectory onOpen={(uid) => pushRoute({ profileUid: uid })} onClose={closeSocialToFeed} />}
      </div>
    </div>
  );
}

function PeopleDirectory({ onOpen, onClose }: { onOpen: (uid: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PublicPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      api<PeopleResponse>(`/social/people${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`)
        .then((result) => active && setPeople(result.people || []))
        .catch((err) => active && setError(err instanceof Error ? err.message : "Não foi possível carregar as pessoas."))
        .finally(() => active && setLoading(false));
    }, query ? 180 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  return (
    <section className="social-page">
      <header className="social-page-head">
        <button className="social-icon-button" onClick={onClose} aria-label="Voltar"><ArrowLeft size={21} /></button>
        <div><h1>Pessoas</h1><p>Encontre pessoas para acompanhar no Uorqui.</p></div>
      </header>

      <label className="social-search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou usuário" /></label>

      {loading ? <div className="social-empty">Carregando pessoas…</div> : error ? <div className="social-empty">{error}</div> : people.length === 0 ? (
        <div className="social-empty"><Users size={28} /><strong>Nenhuma pessoa encontrada</strong><span>Tente outro termo de busca.</span></div>
      ) : (
        <div className="social-people-list">
          {people.map((person) => (
            <button key={person.uid} className="social-person-card" onClick={() => onOpen(person.uid)}>
              <Avatar name={person.displayName} mediaId={person.avatarMediaId} />
              <span className="social-person-copy">
                <strong>{person.displayName || "Usuário"}</strong>
                {person.username && <small>@{person.username.replace(/^@/, "")}</small>}
                {person.bio && <p>{person.bio}</p>}
              </span>
              <span className={`social-follow-pill ${person.isFollowing ? "following" : ""}`}>{person.isFollowing ? "Seguindo" : "Ver perfil"}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function PublicProfile({ uid, onBack }: { uid: string; onBack: () => void }) {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<ProfileResponse>(`/social/profiles/${encodeURIComponent(uid)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir este perfil.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [uid]);

  const toggleFollow = async () => {
    if (!data || data.isMe || followBusy) return;
    const previous = data;
    const nextFollowing = !previous.isFollowing;
    setData({
      ...previous,
      isFollowing: nextFollowing,
      followerCount: Math.max(0, previous.followerCount + (nextFollowing ? 1 : -1))
    });
    setFollowBusy(true);
    try {
      const result = await api<{ following: boolean; followerCount: number }>(`/social/profiles/${encodeURIComponent(uid)}/follow`, {
        method: nextFollowing ? "POST" : "DELETE"
      });
      setData((current) => current ? { ...current, isFollowing: result.following, followerCount: result.followerCount } : current);
    } catch (err) {
      setData(previous);
      setError(err instanceof Error ? err.message : "Não foi possível atualizar esta conexão.");
    } finally {
      setFollowBusy(false);
    }
  };

  const toggleBlock = async () => {
    if (!data || data.isMe || blockBusy) return;
    const blocking = !data.isBlocked;
    if (blocking && !confirm(`Bloquear ${data.profile.displayName || "este usuário"}? Vocês deixarão de se seguir e o conteúdo dele não aparecerá para você.`)) return;

    setBlockBusy(true);
    try {
      const result = await api<{ blocked: boolean }>(`/social/profiles/${encodeURIComponent(uid)}/block`, {
        method: blocking ? "POST" : "DELETE"
      });
      setData((current) => current ? {
        ...current,
        isBlocked: result.blocked,
        isFollowing: result.blocked ? false : current.isFollowing,
        posts: result.blocked ? [] : current.posts
      } : current);
      if (!result.blocked) await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o bloqueio.");
    } finally {
      setBlockBusy(false);
    }
  };

  if (loading) return <section className="social-page"><div className="social-empty">Carregando perfil…</div></section>;
  if (!data || error) return <section className="social-page"><header className="social-page-head"><button className="social-icon-button" onClick={onBack}><ArrowLeft size={21} /></button><h1>Perfil</h1></header><div className="social-empty">{error || "Perfil não encontrado."}</div></section>;

  return (
    <section className="social-page social-profile-page">
      <header className="social-page-head compact">
        <button className="social-icon-button" onClick={onBack} aria-label="Voltar"><ArrowLeft size={21} /></button>
        <div><h1>{data.profile.displayName || "Perfil"}</h1><p>{data.posts.length} {data.posts.length === 1 ? "publicação" : "publicações"}</p></div>
      </header>

      <div className="social-profile-card">
        <div className="social-profile-top">
          <Avatar name={data.profile.displayName} mediaId={data.profile.avatarMediaId} />
          {data.isMe ? (
            <button className="btn social-follow-button secondary" onClick={() => {
              history.back();
              window.setTimeout(() => document.querySelector<HTMLButtonElement>('.side-nav button:last-child')?.click(), 0);
            }}>Editar perfil</button>
          ) : (
            <div className="social-profile-actions">
              {!data.isBlocked && !data.isBlockedBy && (
                <button className={`btn social-follow-button ${data.isFollowing ? "secondary" : ""}`} disabled={followBusy} onClick={toggleFollow}>
                  {data.isFollowing ? <UserCheck size={17} /> : <UserPlus size={17} />} {data.isFollowing ? "Deixar de seguir" : "Seguir"}
                </button>
              )}
              {!data.isBlockedBy && (
                <button className={`btn secondary social-block-button ${data.isBlocked ? "blocked" : ""}`} disabled={blockBusy} onClick={toggleBlock}>
                  <Ban size={16} /> {data.isBlocked ? "Desbloquear" : "Bloquear"}
                </button>
              )}
            </div>
          )}
        </div>
        <h2>{data.profile.displayName || "Usuário"}</h2>
        {data.profile.username && <span className="social-username">@{data.profile.username.replace(/^@/, "")}</span>}
        {data.profile.bio && <p className="social-bio">{data.profile.bio}</p>}
        <div className="social-stats"><span><strong>{data.followingCount}</strong> seguindo</span><span><strong>{data.followerCount}</strong> seguidores</span></div>
      </div>

      <div className="social-profile-feed">
        <h3>Publicações</h3>
        {data.isBlocked ? <div className="social-empty">Você bloqueou este usuário.</div>
          : data.isBlockedBy ? <div className="social-empty">Este perfil não está disponível para você.</div>
          : data.posts.length === 0 ? <div className="social-empty">Ainda não há publicações visíveis para você.</div> : data.posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            currentUid={uid}
            onLike={async (target) => api<LikeResult>(`/posts/${target.id}/reaction`, { method: "POST" })}
            onRead={async (target) => { await api(`/posts/${target.id}/read`, { method: "POST" }); }}
            onChanged={load}
          />
        ))}
      </div>
    </section>
  );
}
