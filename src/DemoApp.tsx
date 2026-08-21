import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  BarChart3, Bell, BriefcaseBusiness, Building2, CalendarDays, Check, CheckCircle2,
  ChevronDown, CirclePlus, Clock3, Eye, Globe2, Heart, Home, LockKeyhole, MapPin,
  Megaphone, MessageCircle, MoreHorizontal, Plus, Search, Send, Settings, Share2,
  Sparkles, Target, Trash2, TrendingUp, UserPlus, UserRound, Users, Vote, X
} from "lucide-react";
import "./demo.css";

type DemoSection = "dashboard" | "feed" | "communities" | "jobs" | "notifications";
type DemoPerson = { name: string; role: string; color: string };
type DemoComment = { id: string; author: DemoPerson; text: string; time: string; likes: number; liked?: boolean; mine?: boolean };
type DemoPollOption = { id: string; text: string; votes: number };
type DemoPost = {
  id: string;
  type: "post" | "announcement" | "question" | "poll" | "event";
  author: DemoPerson;
  time: string;
  scope: "company" | "community" | "world";
  communityId?: string;
  communityName?: string;
  title?: string;
  text: string;
  likes: number;
  liked?: boolean;
  comments: DemoComment[];
  resolved?: boolean;
  requiresRead?: boolean;
  read?: boolean;
  poll?: DemoPollOption[];
  event?: { date: string; location: string };
};

const me: DemoPerson = { name: "Gabriel Duclos", role: "Proprietário", color: "#24272d" };

const people = {
  mariana: { name: "Mariana Costa", role: "Pessoas & Cultura", color: "#8a5b48" },
  lucas: { name: "Lucas Martins", role: "Produto", color: "#426a73" },
  ana: { name: "Ana Ribeiro", role: "Comercial", color: "#6b5c8e" },
  joao: { name: "João Lima", role: "Tecnologia", color: "#496a4f" },
  beatriz: { name: "Beatriz Alves", role: "Customer Success", color: "#8c5d73" },
  rafael: { name: "Rafael Rocha", role: "Operações", color: "#6b6348" }
} satisfies Record<string, DemoPerson>;

const communities = [
  { id: "geral", name: "Geral", description: "Novidades e conversas de toda a empresa", members: 248, posts: 684, visibility: "public", color: "#23262c", trend: "+18%" },
  { id: "produto", name: "Produto & Tecnologia", description: "Roadmap, descobertas e decisões técnicas", members: 64, posts: 392, visibility: "public", color: "#456d76", trend: "+31%" },
  { id: "comercial", name: "Comercial", description: "Oportunidades, playbooks e aprendizados", members: 38, posts: 276, visibility: "private", color: "#6c5a8d", trend: "+22%" },
  { id: "pessoas", name: "Pessoas & Cultura", description: "Benefícios, rituais e desenvolvimento", members: 248, posts: 181, visibility: "public", color: "#8b5d48", trend: "+12%" },
  { id: "lideranca", name: "Liderança", description: "Alinhamentos estratégicos e indicadores", members: 18, posts: 143, visibility: "private", color: "#5c6475", trend: "+9%" },
  { id: "ideias", name: "Banco de ideias", description: "Sugestões que podem virar projetos", members: 171, posts: 166, visibility: "public", color: "#567154", trend: "+27%" }
] as const;

const initialPosts: DemoPost[] = [
  {
    id: "p1", type: "announcement", author: people.mariana, time: "há 18 min", scope: "company",
    title: "Novo benefício: Wellhub disponível a partir de setembro",
    text: "Fechamos uma parceria para ampliar o cuidado com saúde e bem-estar. O cadastro estará disponível no portal de benefícios na próxima segunda-feira. Leiam o guia e confirmem a ciência abaixo.",
    likes: 47, requiresRead: true, comments: [
      { id: "c11", author: people.beatriz, text: "Ótima novidade! O benefício também contempla dependentes?", time: "há 12 min", likes: 6 },
      { id: "c12", author: people.mariana, text: "Sim, Bia. Até três dependentes, com contratação direto pelo aplicativo.", time: "há 8 min", likes: 9 }
    ]
  },
  {
    id: "p2", type: "question", author: people.lucas, time: "há 42 min", scope: "community", communityId: "produto", communityName: "Produto & Tecnologia",
    title: "Como reduzir o tempo de ativação dos novos clientes?",
    text: "Hoje a mediana está em 4,8 dias. Quero reunir ideias para chegar a menos de 3 dias sem aumentar o esforço do time de CS. O que vocês já observaram nas últimas implantações?",
    likes: 29, comments: [
      { id: "c21", author: people.beatriz, text: "Os clientes que recebem o checklist antes da primeira reunião avançam quase dois dias mais rápido. Podemos automatizar esse envio no aceite do contrato.", time: "há 31 min", likes: 18 },
      { id: "c22", author: people.joao, text: "Consigo criar o gatilho no CRM e deixar os dados básicos pré-preenchidos. Faço um protótipo ainda esta semana.", time: "há 22 min", likes: 11 },
      { id: "c23", author: me, text: "Vamos testar com os próximos dez clientes e comparar com a coorte atual.", time: "há 10 min", likes: 7, mine: true }
    ]
  },
  {
    id: "p3", type: "poll", author: people.ana, time: "há 1 h", scope: "community", communityId: "comercial", communityName: "Comercial",
    text: "Qual tema deve abrir o próximo encontro de capacitação comercial?", likes: 18, comments: [],
    poll: [
      { id: "o1", text: "Diagnóstico e perguntas", votes: 42 },
      { id: "o2", text: "Negociação de valor", votes: 67 },
      { id: "o3", text: "Demonstração do produto", votes: 31 },
      { id: "o4", text: "Contorno de objeções", votes: 54 }
    ]
  },
  {
    id: "p4", type: "event", author: people.rafael, time: "há 2 h", scope: "company",
    title: "Town Hall · Resultados do trimestre", text: "Vamos compartilhar os resultados do trimestre, reconhecer conquistas e apresentar as três prioridades para o próximo ciclo.",
    likes: 63, comments: [{ id: "c41", author: people.ana, text: "Quem estiver em visita poderá acompanhar a gravação depois?", time: "há 1 h", likes: 3 }],
    event: { date: "28 ago · 16h00", location: "Auditório + transmissão ao vivo" }
  },
  {
    id: "p5", type: "post", author: people.beatriz, time: "ontem", scope: "world",
    text: "Compartilhamos nosso playbook aberto de onboarding B2B: aprendizados de mais de 400 implantações, com exemplos de rituais, checklist e indicadores. Espero que ajude outras equipes!",
    likes: 126, comments: [{ id: "c51", author: people.lucas, text: "Ficou excelente — e já gerou boas conversas com o mercado.", time: "há 19 h", likes: 14 }]
  }
];

const jobs = [
  { title: "Product Designer Sênior", area: "Produto", location: "São Paulo · Híbrido", type: "CLT", audience: "Mundo", applicants: 34, age: "há 2 dias" },
  { title: "Analista de Customer Success", area: "Experiência do Cliente", location: "Remoto · Brasil", type: "CLT", audience: "Mundo", applicants: 51, age: "há 4 dias" },
  { title: "Líder de Operações", area: "Operações", location: "Campinas · Presencial", type: "Oportunidade interna", audience: "Empresa", applicants: 8, age: "há 6 dias" }
];

const notifications = [
  { icon: MessageCircle, color: "blue", title: "João Lima respondeu sua publicação", text: "Consigo criar o gatilho no CRM e deixar os dados básicos pré-preenchidos…", time: "há 22 min", unread: true },
  { icon: UserPlus, color: "green", title: "Camila Souza entrou na empresa", text: "Sugestão: adicione a nova colaboradora às comunidades ativas.", time: "há 38 min", unread: true },
  { icon: Heart, color: "red", title: "7 pessoas curtiram sua resposta", text: "Vamos testar com os próximos dez clientes e comparar com a coorte atual.", time: "há 1 h", unread: true },
  { icon: Bell, color: "amber", title: "Confirmação de leitura pendente", text: "Novo benefício: Wellhub disponível a partir de setembro", time: "há 2 h", unread: false },
  { icon: BriefcaseBusiness, color: "purple", title: "Nova candidatura interna", text: "Uma pessoa se candidatou à vaga Líder de Operações.", time: "ontem", unread: false }
];

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function DemoAvatar({ person, size = 38 }: { person: DemoPerson; size?: number }) {
  return <span className="demo-avatar" style={{ width: size, height: size, background: person.color }}>{initials(person.name)}</span>;
}

function NavItem({ active, icon, children, count, onClick }: { active?: boolean; icon: ReactNode; children: ReactNode; count?: number; onClick: () => void }) {
  return (
    <button className={`demo-nav-item ${active ? "active" : ""}`} onClick={onClick}>
      {icon}<span>{children}</span>{count ? <b>{count}</b> : null}
    </button>
  );
}

function MetricCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: string }) {
  return (
    <article className="demo-metric-card">
      <span className={`demo-metric-icon ${tone}`}>{icon}</span>
      <div><small>{label}</small><strong>{value}</strong><p><TrendingUp size={13} /> {detail}</p></div>
    </article>
  );
}

function Dashboard({ onOpenFeed, onOpenCommunity }: { onOpenFeed: () => void; onOpenCommunity: (id: string) => void }) {
  const chart = [48, 62, 57, 76, 69, 88, 81];
  return (
    <div className="demo-page demo-dashboard">
      <div className="demo-page-title">
        <div><span className="demo-eyebrow"><Sparkles size={14} /> Sexta-feira, 21 de agosto</span><h1>Bom dia, Gabriel</h1><p>Veja o que está movimentando a Lumina hoje.</p></div>
        <button className="demo-primary" onClick={onOpenFeed}><Plus size={17} /> Nova publicação</button>
      </div>

      <div className="demo-metrics-grid">
        <MetricCard icon={<Users />} label="Colaboradores ativos" value="248" detail="12 neste mês" tone="ink" />
        <MetricCard icon={<MessageCircle />} label="Conversas no mês" value="1.842" detail="18,4% vs. julho" tone="blue" />
        <MetricCard icon={<Target />} label="Taxa de participação" value="87%" detail="6,2 p.p. no trimestre" tone="green" />
        <MetricCard icon={<CheckCircle2 />} label="Assuntos concluídos" value="326" detail="91% com resposta" tone="purple" />
      </div>

      <div className="demo-dashboard-grid">
        <section className="demo-panel demo-engagement-panel">
          <div className="demo-panel-head"><div><h2>Engajamento</h2><p>Interações nos últimos 7 dias</p></div><button>7 dias <ChevronDown size={14} /></button></div>
          <div className="demo-chart-summary"><strong>4.286</strong><span><TrendingUp size={13} /> 14,8%</span></div>
          <div className="demo-bar-chart">
            {chart.map((value, index) => <div key={index}><i style={{ height: `${value}%` }} /><span>{["S", "T", "Q", "Q", "S", "S", "D"][index]}</span></div>)}
          </div>
        </section>

        <section className="demo-panel demo-pulse-panel">
          <div className="demo-panel-head"><div><h2>Pulso da empresa</h2><p>Pesquisa semanal · 193 respostas</p></div><MoreHorizontal size={18} /></div>
          <div className="demo-pulse-score"><strong>8,7</strong><span>/ 10</span></div>
          <div className="demo-pulse-track"><i /></div>
          <div className="demo-pulse-labels"><span>Precisa de atenção</span><span>Excelente</span></div>
          <div className="demo-pulse-footer"><span>Principal destaque</span><strong>Clareza das prioridades</strong></div>
        </section>
      </div>

      <div className="demo-dashboard-grid lower">
        <section className="demo-panel">
          <div className="demo-panel-head"><div><h2>Comunidades em alta</h2><p>Onde as conversas mais cresceram</p></div><button onClick={() => onOpenCommunity("produto")}>Ver todas</button></div>
          <div className="demo-ranking">
            {communities.slice(1, 5).map((community, index) => (
              <button key={community.id} onClick={() => onOpenCommunity(community.id)}>
                <b>{index + 1}</b><span className="demo-community-mark" style={{ background: community.color }}>{initials(community.name)}</span>
                <div><strong>{community.name}</strong><small>{community.posts} publicações</small></div><em>{community.trend}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="demo-panel demo-activity-panel">
          <div className="demo-panel-head"><div><h2>Atividade recente</h2><p>Movimentos importantes de hoje</p></div></div>
          {notifications.slice(0, 4).map((item, index) => {
            const Icon = item.icon;
            return <div className="demo-activity" key={index}><span className={item.color}><Icon size={15} /></span><div><strong>{item.title}</strong><small>{item.time}</small></div></div>;
          })}
        </section>
      </div>
    </div>
  );
}

function DemoPostCard({ post, onLike, onComment, onDeleteComment, onResolve, showToast }: {
  post: DemoPost;
  onLike: (id: string) => void;
  onComment: (id: string, text: string) => void;
  onDeleteComment: (postId: string, commentId: string) => void;
  onResolve: (id: string) => void;
  showToast: (message: string) => void;
}) {
  const [commentsOpen, setCommentsOpen] = useState(post.id === "p2");
  const [selectedPoll, setSelectedPoll] = useState("");
  const [read, setRead] = useState(Boolean(post.read));
  const totalVotes = (post.poll || []).reduce((sum, option) => sum + option.votes + (selectedPoll === option.id ? 1 : 0), 0);
  const scope = post.scope === "world" ? "Mundo" : post.scope === "community" ? post.communityName : "Lumina Tech";

  const addComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = String(new FormData(form).get("comment") || "").trim();
    if (!value) return;
    onComment(post.id, value);
    form.reset();
    setCommentsOpen(true);
  };

  return (
    <article className="demo-post-card">
      <header className="demo-post-head">
        <DemoAvatar person={post.author} />
        <div><strong>{post.author.name}</strong><span>{post.author.role} · {post.time}</span><small className={post.scope}>{post.scope === "world" ? <Globe2 size={11} /> : post.scope === "community" ? <Users size={11} /> : <Building2 size={11} />}{scope}</small></div>
        <button className="demo-icon-button"><MoreHorizontal size={19} /></button>
      </header>

      <div className="demo-post-content">
        {post.type === "announcement" && <span className="demo-post-kind announcement"><Megaphone size={13} /> COMUNICADO</span>}
        {post.type === "question" && <span className="demo-post-kind question"><MessageCircle size={13} /> PERGUNTA</span>}
        {post.type === "poll" && <span className="demo-post-kind poll"><Vote size={13} /> ENQUETE</span>}
        {post.type === "event" && <span className="demo-post-kind event"><CalendarDays size={13} /> EVENTO</span>}
        {post.title && <h2>{post.title}</h2>}
        <p>{post.text}</p>

        {post.event && <div className="demo-event-box"><span><CalendarDays size={17} /><b>{post.event.date}</b></span><span><MapPin size={17} />{post.event.location}</span><button onClick={() => showToast("Evento adicionado à agenda.")}><Plus size={14} /> Adicionar à agenda</button></div>}

        {post.poll && <div className="demo-poll-options">
          {post.poll.map((option) => {
            const votes = option.votes + (selectedPoll === option.id ? 1 : 0);
            const percentage = Math.round((votes / Math.max(1, totalVotes)) * 100);
            return <button key={option.id} className={selectedPoll === option.id ? "selected" : ""} onClick={() => setSelectedPoll(option.id)}><i style={{ width: `${percentage}%` }} /><span>{option.text}</span><b>{percentage}%</b>{selectedPoll === option.id && <Check size={14} />}</button>;
          })}
          <small>{totalVotes} votos · votação demonstrativa</small>
        </div>}

        {post.requiresRead && <div className="demo-read-box"><div><Eye size={17} /><span><strong>Confirmação de leitura</strong><small>{read ? "Leitura confirmada por você" : "212 de 248 pessoas confirmaram"}</small></span></div><button className={read ? "done" : ""} onClick={() => { setRead(true); showToast("Leitura confirmada."); }}>{read ? <><Check size={14} /> Confirmado</> : "Confirmar leitura"}</button></div>}
      </div>

      <footer className="demo-post-actions">
        <button className={post.liked ? "liked" : ""} onClick={() => onLike(post.id)}><Heart size={18} fill={post.liked ? "currentColor" : "none"} /><span>{post.likes}</span><em>curtidas</em></button>
        <button className={commentsOpen ? "active" : ""} onClick={() => setCommentsOpen((value) => !value)}><MessageCircle size={18} /><span>{post.comments.length}</span><em>respostas</em></button>
        <button onClick={() => showToast("Link da publicação copiado.")}><Share2 size={18} /><em>compartilhar</em></button>
        {(post.type === "question" || post.type === "post") && post.scope !== "world" && <button className={`demo-resolve ${post.resolved ? "done" : ""}`} onClick={() => onResolve(post.id)}>{post.resolved ? <CheckCircle2 size={18} /> : <CheckCircle2 size={18} />}<em>{post.resolved ? "Concluído" : "Marcar como concluído"}</em></button>}
      </footer>

      {commentsOpen && <section className="demo-comments">
        {post.comments.map((comment) => <article key={comment.id} className="demo-comment"><DemoAvatar person={comment.author} size={32} /><div><header><strong>{comment.author.name}</strong><span>{comment.time}</span></header><p>{comment.text}</p><footer><button className={comment.liked ? "liked" : ""}><Heart size={13} /> Curtir {comment.likes > 0 && <b>{comment.likes}</b>}</button><button className="demo-comment-delete" onClick={() => { if (confirm("Excluir esta resposta da demonstração?")) onDeleteComment(post.id, comment.id); }}><Trash2 size={13} /> Excluir</button></footer></div></article>)}
        {!post.comments.length && <p className="demo-empty-comments">Seja a primeira pessoa a responder.</p>}
        <form className="demo-comment-form" onSubmit={addComment}><DemoAvatar person={me} size={32} /><input name="comment" placeholder="Escreva uma resposta…" autoComplete="off" /><button><Send size={15} /></button></form>
      </section>}
    </article>
  );
}

function Feed({ posts, setPosts, showToast, initialCommunityId = "" }: {
  posts: DemoPost[];
  setPosts: React.Dispatch<React.SetStateAction<DemoPost[]>>;
  showToast: (message: string) => void;
  initialCommunityId?: string;
}) {
  const [tab, setTab] = useState<"for-you" | "recent" | "announcements" | "world">("for-you");
  const [composerOpen, setComposerOpen] = useState(false);
  const [communityId, setCommunityId] = useState(initialCommunityId);
  const visible = posts.filter((post) => communityId ? post.communityId === communityId : tab === "world" ? post.scope === "world" : tab === "announcements" ? post.type === "announcement" : true);

  const createPost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("text") || "").trim();
    if (!text) return;
    setPosts((current) => [{ id: `demo-${Date.now()}`, type: "post", author: me, time: "agora", scope: "company", text, likes: 0, comments: [] }, ...current]);
    setComposerOpen(false);
    showToast("Publicação criada na demonstração.");
  };

  const updatePost = (postId: string, updater: (post: DemoPost) => DemoPost) => setPosts((current) => current.map((post) => post.id === postId ? updater(post) : post));

  return (
    <div className="demo-page demo-feed-page">
      <div className="demo-page-title compact"><div><h1>{communityId ? communities.find((item) => item.id === communityId)?.name : "Início"}</h1><p>{communityId ? "Conversas e decisões desta comunidade" : "Conversas que merecem sua atenção"}</p></div><button className="demo-primary" onClick={() => setComposerOpen(true)}><Plus size={17} /> Publicar</button></div>
      {!communityId && <div className="demo-feed-tabs"><button className={tab === "for-you" ? "active" : ""} onClick={() => setTab("for-you")}>Para você</button><button className={tab === "recent" ? "active" : ""} onClick={() => setTab("recent")}>Recentes</button><button className={tab === "announcements" ? "active" : ""} onClick={() => setTab("announcements")}>Comunicados</button><button className={tab === "world" ? "active" : ""} onClick={() => setTab("world")}><Globe2 size={14} /> Mundo</button></div>}
      {communityId && <button className="demo-clear-filter" onClick={() => setCommunityId("")}><X size={14} /> Ver todo o feed</button>}
      <button className="demo-quick-compose" onClick={() => setComposerOpen(true)}><DemoAvatar person={me} /><span>Compartilhe uma novidade, pergunta ou ideia…</span><Sparkles size={18} /></button>
      <div className="demo-feed">
        {visible.map((post) => <DemoPostCard
          key={post.id} post={post} showToast={showToast}
          onLike={(id) => updatePost(id, (item) => ({ ...item, liked: !item.liked, likes: Math.max(0, item.likes + (item.liked ? -1 : 1)) }))}
          onComment={(id, text) => updatePost(id, (item) => ({ ...item, comments: [...item.comments, { id: `comment-${Date.now()}`, author: me, text, time: "agora", likes: 0, mine: true }] }))}
          onDeleteComment={(id, commentId) => { updatePost(id, (item) => ({ ...item, comments: item.comments.filter((comment) => comment.id !== commentId) })); showToast("Resposta excluída."); }}
          onResolve={(id) => updatePost(id, (item) => ({ ...item, resolved: !item.resolved }))}
        />)}
      </div>

      {composerOpen && <div className="demo-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setComposerOpen(false)}><div className="demo-modal"><header><div><span>Nova publicação</span><small>Lumina Tech</small></div><button onClick={() => setComposerOpen(false)}><X size={19} /></button></header><form onSubmit={createPost}><div className="demo-composer-author"><DemoAvatar person={me} /><div><strong>{me.name}</strong><button type="button"><Building2 size={13} /> Toda a empresa <ChevronDown size={13} /></button></div></div><textarea name="text" autoFocus placeholder="O que você quer compartilhar?" /><div className="demo-composer-types"><button type="button"><MessageCircle size={15} /> Pergunta</button><button type="button"><Vote size={15} /> Enquete</button><button type="button"><CalendarDays size={15} /> Evento</button></div><footer><small>Os dados desta tela são apenas demonstrativos.</small><button className="demo-primary"><Send size={15} /> Publicar</button></footer></form></div></div>}
    </div>
  );
}

function Communities({ onOpen }: { onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<"all" | "mine" | "public">("all");
  const list = communities.filter((community) => filter !== "public" || community.visibility === "public");
  return (
    <div className="demo-page">
      <div className="demo-page-title"><div><h1>Comunidades</h1><p>Espaços para cada time, tema e iniciativa da Lumina.</p></div><button className="demo-primary"><CirclePlus size={17} /> Criar comunidade</button></div>
      <div className="demo-community-toolbar"><div><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todas</button><button className={filter === "mine" ? "active" : ""} onClick={() => setFilter("mine")}>Participo</button><button className={filter === "public" ? "active" : ""} onClick={() => setFilter("public")}>Públicas</button></div><label><Search size={16} /><input placeholder="Buscar comunidade" /></label></div>
      <div className="demo-community-grid">
        {list.map((community) => <article key={community.id} className="demo-community-card" onClick={() => onOpen(community.id)}><header><span className="demo-community-mark large" style={{ background: community.color }}>{initials(community.name)}</span><span className={`demo-visibility ${community.visibility}`}>{community.visibility === "public" ? <Globe2 size={12} /> : <LockKeyhole size={12} />}{community.visibility === "public" ? "Pública" : "Privada"}</span></header><h2>{community.name}</h2><p>{community.description}</p><footer><span><Users size={14} /> {community.members} membros</span><span><MessageCircle size={14} /> {community.posts}</span><b>{community.trend}</b></footer></article>)}
      </div>
    </div>
  );
}

function Jobs() {
  return (
    <div className="demo-page">
      <div className="demo-page-title"><div><h1>Vagas</h1><p>Oportunidades abertas para talentos internos e para o mercado.</p></div><button className="demo-primary"><Plus size={17} /> Publicar vaga</button></div>
      <div className="demo-jobs-summary"><div><strong>3</strong><span>Vagas abertas</span></div><div><strong>93</strong><span>Candidaturas</span></div><div><strong>1</strong><span>Oportunidade interna</span></div></div>
      <div className="demo-job-tabs"><button className="active">Todas <span>3</span></button><button>Somente empresa <span>1</span></button><button>Para o mundo <span>2</span></button></div>
      <div className="demo-job-list">
        {jobs.map((job) => <article key={job.title}><span className="demo-job-icon"><BriefcaseBusiness /></span><div className="demo-job-main"><small>{job.area}</small><h2>{job.title}</h2><p><MapPin size={14} /> {job.location}<span>·</span>{job.type}</p><div><span className={job.audience === "Mundo" ? "world" : "company"}>{job.audience === "Mundo" ? <Globe2 size={12} /> : <Building2 size={12} />}{job.audience}</span><em>{job.age}</em></div></div><aside><strong>{job.applicants}</strong><span>candidaturas</span><button>Ver vaga</button></aside></article>)}
      </div>
    </div>
  );
}

function Notifications() {
  const [items, setItems] = useState(notifications);
  return (
    <div className="demo-page demo-notifications-page">
      <div className="demo-page-title"><div><h1>Notificações</h1><p>Acompanhe respostas, convites e ações que precisam de você.</p></div><button className="demo-secondary" onClick={() => setItems((current) => current.map((item) => ({ ...item, unread: false })))}><Check size={15} /> Marcar todas como lidas</button></div>
      <div className="demo-notification-list">
        {items.map((item, index) => { const Icon = item.icon; return <article className={item.unread ? "unread" : ""} key={`${item.title}-${index}`}><span className={item.color}><Icon size={18} /></span><div><strong>{item.title}</strong><p>{item.text}</p><small>{item.time}</small></div>{item.unread && <i />}<button onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button></article>; })}
      </div>
    </div>
  );
}

export default function DemoApp() {
  const [section, setSection] = useState<DemoSection>("dashboard");
  const [posts, setPosts] = useState(initialPosts);
  const [selectedCommunityId, setSelectedCommunityId] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const unread = notifications.filter((item) => item.unread).length;
  const title = { dashboard: "Visão geral", feed: "Início", communities: "Comunidades", jobs: "Vagas", notifications: "Notificações" }[section];
  const searchResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (query.length < 2) return [];
    return posts.filter((post) => `${post.title || ""} ${post.text} ${post.communityName || ""}`.toLocaleLowerCase("pt-BR").includes(query));
  }, [posts, search]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };
  const openCommunity = (id: string) => { setSelectedCommunityId(id); setSection("feed"); };

  return (
    <div className="demo-app">
      <aside className="demo-sidebar">
        <div className="demo-brand"><img src="/assets/uorqui-wordmark.png" alt="Uorqui" /><span>DEMO</span></div>
        <button className="demo-company-picker"><span>LT</span><div><strong>Lumina Tech</strong><small>Ambiente demonstrativo</small></div><ChevronDown size={16} /></button>
        <nav>
          <small>ESPAÇO DE TRABALHO</small>
          <NavItem active={section === "dashboard"} icon={<BarChart3 />} onClick={() => setSection("dashboard")}>Visão geral</NavItem>
          <NavItem active={section === "feed" && !selectedCommunityId} icon={<Home />} onClick={() => { setSelectedCommunityId(""); setSection("feed"); }}>Início</NavItem>
          <NavItem active={section === "communities" || Boolean(selectedCommunityId)} icon={<Users />} onClick={() => setSection("communities")}>Comunidades</NavItem>
          <NavItem active={section === "jobs"} icon={<BriefcaseBusiness />} onClick={() => setSection("jobs")}>Vagas</NavItem>
          <small>GESTÃO</small>
          <NavItem icon={<Building2 />} onClick={() => notify("Área da empresa disponível na versão completa.")}>Empresa</NavItem>
          <NavItem icon={<Settings />} onClick={() => notify("Configurações disponíveis na versão completa.")}>Administrar</NavItem>
        </nav>
        <div className="demo-sidebar-card"><span><Sparkles size={16} /></span><strong>87% de participação</strong><p>Sua empresa está acima da média de engajamento.</p><button onClick={() => setSection("dashboard")}>Ver métricas</button></div>
        <div className="demo-user"><DemoAvatar person={me} /><div><strong>{me.name}</strong><small>{me.role}</small></div><MoreHorizontal size={18} /></div>
      </aside>

      <main className="demo-main">
        <header className="demo-topbar">
          <div className="demo-mobile-brand"><img src="/assets/uorqui-wordmark.png" alt="Uorqui" /><span>DEMO</span></div>
          <h2>{title}</h2>
          <div className="demo-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversas, pessoas e soluções" />{search && <button onClick={() => setSearch("")}><X size={15} /></button>}</div>
          <button className="demo-top-icon" onClick={() => setSection("notifications")}><Bell size={20} />{unread > 0 && <b>{unread}</b>}</button>
          <button className="demo-top-avatar" onClick={() => notify("Perfil demonstrativo de Gabriel Duclos.")}><DemoAvatar person={me} size={34} /></button>
        </header>

        <div className="demo-banner"><Sparkles size={15} /><span><strong>Ambiente demonstrativo</strong> · Todos os nomes, números e conteúdos são fictícios.</span><button onClick={() => notify("Você está explorando a demonstração do Uorqui.")}>Saiba mais</button></div>

        {search.trim().length >= 2 ? <div className="demo-page demo-search-page"><div className="demo-page-title compact"><div><h1>Resultados para “{search}”</h1><p>{searchResults.length} publicações encontradas nos dados demonstrativos.</p></div></div><div className="demo-feed">{searchResults.map((post) => <DemoPostCard key={post.id} post={post} showToast={notify} onLike={() => {}} onComment={() => {}} onDeleteComment={() => {}} onResolve={() => {}} />)}</div></div> :
          section === "dashboard" ? <Dashboard onOpenFeed={() => setSection("feed")} onOpenCommunity={openCommunity} /> :
          section === "feed" ? <Feed posts={posts} setPosts={setPosts} showToast={notify} initialCommunityId={selectedCommunityId} /> :
          section === "communities" ? <Communities onOpen={openCommunity} /> :
          section === "jobs" ? <Jobs /> : <Notifications />}
      </main>

      <aside className="demo-rightbar">
        <section><header><strong>Próximos eventos</strong><button><Plus size={15} /></button></header><div className="demo-next-event"><span><b>28</b><small>AGO</small></span><div><strong>Town Hall</strong><small><Clock3 size={12} /> 16h00 · Auditório</small></div></div><div className="demo-next-event"><span><b>02</b><small>SET</small></span><div><strong>All Hands Produto</strong><small><Clock3 size={12} /> 10h00 · Meet</small></div></div></section>
        <section><header><strong>Suas comunidades</strong><button onClick={() => setSection("communities")}>Ver todas</button></header>{communities.slice(0, 4).map((community) => <button className="demo-mini-community" key={community.id} onClick={() => openCommunity(community.id)}><span style={{ background: community.color }}>{initials(community.name)}</span><div><strong>{community.name}</strong><small>{community.members} membros</small></div>{community.visibility === "private" && <LockKeyhole size={12} />}</button>)}</section>
        <section className="demo-invite-card"><span><UserPlus size={20} /></span><strong>Convide sua equipe</strong><p>Traga as conversas e o conhecimento para um só lugar.</p><button onClick={() => notify("Convite demonstrativo criado.")}><Plus size={14} /> Convidar pessoas</button></section>
      </aside>

      <nav className="demo-mobile-nav"><button className={section === "dashboard" ? "active" : ""} onClick={() => setSection("dashboard")}><BarChart3 /><span>Visão geral</span></button><button className={section === "feed" ? "active" : ""} onClick={() => { setSelectedCommunityId(""); setSection("feed"); }}><Home /><span>Início</span></button><button className="create" onClick={() => { setSelectedCommunityId(""); setSection("feed"); notify("Use o botão Publicar para criar um post."); }}><Plus /></button><button className={section === "communities" ? "active" : ""} onClick={() => setSection("communities")}><Users /><span>Comunidades</span></button><button className={section === "jobs" ? "active" : ""} onClick={() => setSection("jobs")}><BriefcaseBusiness /><span>Vagas</span></button></nav>
      {toast && <div className="demo-toast"><CheckCircle2 size={17} /> {toast}</div>}
    </div>
  );
}
