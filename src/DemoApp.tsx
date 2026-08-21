import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Bell, BriefcaseBusiness, Building2, Camera, Check, ChevronDown, CirclePlus, CreditCard,
  Crown, Globe2, Home, LockKeyhole, LogOut, Mail, MapPin, Megaphone, MessageCircle,
  Plus, Search, Settings, Trash2, UserPlus, UserRound, Users, X
} from "lucide-react";
import { Avatar } from "./components/Avatar";
import { Modal } from "./components/Modal";
import { PostCard } from "./components/PostCard";
import type { Community, HomeTab, Post, View } from "./types";
import "./styles.css";

const company = { id: "demo-company", name: "Lumina Tecnologia" };
const me = { uid: "demo-me", name: "Gabriel Duclos", email: "gabriel@lumina.demo" };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const communities: Community[] = [
  { id: "demo-geral", companyId: company.id, name: "Geral", description: "Novidades e conversas de toda a empresa", visibility: "public", memberCount: 248 },
  { id: "demo-produto", companyId: company.id, name: "Produto & Tecnologia", description: "Roadmap, descobertas e decisões técnicas", visibility: "public", memberCount: 64 },
  { id: "demo-comercial", companyId: company.id, name: "Comercial", description: "Oportunidades, playbooks e aprendizados", visibility: "private", memberCount: 38 },
  { id: "demo-pessoas", companyId: company.id, name: "Pessoas & Cultura", description: "Benefícios, rituais e desenvolvimento", visibility: "public", memberCount: 248 },
];

const initialPosts: Post[] = [
  {
    id: "demo-announcement", authorUid: "demo-mariana", authorName: "Mariana Costa", scope: "company",
    companyId: company.id, companyName: company.name, type: "announcement", title: "Novo benefício: Wellhub disponível a partir de setembro",
    text: "Fechamos uma parceria para ampliar o cuidado com saúde e bem-estar. O cadastro estará disponível no portal de benefícios na próxima segunda-feira.",
    requiresReadReceipt: true, hasRead: false, reactionCount: 47, commentCount: 2, createdAt: ago(30), updatedAt: ago(18),
  },
  {
    id: "demo-question", authorUid: "demo-lucas", authorName: "Lucas Martins", scope: "community",
    companyId: company.id, companyName: company.name, communityId: "demo-produto", communityName: "Produto & Tecnologia", communityVisibility: "public",
    type: "question", title: "Como reduzir o tempo de ativação dos novos clientes?",
    text: "Hoje a mediana está em 4,8 dias. Quero reunir ideias para chegar a menos de 3 dias sem aumentar o esforço do time de CS.",
    reactionCount: 29, commentCount: 3, createdAt: ago(58), updatedAt: ago(22),
  },
  {
    id: "demo-poll", authorUid: "demo-ana", authorName: "Ana Ribeiro", scope: "community",
    companyId: company.id, companyName: company.name, communityId: "demo-comercial", communityName: "Comercial", communityVisibility: "private",
    type: "poll", text: "Qual tema deve abrir o próximo encontro de capacitação comercial?", reactionCount: 18, commentCount: 0,
    pollOptions: [
      { id: "poll-1", text: "Diagnóstico e perguntas", voteCount: 42 },
      { id: "poll-2", text: "Negociação de valor", voteCount: 67 },
      { id: "poll-3", text: "Demonstração do produto", voteCount: 31 },
      { id: "poll-4", text: "Contorno de objeções", voteCount: 54 },
    ],
    pollTotalVotes: 194, createdAt: ago(88), updatedAt: ago(88),
  },
  {
    id: "demo-event", authorUid: "demo-rafael", authorName: "Rafael Rocha", scope: "company",
    companyId: company.id, companyName: company.name, type: "event", title: "Town Hall · Resultados do trimestre",
    text: "Vamos compartilhar os resultados do trimestre, reconhecer conquistas e apresentar as três prioridades para o próximo ciclo.",
    eventStart: new Date(Date.now() + 7 * 86_400_000).toISOString(), eventEnd: new Date(Date.now() + 7 * 86_400_000 + 3_600_000).toISOString(),
    eventLocation: "Auditório + transmissão ao vivo", reactionCount: 63, commentCount: 1, createdAt: ago(130), updatedAt: ago(82),
  },
  {
    id: "demo-world", authorUid: "demo-beatriz", authorName: "Beatriz Alves", scope: "world",
    companyId: company.id, companyName: company.name, type: "post",
    text: "Compartilhamos nosso playbook aberto de onboarding B2B: aprendizados de mais de 400 implantações, com exemplos de rituais, checklist e indicadores.",
    reactionCount: 126, commentCount: 1, createdAt: ago(220), updatedAt: ago(170),
  },
];

const jobs = [
  { id: "job-1", title: "Product Designer Sênior", area: "Produto", location: "São Paulo · Híbrido", contract: "CLT", audience: "world" as const, description: "Pessoa para transformar descobertas de clientes em experiências simples e consistentes." },
  { id: "job-2", title: "Analista de Customer Success", area: "Experiência do Cliente", location: "Remoto · Brasil", contract: "CLT", audience: "world" as const, description: "Atuação consultiva no onboarding e na evolução da carteira de clientes B2B." },
  { id: "job-3", title: "Líder de Operações", area: "Operações", location: "Campinas · Presencial", contract: "Oportunidade interna", audience: "company" as const, description: "Oportunidade interna para liderar rotinas, indicadores e melhoria contínua." },
];

type DemoNotification = { id: string; title: string; body: string; read: boolean; type: "comment" | "member" | "like" | "read" };
const initialNotifications: DemoNotification[] = [
  { id: "notification-1", title: "João Lima respondeu sua publicação", body: "Consigo criar o gatilho no CRM e deixar os dados básicos pré-preenchidos…", read: false, type: "comment" },
  { id: "notification-2", title: "Camila Souza entrou na empresa", body: "Sugestão: adicione a nova colaboradora às comunidades ativas.", read: false, type: "member" },
  { id: "notification-3", title: "7 pessoas curtiram sua resposta", body: "Vamos testar com os próximos dez clientes e comparar com a coorte atual.", read: false, type: "like" },
  { id: "notification-4", title: "Confirmação de leitura pendente", body: "Novo benefício: Wellhub disponível a partir de setembro", read: true, type: "read" },
];

function NavButton({ active, icon, label, badge, onClick }: { active?: boolean; icon: ReactNode; label: string; badge?: number; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span>{!!badge && <b className="nav-badge">{badge}</b>}</button>;
}

function MobileNav({ active, icon, label, onClick }: { active?: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}>{icon}<small>{label}</small></button>;
}

export default function DemoApp() {
  const [view, setView] = useState<View>("home");
  const [homeTab, setHomeTab] = useState<HomeTab>("for-you");
  const [posts, setPosts] = useState(initialPosts);
  const [selectedCommunityId, setSelectedCommunityId] = useState("");
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState(initialNotifications);
  const [composerOpen, setComposerOpen] = useState(false);
  const [toast, setToast] = useState("");
  const unread = notifications.filter((item) => !item.read).length;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const navigate = (next: View) => {
    setView(next);
    if (next !== "communities") setSelectedCommunityId("");
  };

  const likePost = async (post: Post) => {
    const liked = !post.liked;
    const reactionCount = Math.max(0, Number(post.reactionCount || 0) + (liked ? 1 : -1));
    setPosts((current) => current.map((item) => item.id === post.id ? { ...item, liked, reactionCount } : item));
    return { liked, reactionCount };
  };

  const readPost = async (post: Post) => {
    setPosts((current) => current.map((item) => item.id === post.id ? { ...item, hasRead: true } : item));
    showToast("Leitura confirmada.");
  };

  const deletePost = async (post: Post) => {
    if (!window.confirm(post.authorUid === me.uid ? "Excluir sua publicação?" : "Apagar esta publicação como administrador?")) return;
    setPosts((current) => current.filter((item) => item.id !== post.id));
    showToast("Publicação excluída na demonstração.");
  };

  const renderPost = (post: Post) => (
    <PostCard
      key={post.id}
      post={post}
      companyName={company.name}
      community={communities.find((item) => item.id === post.communityId)}
      onLike={likePost}
      onRead={readPost}
      canDelete={post.authorUid === me.uid || post.scope !== "world"}
      onDelete={deletePost}
      currentUid={me.uid}
      canAdmin
      onChanged={() => undefined}
      showToast={showToast}
    />
  );

  const visibleHomePosts = useMemo(() => {
    if (homeTab === "world") return posts.filter((post) => post.scope === "world");
    if (homeTab === "announcement") return posts.filter((post) => post.type === "announcement");
    if (homeTab === "recent") return [...posts].sort((a, b) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0));
    return posts.filter((post) => post.scope !== "world");
  }, [homeTab, posts]);

  const submitPost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = String(data.get("text") || "").trim();
    if (!text) return;
    const next: Post = {
      id: `demo-post-${Date.now()}`, authorUid: me.uid, authorName: me.name, scope: "company", companyId: company.id,
      companyName: company.name, type: "post", text, reactionCount: 0, commentCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    setPosts((current) => [next, ...current]);
    setComposerOpen(false);
    setHomeTab("recent");
    setView("home");
    showToast("Publicação criada na demonstração.");
    form.reset();
  };

  const renderHome = () => (
    <>
      <section className="quick-compose">
        <Avatar name={me.name} />
        <button onClick={() => setComposerOpen(true)}>Compartilhe algo com sua empresa ou comunidade…</button>
      </section>
      <section className="feed">{visibleHomePosts.map(renderPost)}</section>
    </>
  );

  const renderCommunities = () => {
    const selected = communities.find((community) => community.id === selectedCommunityId);
    if (selected) {
      const communityPosts = posts.filter((post) => post.communityId === selected.id);
      return (
        <section className="page-section">
          <section className="community-detail-head">
            <button className="back-button" onClick={() => setSelectedCommunityId("")}>← Comunidades</button>
            <div className="community-detail-title">
              <div className="community-avatar large">{selected.name.slice(0, 2).toUpperCase()}</div>
              <div><h2>{selected.name}</h2><p>{selected.description}</p><span className={`community-visibility-badge ${selected.visibility}`}>{selected.visibility === "public" ? "Pública" : "Privada"}</span></div>
            </div>
            <button className="community-manage-members-tag" onClick={() => showToast("Gerência de membros aberta na demonstração.")}><Users size={13} /> Gerenciar membros <b>{selected.memberCount}</b></button>
          </section>
          <section className="feed community-feed">{communityPosts.map(renderPost)}</section>
        </section>
      );
    }
    return (
      <section className="page-section">
        <div className="page-heading"><div><h2>Comunidades</h2><p>Encontre os espaços de conversa da {company.name}.</p></div><button className="btn" onClick={() => showToast("Nova comunidade simulada.")}><CirclePlus size={17} /> Nova comunidade</button></div>
        <div className="community-grid">
          {communities.map((community) => (
            <button className="community-card community-link" key={community.id} onClick={() => setSelectedCommunityId(community.id)}>
              <div className="community-avatar">{community.name.slice(0, 2).toUpperCase()}</div>
              <div><strong>{community.name}</strong><p>{community.description}</p><span className="community-member-count"><Users size={12} /> {community.memberCount} membros</span></div>
            </button>
          ))}
        </div>
      </section>
    );
  };

  const renderSearch = () => {
    const query = search.trim().toLowerCase();
    const results = query.length >= 2 ? posts.filter((post) => `${post.title || ""} ${post.text} ${post.authorName || ""}`.toLowerCase().includes(query)) : [];
    return (
      <section className="page-section">
        <div className="page-heading"><div><h2>Buscar</h2><p>Pesquise publicações da empresa e de comunidades públicas.</p></div></div>
        <div className="large-search"><Search size={19} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Busque assuntos, respostas ou pessoas" />{search && <button className="icon-btn" onClick={() => setSearch("")}><X size={17} /></button>}</div>
        <section className="feed search-results">{results.map(renderPost)}{query.length >= 2 && !results.length && <div className="empty-state"><Search /><h3>Nenhum resultado</h3><p>Tente outro termo.</p></div>}</section>
      </section>
    );
  };

  const renderJobs = () => (
    <section className="page-section">
      <div className="page-heading jobs-heading"><div><h2>Vagas</h2><p>Oportunidades internas e públicas da empresa.</p></div><button className="btn" onClick={() => showToast("Cadastro de vaga aberto na demonstração.")}><Plus size={17} /> Divulgar vaga</button></div>
      <div className="jobs-tabs"><button className="active"><Building2 size={16} /> Todas <span>{jobs.length}</span></button><button><Users size={16} /> Internas <span>1</span></button><button><Globe2 size={16} /> Mundo <span>2</span></button></div>
      <div className="jobs-list">{jobs.map((job) => (
        <article className="job-card" key={job.id}>
          <div className="job-card-head"><div className="job-company-mark">LT</div><div className="ellipsis"><strong>{job.title}</strong><small>{company.name} · {job.area}</small></div><span className={`job-audience-pill ${job.audience === "world" ? "world" : ""}`}>{job.audience === "world" ? <Globe2 size={12} /> : <Building2 size={12} />}{job.audience === "world" ? "Mundo" : "Empresa"}</span></div>
          <p className="job-description">{job.description}</p><div className="job-meta"><span><MapPin size={13} /> {job.location}</span><span><BriefcaseBusiness size={13} /> {job.contract}</span></div>
          <div className="job-card-actions"><button className="btn small" onClick={() => showToast("Interesse registrado na demonstração.")}>Tenho interesse</button></div>
        </article>
      ))}</div>
    </section>
  );

  const renderAdmin = () => (
    <section className="page-section">
      <div className="page-heading admin-page-heading"><div><h2>Administrar</h2><p>Gerencie empresa, pessoas e comunidades.</p></div><button className="btn secondary" onClick={() => showToast("Dados fiscais disponíveis para edição.")}>Editar dados da empresa</button></div>
      <div className="admin-company-context"><div className="company-profile-mark">LT</div><div><strong>{company.name}</strong><small>Plano Premium · 248 colaboradores</small></div><span className="plan-pill premium"><Crown size={12} /> Premium</span></div>
      <div className="admin-grid">
        <section className="panel-card"><h3>Membros da empresa</h3><div className="member-list">{["Gabriel Duclos", "Mariana Costa", "Lucas Martins", "Camila Souza"].map((name, index) => <div className="member-row" key={name}><Avatar name={name} size={38} /><div><strong>{name}</strong><small>{index === 0 ? "Proprietário" : index === 1 ? "Administrador" : "Colaborador"}</small></div><select defaultValue={index < 2 ? "admin" : "member"}><option value="admin">Administrador</option><option value="member">Colaborador</option></select></div>)}</div></section>
        <section className="panel-card"><h3>Convidar colaborador</h3><form className="stack-form" onSubmit={(event) => { event.preventDefault(); showToast("Convite fictício enviado."); }}><label><span>E-mail</span><input type="email" defaultValue="novo.colaborador@lumina.demo" /></label><button className="btn"><Mail size={16} /> Enviar convite</button></form></section>
      </div>
      <section className="panel-card"><h3>Comunidades</h3><p className="admin-community-help">Defina a visibilidade e abra a gerência de membros.</p>{communities.map((community) => <div className="admin-community-row" key={community.id}><div className="community-avatar">{community.name.slice(0, 2).toUpperCase()}</div><div><strong>{community.name}</strong><small>{community.memberCount} membros</small></div><span className="private-pill">{community.visibility === "public" ? "Pública" : "Privada"}</span><div className="admin-community-actions"><button className="btn secondary small" onClick={() => { setSelectedCommunityId(community.id); setView("communities"); }}><Users size={14} /> Gerenciar membros</button></div></div>)}</section>
    </section>
  );

  const renderProfile = () => (
    <section className="page-section">
      <div className="profile-grid">
        <section className="panel-card profile-panel"><div className="profile-head"><div className="avatar-edit"><Avatar name={me.name} size={92} /><button className="camera-button" onClick={() => showToast("Escolha de foto disponível na versão principal.")}><Camera size={18} /></button></div><div><h2>{me.name}</h2><p>{me.email}</p><span className="private-pill">E-mail verificado</span></div></div><p className="muted">Sua conta Uorqui pertence a você, mesmo quando você troca de empresa.</p></section>
        <section className="panel-card"><div className="settings-heading"><LockKeyhole /><div><h3>Alterar senha</h3><p>Atualize sua senha de acesso.</p></div></div><form className="stack-form" onSubmit={(event) => { event.preventDefault(); showToast("Senha atualizada na simulação."); }}><label><span>Senha atual</span><input type="password" value="12345678" readOnly /></label><label><span>Nova senha</span><input type="password" value="novasenha" readOnly /></label><button className="btn">Salvar senha</button></form></section>
      </div>
      <section className="panel-card profile-companies-card"><div className="profile-companies-head"><div><strong>Suas empresas</strong><p className="muted">Ambientes de trabalho vinculados à sua conta.</p></div><button className="btn secondary small"><Plus size={15} /> Criar empresa</button></div><div className="profile-company-list"><div className="profile-company-row"><div className="company-profile-mark">LT</div><div><strong>{company.name}</strong><small>Proprietário · Premium</small></div><span className="private-pill">Atual</span></div></div></section>
    </section>
  );

  const renderNotifications = () => (
    <section className="page-section">
      <div className="page-heading"><div><h2>Notificações</h2><p>Acompanhe respostas, curtidas, convites e confirmações.</p></div></div>
      <div className="notifications-page-list">{notifications.map((item) => {
        const Icon = item.type === "member" ? UserPlus : item.type === "like" ? Bell : item.type === "read" ? Megaphone : MessageCircle;
        return <article className={`notification-page-item ${item.read ? "" : "unread"}`} key={item.id} onClick={() => { setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, read: true } : notification)); showToast("Notificação aberta."); }}><div className="notification-icon"><Icon size={17} /></div><div className="notification-page-copy"><strong>{item.title}</strong><p>{item.body}</p><span className="notification-open-post">Abrir conteúdo</span></div><div className="notification-page-actions">{!item.read && <span className="unread-dot" />}<button className="icon-btn notification-delete-button" onClick={(event) => { event.stopPropagation(); setNotifications((current) => current.filter((notification) => notification.id !== item.id)); }}><Trash2 size={15} /></button></div></article>;
      })}</div>
    </section>
  );

  const renderPlans = () => (
    <section className="page-section">
      <div className="page-heading plans-heading"><div><h2>Planos</h2><p>Escolha os limites ideais para a empresa.</p></div></div>
      <div className="plans-company-summary"><div className="company-profile-mark">LT</div><div><strong>{company.name}</strong><small>248 membros · 4 comunidades</small></div><span className="plan-pill premium"><Crown size={12} /> Premium</span></div>
      <div className="plans-grid">
        <article className="plan-card"><div className="plan-card-head"><div><span className="plan-eyebrow">Comece gratuitamente</span><h3>Free</h3></div><strong className="plan-price">R$ 0<small>para sempre</small></strong></div><p className="plan-description">Para equipes pequenas validarem o Uorqui.</p><ul className="plan-features"><li><Check size={15} /> Até 5 colaboradores</li><li><Check size={15} /> Até 2 comunidades</li><li><Check size={15} /> Publicações e respostas</li></ul><button className="btn secondary plan-current-button">Plano básico</button></article>
        <article className="plan-card premium-card current"><span className="premium-ribbon">Recomendado</span><div className="plan-card-head"><div><span className="plan-eyebrow"><Crown size={12} /> Equipes em crescimento</span><h3>Premium</h3></div><strong className="plan-price">R$ 49,90<small>por mês</small></strong></div><p className="plan-description">Comunidades e colaboradores sem os limites do Free.</p><ul className="plan-features"><li><Check size={15} /> Colaboradores ilimitados</li><li><Check size={15} /> Comunidades ilimitadas</li><li><Check size={15} /> Métricas e gestão avançada</li><li><Check size={15} /> Vagas internas e públicas</li></ul><button className="btn plan-upgrade-button" onClick={() => showToast("Premium já está ativo nesta demonstração.")}><CreditCard size={16} /> Premium ativo</button></article>
      </div>
    </section>
  );

  const renderPage = () => {
    if (view === "home") return renderHome();
    if (view === "communities") return renderCommunities();
    if (view === "search") return renderSearch();
    if (view === "jobs") return renderJobs();
    if (view === "admin" || view === "company-data") return renderAdmin();
    if (view === "notifications") return renderNotifications();
    if (view === "plans") return renderPlans();
    return renderProfile();
  };

  const pageTitle: Partial<Record<View, string>> = { home: "Início", communities: "Comunidades", search: "Buscar", jobs: "Vagas", admin: "Administrar", profile: "Perfil", notifications: "Notificações", plans: "Planos" };

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <button className="brand-button" onClick={() => navigate("home")}><img src="/assets/uorqui-wordmark.png" alt="Uorqui" /></button>
          <label className="company-picker"><span className="company-mark">LT</span><select defaultValue={company.id}><option value={company.id}>{company.name}</option></select><ChevronDown size={16} /></label>
          <nav className="side-nav">
            <NavButton active={view === "home"} icon={<Home />} label="Início" onClick={() => navigate("home")} />
            <NavButton active={view === "communities"} icon={<Users />} label="Comunidades" onClick={() => navigate("communities")} />
            <NavButton active={view === "search"} icon={<Search />} label="Buscar" onClick={() => navigate("search")} />
            <NavButton active={view === "jobs"} icon={<BriefcaseBusiness />} label="Vagas" onClick={() => navigate("jobs")} />
            <NavButton active={view === "admin"} icon={<Settings />} label="Administrar" onClick={() => navigate("admin")} />
            <NavButton active={view === "plans"} icon={<Crown />} label="Planos" onClick={() => navigate("plans")} />
            <NavButton active={view === "profile"} icon={<UserRound />} label="Perfil" onClick={() => navigate("profile")} />
          </nav>
          <button className="btn publish-main" onClick={() => setComposerOpen(true)}><Plus size={19} /> Publicar</button>
          <div className="sidebar-user"><Avatar name={me.name} /><div className="ellipsis"><strong>{me.name}</strong><small>{me.email}</small></div><button className="icon-btn" onClick={() => showToast("A demonstração permanece aberta.")}><LogOut size={18} /></button></div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="topbar-line">
              <div className="topbar-brand"><button className="mobile-logo" onClick={() => navigate("home")}><img src="/assets/uorqui-wordmark.png" alt="Uorqui" /></button><h1>{pageTitle[view] || "Uorqui"}</h1></div>
              <form className="mobile-header-search" onSubmit={(event) => { event.preventDefault(); navigate("search"); }}><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); if (event.target.value.trim().length >= 2) navigate("search"); }} placeholder="Buscar" /></form>
              <div className="topbar-actions"><button className={`icon-btn top-bell ${view === "notifications" ? "active" : ""}`} onClick={() => navigate("notifications")}><Bell size={21} />{unread > 0 && <span className="count-badge">{unread}</span>}</button><button className={`icon-btn header-admin-button ${view === "admin" ? "active" : ""}`} onClick={() => navigate("admin")}><Settings size={21} /></button><button className={`icon-btn mobile-plan-button ${view === "plans" ? "active" : ""}`} onClick={() => navigate("plans")}><Crown size={21} /></button></div>
            </div>
            {view === "home" && <div className="tabs">{([['for-you','Para você'],['recent','Recentes'],['announcement','Comunicados'],['world','Mundo']] as const).map(([id,label]) => <button key={id} className={homeTab === id ? "active" : ""} onClick={() => setHomeTab(id)}>{label}</button>)}</div>}
          </header>
          {renderPage()}
        </main>

        <aside className="rightbar">
          <button className="global-search" onClick={() => navigate("search")}><Search size={18} /><span>Buscar conversas e soluções</span></button>
          <section className="side-card"><strong>{company.name}</strong><small>Proprietário · ambiente demonstrativo</small></section>
          <button className="side-card side-plan-card" onClick={() => navigate("plans")}><span className="plan-pill premium"><Crown size={12} /> Premium</span><strong>Plano da empresa</strong><small>Premium ativo</small></button>
          <section className="side-card"><strong>Suas comunidades</strong>{communities.map((community) => <button className="mini-community" key={community.id} onClick={() => { setSelectedCommunityId(community.id); setView("communities"); }}><span>{community.name.slice(0,2).toUpperCase()}</span><div><b>{community.name}</b><small>{community.description}</small></div></button>)}</section>
          <section className="side-card compact"><strong>Uorqui 1.2.20</strong><small>Demonstração com dados totalmente fictícios.</small></section>
        </aside>
      </div>

      <nav className="mobile-nav">
        <MobileNav active={view === "home"} icon={<Home />} label="Início" onClick={() => navigate("home")} />
        <MobileNav active={view === "communities"} icon={<Users />} label="Comunidades" onClick={() => navigate("communities")} />
        <button className="mobile-create" onClick={() => setComposerOpen(true)}><Plus size={26} /></button>
        <MobileNav active={view === "jobs"} icon={<BriefcaseBusiness />} label="Vagas" onClick={() => navigate("jobs")} />
        <MobileNav active={view === "profile"} icon={<UserRound />} label="Perfil" onClick={() => navigate("profile")} />
      </nav>

      {composerOpen && <Modal title="Criar publicação" onClose={() => setComposerOpen(false)}><form className="composer-form" onSubmit={submitPost}><div className="audience-row"><button type="button" className="selected"><Building2 size={15} /> Empresa</button><button type="button"><Users size={15} /> Comunidade</button><button type="button"><Globe2 size={15} /> Mundo</button></div><label><span>O que você quer compartilhar?</span><textarea name="text" rows={5} required placeholder="Escreva sua publicação…" /></label><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setComposerOpen(false)}>Cancelar</button><button className="btn">Publicar</button></div></form></Modal>}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
