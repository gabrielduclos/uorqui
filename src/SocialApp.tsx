import { useMemo, useState, type FormEvent } from "react";
import {
  Bell, Compass, Crown, Home, Lock, Plus, Search, Settings, UserRound, Users
} from "lucide-react";
import "./styles.css";
import "./social.css";

type SocialProfile = {
  name: string;
  username: string;
  bio: string;
  visibility: "public" | "private";
  creator: boolean;
  creatorPlan: "free" | "premium";
  subscriptionPrice: number;
};

type SocialCommunity = {
  id: string;
  name: string;
  description: string;
  members: number;
  premium?: boolean;
};

type SocialPost = {
  id: string;
  author: string;
  username: string;
  text: string;
  community?: string;
  subscriberOnly?: boolean;
  isSubscribed?: boolean;
  createdAt: string;
};

const seedCommunities: SocialCommunity[] = [
  { id: "motos", name: "Motos Brasil", description: "Viagens, mecânica, equipamentos e encontros.", members: 12840 },
  { id: "games", name: "MMORPG Brasil", description: "Lançamentos, guildas e discussões sobre MMOs.", members: 8340 },
  { id: "tech", name: "Tecnologia & IA", description: "Programação, produto, IA e negócios digitais.", members: 19120 },
  { id: "criadores", name: "Criadores Uorqui", description: "Estratégias para crescer e monetizar comunidades.", members: 2190, premium: true },
];

const seedPosts: SocialPost[] = [
  { id: "1", author: "Marina Lopes", username: "@marinalopes", community: "Tecnologia & IA", text: "Quais ferramentas de IA vocês realmente incorporaram ao trabalho diário e não abandonaram depois de uma semana?", createdAt: "12 min" },
  { id: "2", author: "Rafael Mendes", username: "@rafaelmoto", community: "Motos Brasil", text: "Fiz 620 km no fim de semana e montei uma lista do que realmente fez diferença no conforto da viagem. Aqui está meu setup completo, regulagem da suspensão e o que eu mudaria na próxima saída.", subscriberOnly: true, isSubscribed: false, createdAt: "28 min" },
  { id: "3", author: "Bia Santos", username: "@biasantos", community: "MMORPG Brasil", text: "Qual MMO vocês acham que ainda consegue entregar aquela sensação de comunidade que a gente tinha nos jogos antigos?", createdAt: "46 min" },
  { id: "4", author: "Carlos Nunes", username: "@carlosnunes", text: "Passei a semana testando uma rotina de conteúdo para comunidades pequenas. O que mais funcionou não foi frequência, foi responder rápido aos primeiros comentários.", subscriberOnly: true, isSubscribed: true, createdAt: "1 h" },
];

function previewText(text: string) {
  const visible = Math.max(24, Math.ceil(text.length * 0.30));
  return text.slice(0, visible).trimEnd();
}

function SocialPostCard({ post }: { post: SocialPost }) {
  const locked = post.subscriberOnly && !post.isSubscribed;
  return (
    <article className="post-card social-b2b-post">
      <div className="post-head">
        <div className="avatar social-letter-avatar">{post.author.slice(0, 1)}</div>
        <div className="post-author">
          <strong>{post.author}</strong>
          <span>{post.username} · {post.createdAt}</span>
          {post.community && <small className="scope">Comunidade · {post.community}</small>}
        </div>
        {post.subscriberOnly && <span className="creator-pill"><Crown size={12} /> Assinantes</span>}
      </div>
      <div className="post-content">
        {locked ? (
          <div className="social-paywall">
            <p>{previewText(post.text)}…</p>
            <div className="social-paywall-fade" />
            <div className="social-paywall-cta">
              <Lock size={17} />
              <strong>Conteúdo para assinantes</strong>
              <span>Assine {post.author} para continuar lendo.</span>
              <button className="btn small">Assinar criador</button>
            </div>
          </div>
        ) : <p>{post.text}</p>}
      </div>
      <div className="post-actions">
        <button>♡ <span className="action-count">24</span><span className="action-label">Curtir</span></button>
        <button>💬 <span className="action-count">8</span><span className="action-label">Respostas</span></button>
        <button>↗ <span className="action-label">Compartilhar</span></button>
      </div>
    </article>
  );
}

export default function SocialApp() {
  const [view, setView] = useState<"home" | "explore" | "communities" | "profile">("home");
  const [homeTab, setHomeTab] = useState<"for-you" | "recent" | "creators">("for-you");
  const [profile, setProfile] = useState<SocialProfile>({
    name: "Gabriel Duclos",
    username: "@gabriel",
    bio: "Tecnologia, projetos e comunidades.",
    visibility: "public",
    creator: false,
    creatorPlan: "free",
    subscriptionPrice: 19.9,
  });
  const [communities, setCommunities] = useState(seedCommunities);
  const [posts, setPosts] = useState(seedPosts);
  const [postText, setPostText] = useState("");
  const [subscriberOnly, setSubscriberOnly] = useState(false);
  const [communityName, setCommunityName] = useState("");
  const [communityDescription, setCommunityDescription] = useState("");
  const [search, setSearch] = useState("");

  const fee = profile.creatorPlan === "premium" ? 15 : 30;
  const creatorReceives = profile.subscriptionPrice * (1 - fee / 100);

  const visiblePosts = useMemo(() => {
    if (homeTab === "recent") return [...posts].reverse();
    if (homeTab === "creators") return posts.filter((post) => post.subscriberOnly);
    return posts;
  }, [homeTab, posts]);

  const submitPost = (event: FormEvent) => {
    event.preventDefault();
    const text = postText.trim();
    if (!text) return;
    setPosts((current) => [{
      id: String(Date.now()), author: profile.name, username: profile.username, text,
      subscriberOnly: profile.creator && subscriberOnly, isSubscribed: true, createdAt: "agora",
    }, ...current]);
    setPostText("");
    setSubscriberOnly(false);
  };

  const createCommunity = (event: FormEvent) => {
    event.preventDefault();
    const name = communityName.trim();
    if (!name) return;
    setCommunities((current) => [{
      id: String(Date.now()), name, description: communityDescription.trim() || "Nova comunidade", members: 1
    }, ...current]);
    setCommunityName("");
    setCommunityDescription("");
  };

  const title = view === "home" ? "Início" : view === "explore" ? "Explorar" : view === "communities" ? "Comunidades" : "Perfil";

  return (
    <div className="app-shell social-app-shell">
      <aside className="sidebar">
        <button className="brand-button" onClick={() => setView("home")} aria-label="Uorqui">
          <img src="/assets/uorqui-wordmark.png" alt="Uorqui" />
        </button>

        <nav className="side-nav">
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><Home /><span>Início</span></button>
          <button className={view === "explore" ? "active" : ""} onClick={() => setView("explore")}><Compass /><span>Explorar</span></button>
          <button className={view === "communities" ? "active" : ""} onClick={() => setView("communities")}><Users /><span>Comunidades</span></button>
          <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}><UserRound /><span>Perfil</span></button>
          <button><Bell /><span>Notificações</span><span className="nav-badge">3</span></button>
          <button><Settings /><span>Configurações</span></button>
        </nav>

        <button className="btn publish-main" onClick={() => setView("home")}><Plus size={16}/><span>Publicar</span></button>

        <div className="sidebar-user">
          <div className="avatar social-user-avatar">G</div>
          <div className="ellipsis"><strong>{profile.name}</strong><small>{profile.username}</small></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-line">
            <div className="topbar-brand">
              <button className="mobile-logo" onClick={() => setView("home")}><img src="/assets/uorqui-wordmark.png" alt="Uorqui" /></button>
              <h1>{title}</h1>
            </div>

            <form
              className="mobile-header-search"
              onSubmit={(event) => {
                event.preventDefault();
                if (search.trim().length >= 2) setView("explore");
              }}
            >
              <Search size={17}/>
              <input
                value={search}
                onChange={(event) => {
                  const value = event.target.value;
                  setSearch(value);
                  if (value.trim().length >= 2) setView("explore");
                }}
                placeholder="Buscar"
                aria-label="Buscar no Uorqui"
              />
            </form>

            <div className="topbar-actions">
              <button className="icon-btn top-bell" aria-label="Notificações"><Bell size={21}/><span className="count-badge">3</span></button>
            </div>
          </div>
          {view === "home" && (
            <div className="tabs">
              <button className={homeTab === "for-you" ? "active" : ""} onClick={() => setHomeTab("for-you")}>Para você</button>
              <button className={homeTab === "recent" ? "active" : ""} onClick={() => setHomeTab("recent")}>Recentes</button>
              <button className={homeTab === "creators" ? "active" : ""} onClick={() => setHomeTab("creators")}>Criadores</button>
            </div>
          )}
        </header>

        {view === "home" && (
          <>
            <form className="quick-compose social-quick-compose" onSubmit={submitPost}>
              <div className="avatar social-user-avatar">G</div>
              <input value={postText} onChange={(e) => setPostText(e.target.value)} placeholder="Compartilhe algo com o mundo…" />
              {profile.creator && <label className="subscriber-toggle"><input type="checkbox" checked={subscriberOnly} onChange={(e)=>setSubscriberOnly(e.target.checked)}/> Assinantes</label>}
              <button className="btn small" type="submit">Publicar</button>
            </form>
            <section className="feed">{visiblePosts.map((post) => <SocialPostCard key={post.id} post={post} />)}</section>
          </>
        )}

        {view === "explore" && (
          <section className="page-section">
            <div className="page-heading"><div><h2>Explorar</h2><p>Assuntos, pessoas e comunidades em alta.</p></div></div>
            <label className="large-search"><Search size={17}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar no Uorqui" /></label>
            <div className="social-topic-list">
              {["Tecnologia", "Motos", "Games", "Negócios", "Corrida", "Fotografia"].filter(x=>x.toLowerCase().includes(search.toLowerCase())).map((topic,index)=><article className="panel-card" key={topic}><small>#{index+1} em alta</small><h3>{topic}</h3><p className="muted">{(index+3)*1200} conversas esta semana</p></article>)}
            </div>
          </section>
        )}

        {view === "communities" && (
          <section className="page-section">
            <div className="page-heading"><div><h2>Comunidades</h2><p>Qualquer usuário pode criar uma comunidade.</p></div></div>
            <form className="panel-card stack-form" onSubmit={createCommunity}>
              <label><span>Nome</span><input value={communityName} onChange={(e)=>setCommunityName(e.target.value)} placeholder="Nome da comunidade" /></label>
              <label><span>Descrição</span><input value={communityDescription} onChange={(e)=>setCommunityDescription(e.target.value)} placeholder="Sobre o que vocês vão conversar?" /></label>
              <button className="btn"><Plus size={16}/> Criar comunidade</button>
            </form>
            <div className="community-grid">
              {communities.map((community)=><article className="community-card social-community-card" key={community.id}><div className="community-avatar">{community.name.slice(0,2).toUpperCase()}</div><div className="ellipsis"><strong>{community.name}</strong><p>{community.description}</p><small>{community.members.toLocaleString("pt-BR")} membros</small>{community.premium && <span className="creator-pill"><Crown size={11}/> Premium</span>}</div><button className="btn secondary small">Entrar</button></article>)}
            </div>
          </section>
        )}

        {view === "profile" && (
          <section className="page-section">
            <div className="panel-card social-profile-head">
              <div className="social-profile-cover" />
              <div className="profile-head social-profile-body"><div className="avatar social-profile-avatar">G</div><div><h2>{profile.name}</h2><p>{profile.username}</p><p>{profile.bio}</p><small><b>1.248</b> seguidores · <b>384</b> seguindo</small></div></div>
            </div>

            <div className="profile-grid">
              <section className="panel-card stack-form">
                <h3>Privacidade do perfil</h3>
                <label><span>Visibilidade</span><select value={profile.visibility} onChange={(e)=>setProfile({...profile, visibility:e.target.value as "public"|"private"})}><option value="public">Público</option><option value="private">Privado</option></select></label>
                <p className="muted">{profile.visibility === "private" ? "Somente seguidores aprovados veem seu perfil completo e publicações." : "Seu perfil e publicações públicas podem ser encontrados por qualquer pessoa."}</p>
              </section>

              <section className="panel-card stack-form">
                <h3>Modo Criador</h3>
                <label><span>Status</span><select value={profile.creator ? "on" : "off"} onChange={(e)=>setProfile({...profile, creator:e.target.value === "on"})}><option value="off">Usuário</option><option value="on">Criador</option></select></label>
                {profile.creator && <>
                  <label><span>Plano</span><select value={profile.creatorPlan} onChange={(e)=>setProfile({...profile, creatorPlan:e.target.value as "free"|"premium"})}><option value="free">Free · Uorqui 30%</option><option value="premium">Premium · Uorqui 15%</option></select></label>
                  <label><span>Preço da assinatura</span><input type="number" min="1" step="0.1" value={profile.subscriptionPrice} onChange={(e)=>setProfile({...profile, subscriptionPrice:Number(e.target.value)})}/></label>
                  <div className="creator-metrics-b2b"><div><small>Assinatura</small><strong>R$ {profile.subscriptionPrice.toFixed(2).replace(".",",")}</strong></div><div><small>Taxa Uorqui</small><strong>{fee}%</strong></div><div><small>Você recebe*</small><strong>R$ {creatorReceives.toFixed(2).replace(".",",")}</strong></div></div>
                  <small className="muted">*Estimativa antes de taxas de pagamento e impostos.</small>
                </>}
              </section>
            </div>
          </section>
        )}
      </main>

      <aside className="rightbar">
        <button className="global-search" onClick={() => setView("explore")}><Search size={17}/> Buscar no Uorqui</button>
        <section className="side-card compact"><strong>Comunidades para você</strong><small>Baseado nos seus assuntos</small>{communities.slice(0,3).map((c)=><button className="mini-community" key={c.id}><span>{c.name.slice(0,2).toUpperCase()}</span><div><b>{c.name}</b><small>{c.members.toLocaleString("pt-BR")} membros</small></div></button>)}</section>
        <section className="side-card compact creator-side-card"><Crown size={18}/><strong>Ganhe com sua audiência</strong><small>Ative o modo Criador e defina seu próprio preço de assinatura.</small><button className="btn small" onClick={() => setView("profile")}>Ver modo Criador</button></section>
      </aside>

      <nav className="mobile-nav">
        <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><Home/><small>Início</small></button>
        <button className={view === "explore" ? "active" : ""} onClick={() => setView("explore")}><Compass/><small>Explorar</small></button>
        <button className="mobile-create" onClick={() => setView("home")} aria-label="Publicar"><Plus size={26}/></button>
        <button className={view === "communities" ? "active" : ""} onClick={() => setView("communities")}><Users/><small>Comunidades</small></button>
        <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}><UserRound/><small>Perfil</small></button>
      </nav>
    </div>
  );
}
