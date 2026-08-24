import { useMemo, useState, type FormEvent } from "react";
import { Bell, Compass, Crown, Globe2, Home, Lock, Plus, Search, Settings, Sparkles, UserRound, Users } from "lucide-react";
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
  const visible = Math.max(24, Math.ceil(text.length * 0.16));
  return text.slice(0, visible).trimEnd();
}

export default function SocialApp() {
  const [view, setView] = useState<"home" | "explore" | "communities" | "profile">("home");
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
  const [communityName, setCommunityName] = useState("");
  const [communityDescription, setCommunityDescription] = useState("");
  const [postText, setPostText] = useState("");
  const [subscriberOnly, setSubscriberOnly] = useState(false);
  const fee = profile.creatorPlan === "premium" ? 15 : 30;
  const creatorReceives = profile.subscriptionPrice * (1 - fee / 100);

  const visiblePosts = useMemo(() => posts, [posts]);

  const submitPost = (event: FormEvent) => {
    event.preventDefault();
    const text = postText.trim();
    if (!text) return;
    setPosts((current) => [{
      id: String(Date.now()),
      author: profile.name,
      username: profile.username,
      text,
      subscriberOnly: profile.creator && subscriberOnly,
      isSubscribed: true,
      createdAt: "agora",
    }, ...current]);
    setPostText("");
    setSubscriberOnly(false);
  };

  const createCommunity = (event: FormEvent) => {
    event.preventDefault();
    const name = communityName.trim();
    if (!name) return;
    setCommunities((current) => [{ id: String(Date.now()), name, description: communityDescription.trim() || "Nova comunidade", members: 1 }, ...current]);
    setCommunityName("");
    setCommunityDescription("");
  };

  return (
    <div className="social-shell">
      <aside className="social-sidebar">
        <div className="social-brand">Uorqui</div>
        <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><Home size={19}/> Início</button>
        <button className={view === "explore" ? "active" : ""} onClick={() => setView("explore")}><Compass size={19}/> Explorar</button>
        <button className={view === "communities" ? "active" : ""} onClick={() => setView("communities")}><Users size={19}/> Comunidades</button>
        <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}><UserRound size={19}/> Perfil</button>
        <button><Bell size={19}/> Notificações</button>
        <button><Settings size={19}/> Configurações</button>
      </aside>

      <main className="social-main">
        {view === "home" && (
          <>
            <section className="social-hero">
              <div><span className="eyebrow"><Globe2 size={15}/> Mundo</span><h1>Assuntos, pessoas e comunidades.</h1><p>Descubra conversas abertas, siga criadores e participe de comunidades feitas por quem realmente entende do assunto.</p></div>
              <Search size={20}/>
            </section>
            <form className="social-composer" onSubmit={submitPost}>
              <textarea value={postText} onChange={(e) => setPostText(e.target.value)} placeholder="Compartilhe algo com o mundo…" />
              <div>
                {profile.creator && <label><input type="checkbox" checked={subscriberOnly} onChange={(e) => setSubscriberOnly(e.target.checked)} /> Somente assinantes</label>}
                <button type="submit">Publicar</button>
              </div>
            </form>
            <section className="social-feed">
              {visiblePosts.map((post) => {
                const locked = post.subscriberOnly && !post.isSubscribed;
                return <article className="social-post" key={post.id}>
                  <header><div className="social-avatar">{post.author.slice(0,1)}</div><div><strong>{post.author}</strong><span>{post.username} · {post.createdAt}</span></div>{post.community && <b>{post.community}</b>}</header>
                  {locked ? (
                    <div className="premium-post-preview">
                      <p>{previewText(post.text)}…</p>
                      <div className="premium-fade" />
                      <div className="subscribe-cta"><Lock size={18}/><strong>Conteúdo para assinantes</strong><span>Assine {post.author} para continuar lendo.</span><button>Assinar criador</button></div>
                    </div>
                  ) : <p>{post.text}</p>}
                  <footer><span>♡ 24</span><span>💬 8</span><span>↗ compartilhar</span></footer>
                </article>;
              })}
            </section>
          </>
        )}

        {view === "explore" && (
          <section><div className="section-head"><div><span className="eyebrow"><Sparkles size={15}/> Descobrir</span><h1>Assuntos em alta</h1></div></div><div className="topic-grid">{["Tecnologia", "Motos", "Games", "Negócios", "Corrida", "Fotografia"].map((topic, index) => <div className="topic-card" key={topic}><span>#{index + 1}</span><strong>{topic}</strong><small>{(index+3)*1200} conversas esta semana</small></div>)}</div></section>
        )}

        {view === "communities" && (
          <section>
            <div className="section-head"><div><span className="eyebrow"><Users size={15}/> Comunidades</span><h1>Crie seu espaço</h1><p>Qualquer usuário pode criar uma comunidade.</p></div></div>
            <form className="community-create" onSubmit={createCommunity}><input value={communityName} onChange={(e)=>setCommunityName(e.target.value)} placeholder="Nome da comunidade"/><input value={communityDescription} onChange={(e)=>setCommunityDescription(e.target.value)} placeholder="Descrição"/><button><Plus size={16}/> Criar comunidade</button></form>
            <div className="community-grid-social">{communities.map((community)=><article key={community.id}><div className="community-icon">{community.name.slice(0,2).toUpperCase()}</div><strong>{community.name}</strong><p>{community.description}</p><span>{community.members.toLocaleString("pt-BR")} membros</span>{community.premium && <b className="premium-tag"><Crown size={13}/> Premium</b>}<button>Entrar</button></article>)}</div>
          </section>
        )}

        {view === "profile" && (
          <section>
            <div className="public-profile-card"><div className="profile-cover"/><div className="profile-main"><div className="profile-avatar-big">G</div><div><h1>{profile.name}</h1><span>{profile.username}</span><p>{profile.bio}</p><div className="profile-stats"><b>1.248</b> seguidores <b>384</b> seguindo</div></div></div></div>
            <div className="profile-settings-card"><h2>Perfil</h2><label>Visibilidade<select value={profile.visibility} onChange={(e)=>setProfile({...profile, visibility:e.target.value as "public"|"private"})}><option value="public">Público</option><option value="private">Privado</option></select></label><p className="hint">{profile.visibility === "private" ? "Somente seguidores aprovados veem suas publicações e perfil completo." : "Seu perfil e publicações públicas podem ser encontrados por qualquer pessoa."}</p></div>
            <div className="creator-card"><div><span className="eyebrow"><Crown size={15}/> Criadores</span><h2>Modo Criador</h2><p>Publique conteúdo exclusivo e cobre uma assinatura mensal definida por você.</p></div><label className="creator-toggle"><input type="checkbox" checked={profile.creator} onChange={(e)=>setProfile({...profile, creator:e.target.checked})}/> Ativar criador</label>{profile.creator && <div className="creator-config"><label>Plano do criador<select value={profile.creatorPlan} onChange={(e)=>setProfile({...profile, creatorPlan:e.target.value as "free"|"premium"})}><option value="free">Free · taxa Uorqui 30%</option><option value="premium">Premium · taxa Uorqui 15%</option></select></label><label>Preço da assinatura<input type="number" min="1" step="0.9" value={profile.subscriptionPrice} onChange={(e)=>setProfile({...profile, subscriptionPrice:Number(e.target.value)})}/></label><div className="creator-summary"><div><span>Assinatura</span><strong>R$ {profile.subscriptionPrice.toFixed(2).replace(".",",")}</strong></div><div><span>Taxa Uorqui</span><strong>{fee}%</strong></div><div><span>Você recebe*</span><strong>R$ {creatorReceives.toFixed(2).replace(".",",")}</strong></div></div><small>*Estimativa antes de taxas de pagamento e impostos.</small></div>}</div>
          </section>
        )}
      </main>

      <aside className="social-right"><h3>Para você</h3>{communities.slice(0,3).map(c=><div className="mini-community" key={c.id}><div className="community-icon small">{c.name.slice(0,2).toUpperCase()}</div><div><strong>{c.name}</strong><span>{c.members.toLocaleString("pt-BR")} membros</span></div><button>+</button></div>)}<div className="monetization-note"><Crown size={18}/><strong>Ganhe com sua audiência</strong><p>Ative o modo Criador e defina seu próprio preço de assinatura.</p></div></aside>
    </div>
  );
}
