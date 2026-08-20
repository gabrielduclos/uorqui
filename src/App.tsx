import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowLeft, Bell, Building2, Camera, Check, ChevronDown, ChevronRight, CirclePlus,
  FileQuestion, Globe2, Home, KeyRound, LogOut, Megaphone, MessageSquareText,
  Plus, Search, Send, Settings, UserRound, Users, X
} from "lucide-react";
import {
  createUserWithEmailAndPassword, EmailAuthProvider, onAuthStateChanged,
  reauthenticateWithCredential, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut, updatePassword, updateProfile, type User
} from "firebase/auth";
import { auth } from "./lib/firebase";
import { api } from "./lib/api";
import type {
  BootstrapData, Community, CommunityMember, HomeTab, NotificationItem, Post, View
} from "./types";
import { Avatar } from "./components/Avatar";
import { Modal } from "./components/Modal";
import { PostCard } from "./components/PostCard";
import "./styles.css";

const emptyData: BootstrapData = {
  me: { uid: "" }, companies: [], selectedCompanyId: "", company: null, role: null,
  canAdmin: false, communities: [], communityMap: {}, posts: [], worldPosts: [],
  notifications: [], allCompanyCommunities: [], members: []
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Não foi possível concluir esta ação.";
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState<BootstrapData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState("");
  const [view, setView] = useState<View>("home");
  const [homeTab, setHomeTab] = useState<HomeTab>("for-you");
  const [composerOpen, setComposerOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedCommunityId, setSelectedCommunityId] = useState("");
  const [composerTarget, setComposerTarget] = useState<{ scope?: "company" | "community" | "world"; communityId?: string }>({});

  useEffect(() => onAuthStateChanged(auth, (next) => {
    setUser(next);
    setAuthReady(true);
    if (!next) {
      setData(emptyData);
      setLoading(false);
    }
  }), []);

  const refresh = async (companyId = selectedCompanyId) => {
    if (!auth.currentUser) return;
    setLoading(true);
    setFatal("");
    try {
      const suffix = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const next = await api<BootstrapData>(`/bootstrap${suffix}`);
      setData(next);
      setSelectedCompanyId(next.selectedCompanyId || "");
      if (next.selectedCompanyId && next.selectedCompanyId !== companyId) {
        localStorage.setItem("uorqui-company", next.selectedCompanyId);
      }
    } catch (error) {
      setFatal(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const stored = localStorage.getItem("uorqui-company") || "";
    refresh(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("invite");
    if (!token || !user || loading) return;
    api<{ companyId?: string }>("/invites/accept", {
      method: "POST", body: JSON.stringify({ token })
    }).then(async (result) => {
      history.replaceState({}, "", location.pathname);
      if (result.companyId) {
        localStorage.setItem("uorqui-company", result.companyId);
        setSelectedCompanyId(result.companyId);
        await refresh(result.companyId);
      } else {
        await refresh();
      }
      showToast("Convite aceito.");
    }).catch((error) => showToast(errorMessage(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  if (!authReady) return <Boot />;
  if (!user) return <AuthScreen />;
  if (loading && !data.me.uid) return <Boot />;
  if (fatal) return <ErrorScreen message={fatal} onRetry={() => refresh()} onLogout={() => signOut(auth)} />;
  if (!data.companies.length) return <Onboarding onCreated={(companyId) => refresh(companyId)} />;

  const unread = data.notifications.filter((n) => !n.read).length;
  const companyName = data.company?.name || "Uorqui";
  const pageTitle: Record<View, string> = {
    home: "Início", communities: "Comunidades", search: "Buscar", admin: "Administrar", profile: "Perfil", notifications: "Notificações"
  };

  const navigate = (next: View) => {
    setView(next);
  };

  const openComposer = (target: { scope?: "company" | "community" | "world"; communityId?: string } = {}) => {
    setComposerTarget(target);
    setComposerOpen(true);
  };

  const openCommunity = (communityId: string) => {
    setSelectedCommunityId(communityId);
    setView("communities");
  };

  const openWorld = () => {
    setHomeTab("world");
    setView("home");
  };

  const changeCompany = async (id: string) => {
    localStorage.setItem("uorqui-company", id);
    setSelectedCompanyId(id);
    setSelectedCommunityId("");
    setView("home");
    await refresh(id);
  };

  const renderPage = () => {
    if (view === "home") return (
      <HomePage
        data={data}
        tab={homeTab}
        setTab={setHomeTab}
        refresh={() => refresh()}
        onCompose={() => openComposer()}
        showToast={showToast}
      />
    );
    if (view === "communities") return (
      <CommunitiesPage
        data={data}
        selectedCommunityId={selectedCommunityId}
        onSelectCommunity={setSelectedCommunityId}
        onBack={() => setSelectedCommunityId("")}
        onComposeCommunity={(communityId) => openComposer({ scope: "community", communityId })}
        refresh={() => refresh()}
        showToast={showToast}
      />
    );
    if (view === "search") return <SearchPage data={data} refresh={() => refresh()} showToast={showToast} />;
    if (view === "admin") return <AdminPage data={data} refresh={() => refresh()} showToast={showToast} />;
    if (view === "notifications") return <NotificationsPage data={data} refresh={() => refresh()} showToast={showToast} />;
    return <ProfilePage data={data} refresh={() => refresh()} showToast={showToast} />;
  };

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <button className="brand-button" onClick={() => navigate("home")}>
            <img src="/assets/uorqui-logo-light.png" alt="Uorqui" />
          </button>

          <label className="company-picker">
            <span className="company-mark">{companyName.slice(0, 2).toUpperCase()}</span>
            <select value={selectedCompanyId} onChange={(e) => changeCompany(e.target.value)}>
              {data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <ChevronDown size={16} />
          </label>

          <nav className="side-nav">
            <NavButton active={view === "home"} icon={<Home />} label="Início" onClick={() => navigate("home")} />
            <NavButton active={view === "communities"} icon={<Users />} label="Comunidades" onClick={() => navigate("communities")} />
            <NavButton active={view === "search"} icon={<Search />} label="Buscar" onClick={() => navigate("search")} />
            {data.canAdmin && <NavButton active={view === "admin"} icon={<Settings />} label="Administrar" onClick={() => navigate("admin")} />}
            <NavButton active={view === "profile"} icon={<UserRound />} label="Perfil" onClick={() => navigate("profile")} />
          </nav>

          <button className="btn publish-main" onClick={() => openComposer()}><Plus size={19} /> Publicar</button>

          <div className="sidebar-user">
            <Avatar name={data.me.displayName || data.me.email} mediaId={data.me.avatarMediaId} />
            <div className="ellipsis">
              <strong>{data.me.displayName || "Usuário"}</strong>
              <small>{data.me.email}</small>
            </div>
            <button className="icon-btn" aria-label="Sair" onClick={() => signOut(auth)}><LogOut size={18} /></button>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="topbar-line">
              <div className="topbar-brand">
                <button className="mobile-logo" onClick={() => navigate("home")}><img src="/assets/uorqui-wordmark.png" alt="Uorqui" /></button>
                <h1>{pageTitle[view]}</h1>
              </div>
              <button className={`icon-btn top-bell ${view === "notifications" ? "active" : ""}`} onClick={() => navigate("notifications")} aria-label="Notificações">
                <Bell size={21} />
                {unread > 0 && <span className="count-badge">{unread > 99 ? "99+" : unread}</span>}
              </button>
            </div>
            {view === "home" && (
              <div className="tabs">
                {([
                  ["for-you", "Para você"], ["recent", "Recentes"], ["announcement", "Comunicados"], ["world", "Mundo"]
                ] as const).map(([id, label]) => (
                  <button key={id} className={homeTab === id ? "active" : ""} onClick={() => setHomeTab(id)}>{label}</button>
                ))}
              </div>
            )}
          </header>
          {renderPage()}
        </main>

        <aside className="rightbar">
          <button className="global-search" onClick={() => navigate("search")}><Search size={18} /><span>Buscar conversas e soluções</span></button>
          <section className="side-card">
            <strong>{companyName}</strong>
            <small>{data.role === "owner" ? "Proprietário" : data.role === "admin" ? "Administrador" : "Colaborador"}</small>
          </section>
          <section className="side-card">
            <strong>Suas comunidades</strong>
            {data.communities.slice(0, 5).map((c) => (
              <button className="mini-community" key={c.id} onClick={() => openCommunity(c.id)}>
                <span>{c.name.slice(0, 2).toUpperCase()}</span><div><b>{c.name}</b><small>{c.description || "Comunidade privada"}</small></div>
              </button>
            ))}
            {!data.communities.length && <small>Você ainda não participa de comunidades.</small>}
          </section>
          <section className="side-card compact"><strong>Uorqui 1.1.3</strong><small>Conversas de trabalho que não se perdem.</small></section>
        </aside>
      </div>

      <nav className="mobile-nav">
        <MobileNav active={view === "home" && homeTab !== "world"} icon={<Home />} label="Início" onClick={() => { setHomeTab("for-you"); navigate("home"); }} />
        <MobileNav active={view === "communities"} icon={<Users />} label="Comunidades" onClick={() => navigate("communities")} />
        <button className="mobile-create" onClick={() => setComposerOpen(true)} aria-label="Publicar"><Plus size={26} /></button>
        <MobileNav active={view === "home" && homeTab === "world"} icon={<Globe2 />} label="Mundo" onClick={openWorld} />
        <MobileNav active={view === "profile"} icon={<UserRound />} label="Perfil" onClick={() => navigate("profile")} />
      </nav>

      {composerOpen && <Composer
        data={data}
        initialScope={composerTarget.scope}
        initialCommunityId={composerTarget.communityId}
        onClose={() => setComposerOpen(false)}
        onDone={async () => { setComposerOpen(false); await refresh(); }}
        showToast={showToast}
      />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function Boot() {
  return <div className="boot"><img src="/assets/uorqui-logo-light.png" alt="Uorqui" /><span>Carregando…</span></div>;
}

function ErrorScreen({ message, onRetry, onLogout }: { message: string; onRetry: () => void; onLogout: () => void }) {
  return <div className="center-card"><img src="/assets/uorqui-logo-light.png" alt="Uorqui" /><h2>Não foi possível abrir o Uorqui.</h2><p>{message}</p><div><button className="btn" onClick={onRetry}>Tentar novamente</button><button className="btn secondary" onClick={onLogout}>Sair</button></div></div>;
}

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError("");
    const fd = new FormData(event.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const displayName = String(fd.get("displayName") || "").trim();
        const result = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) await updateProfile(result.user, { displayName });
        await sendEmailVerification(result.user).catch(() => {});
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    const email = prompt("Qual é o seu e-mail?");
    if (!email) return;
    try { await sendPasswordResetEmail(auth, email); alert("Enviamos o link de redefinição de senha."); }
    catch (err) { setError(errorMessage(err)); }
  };

  return (
    <div className="auth-layout">
      <section className="auth-brand">
        <img src="/assets/uorqui-logo-login.png" alt="Uorqui" />
        <h1>Conversas de trabalho que não se perdem.</h1>
        <p>Comunidades privadas, comunicados e conhecimento organizado para sua empresa.</p>
      </section>
      <section className="auth-card">
        <img className="auth-mobile-logo" src="/assets/uorqui-logo-light.png" alt="Uorqui" />
        <h2>{mode === "login" ? "Entrar" : "Criar sua conta"}</h2>
        <p>{mode === "login" ? "Acesse suas empresas e comunidades." : "Sua conta Uorqui pertence a você."}</p>
        <form onSubmit={submit}>
          {mode === "register" && <label><span>Nome</span><input name="displayName" required autoComplete="name" /></label>}
          <label><span>E-mail</span><input name="email" type="email" required autoComplete="email" /></label>
          <label><span>Senha</span><input name="password" type="password" minLength={6} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
          {error && <div className="form-error">{error}</div>}
          <button className="btn" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}</button>
        </form>
        {mode === "login" && <button className="text-button" onClick={forgot}>Esqueci minha senha</button>}
        <button className="text-button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
          {mode === "login" ? "Ainda não tenho conta" : "Já tenho uma conta"}
        </button>
      </section>
    </div>
  );
}

function Onboarding({ onCreated }: { onCreated: (id: string) => void }) {
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") || "").trim();
    try {
      const result = await api<{ company: { id: string } }>("/companies", { method: "POST", body: JSON.stringify({ name }) });
      onCreated(result.company.id);
    } catch (err) { setError(errorMessage(err)); }
  };
  return (
    <div className="onboarding">
      <img src="/assets/uorqui-logo-light.png" alt="Uorqui" />
      <div className="onboarding-card">
        <Building2 size={30} />
        <h2>Comece sua empresa no Uorqui</h2>
        <p>Você também pode aguardar um convite de uma empresa. Se quiser criar a sua agora, informe o nome abaixo.</p>
        <form onSubmit={submit}>
          <label><span>Nome da empresa</span><input name="name" required placeholder="Ex.: Minha Empresa" /></label>
          {error && <div className="form-error">{error}</div>}
          <button className="btn">Criar empresa</button>
        </form>
        <button className="text-button" onClick={() => signOut(auth)}>Sair desta conta</button>
      </div>
    </div>
  );
}

function NavButton({ icon, label, active, badge, onClick }: { icon: ReactNode; label: string; active?: boolean; badge?: number; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}>{icon}<span>{label}</span>{!!badge && <b className="nav-badge">{badge}</b>}</button>;
}

function MobileNav({ icon, label, active, badge, onClick }: { icon: ReactNode; label: string; active?: boolean; badge?: number; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick}>{icon}<small>{label}</small>{!!badge && <b className="mobile-badge">{badge}</b>}</button>;
}

function HomePage({ data, tab, setTab, refresh, onCompose, showToast }: {
  data: BootstrapData; tab: HomeTab; setTab: (tab: HomeTab) => void; refresh: () => Promise<void> | void;
  onCompose: () => void; showToast: (m: string) => void;
}) {
  const posts = useMemo(() => {
    if (tab === "world") return data.worldPosts;
    if (tab === "announcement") return data.posts.filter((p) => p.type === "announcement");
    if (tab === "recent") return [...data.posts].sort((a, b) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0));
    return data.posts;
  }, [data, tab]);

  const like = async (post: Post) => {
    try { await api(`/posts/${post.id}/reaction`, { method: "POST" }); await refresh(); }
    catch (err) { showToast(errorMessage(err)); }
  };
  const read = async (post: Post) => {
    try { await api(`/posts/${post.id}/read`, { method: "POST" }); showToast("Leitura confirmada."); await refresh(); }
    catch (err) { showToast(errorMessage(err)); }
  };

  const remove = async (post: Post) => {
    const adminDeletingAnother = data.canAdmin && post.authorUid !== data.me.uid;
    const message = adminDeletingAnother
      ? "Apagar esta publicação como administrador? O conteúdo será removido e ficará um aviso no lugar."
      : "Excluir sua publicação? Esta ação não pode ser desfeita.";
    if (!confirm(message)) return;
    try {
      const result = await api<{ tombstone?: boolean }>(`/posts/${post.id}`, { method: "DELETE" });
      showToast(result.tombstone ? "Conteúdo removido pela administração." : "Publicação excluída.");
      await refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  return (
    <>
      <section className="quick-compose">
        <Avatar name={data.me.displayName || data.me.email} mediaId={data.me.avatarMediaId} />
        <button onClick={onCompose}>Compartilhe algo com sua empresa ou comunidade…</button>
      </section>
      <section className="feed">
        {posts.map((post) => <PostCard
          key={post.id}
          post={post}
          companyName={data.company?.name}
          community={data.communityMap[post.communityId || ""]}
          onLike={like}
          onRead={read}
          canDelete={post.authorUid === data.me.uid || (data.canAdmin && post.scope !== "world")}
          onDelete={remove}
          currentUid={data.me.uid}
          canAdmin={data.canAdmin}
          onChanged={refresh}
          showToast={showToast}
        />)}
        {!posts.length && <Empty title="Nada por aqui ainda" text={tab === "world" ? "Ainda não há publicações públicas." : "Quando sua empresa ou suas comunidades publicarem, aparecerá aqui."} />}
      </section>
    </>
  );
}

function CommunitiesPage({
  data, selectedCommunityId, onSelectCommunity, onBack, onComposeCommunity, refresh, showToast
}: {
  data: BootstrapData;
  selectedCommunityId: string;
  onSelectCommunity: (id: string) => void;
  onBack: () => void;
  onComposeCommunity: (id: string) => void;
  refresh: () => Promise<void>;
  showToast: (m: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [communityPosts, setCommunityPosts] = useState<Post[]>([]);
  const [communityMembers, setCommunityMembers] = useState<CommunityMember[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [addUid, setAddUid] = useState("");
  const selectedCommunity = data.allCompanyCommunities.find((community) => community.id === selectedCommunityId)
    || data.communities.find((community) => community.id === selectedCommunityId);

  const loadCommunity = async (communityId: string) => {
    setDetailLoading(true);
    try {
      const [postResult, memberResult] = await Promise.all([
        api<{ community: Community; posts: Post[] }>(`/communities/${communityId}/posts`),
        api<{ community: Community; members: CommunityMember[]; count: number }>(`/communities/${communityId}/members`)
      ]);
      setCommunityPosts(postResult.posts);
      setCommunityMembers(memberResult.members);
    } catch (err) {
      showToast(errorMessage(err));
      onBack();
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedCommunityId) {
      setCommunityPosts([]);
      setCommunityMembers([]);
      return;
    }
    loadCommunity(selectedCommunityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommunityId]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    try {
      const result = await api<{ community: Community }>(`/companies/${data.selectedCompanyId}/communities`, {
        method: "POST", body: JSON.stringify({ name: fd.get("name"), description: fd.get("description") })
      });
      setCreateOpen(false);
      showToast("Comunidade criada.");
      await refresh();
      onSelectCommunity(result.community.id);
    } catch (err) { showToast(errorMessage(err)); }
  };

  const like = async (post: Post) => {
    try {
      await api(`/posts/${post.id}/reaction`, { method: "POST" });
      if (selectedCommunityId) await loadCommunity(selectedCommunityId);
      await refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  const removePost = async (post: Post) => {
    const adminDeletingAnother = data.canAdmin && post.authorUid !== data.me.uid;
    const message = adminDeletingAnother
      ? "Apagar esta publicação como administrador? O conteúdo será removido e ficará um aviso informando que foi apagado pela administração."
      : "Excluir sua publicação? Esta ação não pode ser desfeita.";
    if (!confirm(message)) return;
    try {
      const result = await api<{ tombstone?: boolean }>(`/posts/${post.id}`, { method: "DELETE" });
      showToast(result.tombstone ? "Conteúdo removido pela administração." : "Publicação excluída.");
      if (selectedCommunityId) await loadCommunity(selectedCommunityId);
      await refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  const addMember = async () => {
    if (!selectedCommunityId || !addUid) return;
    try {
      await api(`/communities/${selectedCommunityId}/members`, {
        method: "POST", body: JSON.stringify({ uid: addUid })
      });
      setAddUid("");
      showToast("Usuário adicionado à comunidade.");
      await loadCommunity(selectedCommunityId);
      await refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  const removeMember = async (member: CommunityMember) => {
    if (!selectedCommunityId) return;
    if (!confirm(`Remover ${member.displayName || member.email || "este usuário"} desta comunidade?`)) return;
    try {
      await api(`/communities/${selectedCommunityId}/members/${member.uid}`, { method: "DELETE" });
      showToast("Usuário removido da comunidade.");
      await loadCommunity(selectedCommunityId);
      await refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  if (selectedCommunityId && selectedCommunity) {
    const currentIds = new Set(communityMembers.map((member) => member.uid));
    const availableMembers = data.members.filter((member) => !currentIds.has(member.uid));

    return (
      <section className="page-section">
        <div className="community-detail-head">
          <button className="back-button" onClick={onBack}><ArrowLeft size={18} /> Comunidades</button>
          <div className="community-detail-title">
            <div className="community-avatar large">{selectedCommunity.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <h2>{selectedCommunity.name}</h2>
              <p>{selectedCommunity.description || "Comunidade privada da empresa."}</p>
              <small>{communityMembers.length} {communityMembers.length === 1 ? "membro" : "membros"}</small>
            </div>
          </div>
          <button className="btn small" onClick={() => onComposeCommunity(selectedCommunity.id)}><Plus size={17} /> Publicar aqui</button>
        </div>

        <section className="community-members-card">
          <div className="community-members-title">
            <div><strong>Membros da comunidade</strong><small>{communityMembers.length} no total</small></div>
            {data.canAdmin && !!availableMembers.length && (
              <div className="community-add-member">
                <select value={addUid} onChange={(e) => setAddUid(e.target.value)}>
                  <option value="">Adicionar usuário…</option>
                  {availableMembers.map((member) => (
                    <option value={member.uid} key={member.uid}>{member.displayName || member.email}</option>
                  ))}
                </select>
                <button className="btn small" disabled={!addUid} onClick={addMember}><Plus size={15} /> Adicionar</button>
              </div>
            )}
          </div>
          <div className="community-member-list">
            {communityMembers.map((member) => (
              <div className="community-member-row" key={member.uid}>
                <Avatar name={member.displayName || member.email} mediaId={member.avatarMediaId} size={36} />
                <div className="ellipsis">
                  <strong>{member.displayName || member.email}</strong>
                  <small>{member.email}{member.companyRole === "owner" ? " · Proprietário" : member.companyRole === "admin" ? " · Administrador" : ""}</small>
                </div>
                {data.canAdmin && <button className="btn danger small" onClick={() => removeMember(member)}>Remover</button>}
              </div>
            ))}
            {!communityMembers.length && <p className="muted">Nenhum usuário nesta comunidade.</p>}
          </div>
        </section>

        <div className="feed community-feed">
          {detailLoading && <div className="loading-line">Carregando publicações…</div>}
          {!detailLoading && communityPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              companyName={data.company?.name}
              community={selectedCommunity}
              onLike={like}
              onRead={() => {}}
              canDelete={post.authorUid === data.me.uid || data.canAdmin}
              onDelete={removePost}
              currentUid={data.me.uid}
              canAdmin={data.canAdmin}
              onChanged={async () => { await loadCommunity(selectedCommunityId); await refresh(); }}
              showToast={showToast}
            />
          ))}
          {!detailLoading && !communityPosts.length && <Empty title="Nenhuma publicação ainda" text="Comece uma conversa nesta comunidade." />}
        </div>
      </section>
    );
  }

  const listedCommunities = data.canAdmin ? data.allCompanyCommunities : data.communities;

  return (
    <section className="page-section">
      <div className="page-heading">
        <div><h2>{data.canAdmin ? "Comunidades da empresa" : "Suas comunidades"}</h2><p>Entre em uma comunidade para acompanhar seus membros e as conversas daquele grupo.</p></div>
        {data.canAdmin && <button className="btn small" onClick={() => setCreateOpen(true)}><Plus size={17} /> Criar comunidade</button>}
      </div>
      <div className="community-grid">
        {listedCommunities.map((community) => (
          <button className="community-card community-link" key={community.id} onClick={() => onSelectCommunity(community.id)}>
            <div className="community-avatar">{community.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <strong>{community.name}</strong>
              <p>{community.description || "Comunidade privada da empresa."}</p>
              <small className="community-member-count">{community.memberCount || 0} {(community.memberCount || 0) === 1 ? "membro" : "membros"}</small>
            </div>
            <ChevronRight className="community-chevron" size={18} />
          </button>
        ))}
      </div>
      {!listedCommunities.length && <Empty title={data.canAdmin ? "Crie a primeira comunidade" : "Você ainda não está em comunidades"} text={data.canAdmin ? "Crie apenas os grupos que sua empresa realmente precisa." : "Quando você for adicionado a uma comunidade, ela aparecerá aqui."} />}
      {createOpen && <Modal title="Criar comunidade" onClose={() => setCreateOpen(false)}>
        <form className="stack-form" onSubmit={create}>
          <label><span>Nome</span><input name="name" required maxLength={90} placeholder="Ex.: Assistência Técnica" /></label>
          <label><span>Descrição</span><textarea name="description" maxLength={280} rows={3} placeholder="Que assuntos ficam aqui?" /></label>
          <button className="btn">Criar comunidade</button>
        </form>
      </Modal>}
    </section>
  );
}

function SearchPage({ data, refresh, showToast }: {
  data: BootstrapData; refresh: () => Promise<void>; showToast: (m: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [searched, setSearched] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    try {
      const qs = new URLSearchParams({ q: query.trim(), companyId: data.selectedCompanyId });
      const result = await api<{ posts: Post[] }>(`/search?${qs}`);
      setPosts(result.posts); setSearched(true);
    } catch (err) { showToast(errorMessage(err)); }
  };

  const like = async (post: Post) => {
    try { await api(`/posts/${post.id}/reaction`, { method: "POST" }); await refresh(); }
    catch (err) { showToast(errorMessage(err)); }
  };

  const remove = async (post: Post) => {
    const adminDeletingAnother = data.canAdmin && post.authorUid !== data.me.uid;
    if (!confirm(adminDeletingAnother ? "Apagar como administrador? Ficará um aviso no lugar da publicação." : "Excluir sua publicação?")) return;
    try {
      const result = await api<{ tombstone?: boolean }>(`/posts/${post.id}`, { method: "DELETE" });
      if (!result.tombstone) setPosts((current) => current.filter((item) => item.id !== post.id));
      showToast(result.tombstone ? "Conteúdo removido pela administração." : "Publicação excluída.");
      await refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  return (
    <section className="page-section">
      <div className="page-heading"><div><h2>Encontre o que já foi discutido</h2><p>Procure problemas, soluções, comunicados e assuntos antigos.</p></div></div>
      <form className="large-search" onSubmit={submit}><Search size={20} /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ex.: erro E37, férias, procedimento…" /><button className="btn small">Buscar</button></form>
      <div className="feed search-results">
        {posts.map((post) => <PostCard
          key={post.id}
          post={post}
          companyName={data.company?.name}
          community={data.communityMap[post.communityId || ""]}
          onLike={like}
          onRead={() => {}}
          canDelete={post.authorUid === data.me.uid || (data.canAdmin && post.scope !== "world")}
          onDelete={remove}
          currentUid={data.me.uid}
          canAdmin={data.canAdmin}
          onChanged={refresh}
          showToast={showToast}
        />)}
        {searched && !posts.length && <Empty title="Nenhum resultado" text="Tente outras palavras ou uma busca mais curta." />}
      </div>
    </section>
  );
}

function AdminPage({ data, refresh, showToast }: { data: BootstrapData; refresh: () => Promise<void>; showToast: (m: string) => void }) {
  const [inviteLink, setInviteLink] = useState("");
  if (!data.canAdmin) return <Empty title="Acesso restrito" text="Somente administradores podem acessar esta área." />;

  const inviteCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") || "");
    try {
      const result = await api<{ inviteUrl?: string; emailSent?: boolean }>(`/companies/${data.selectedCompanyId}/invites`, {
        method: "POST", body: JSON.stringify({ email })
      });
      form.reset();
      if (result.emailSent) showToast("Convite enviado por e-mail.");
      else {
        setInviteLink(result.inviteUrl || "");
        showToast("Convite criado.");
      }
      await refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  const createCommunity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    try {
      await api(`/companies/${data.selectedCompanyId}/communities`, { method: "POST", body: JSON.stringify({ name: fd.get("name"), description: fd.get("description") }) });
      form.reset(); showToast("Comunidade criada."); await refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  const addToCommunity = async (uid: string, communityId: string) => {
    try {
      await api(`/communities/${communityId}/members`, { method: "POST", body: JSON.stringify({ uid }) });
      showToast("Usuário adicionado à comunidade.");
      await refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  const changeRole = async (uid: string, role: "admin" | "member") => {
    try {
      await api(`/companies/${data.selectedCompanyId}/members/${uid}`, {
        method: "PATCH", body: JSON.stringify({ role })
      });
      showToast(role === "admin" ? "Usuário agora é Administrador." : "Nível alterado para Usuário.");
      await refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  const removeCommunity = async (community: Community) => {
    if (!confirm(`Excluir a comunidade "${community.name}"?`)) return;
    try { await api(`/communities/${community.id}`, { method: "DELETE" }); showToast("Comunidade excluída."); await refresh(); }
    catch (err) { showToast(errorMessage(err)); }
  };

  return (
    <section className="page-section">
      <div className="page-heading"><div><h2>Administrar {data.company?.name}</h2><p>Controle colaboradores e comunidades privadas.</p></div></div>
      <div className="admin-grid">
        <form className="panel-card stack-form" onSubmit={inviteCompany}>
          <h3>Convidar colaborador</h3>
          <label><span>E-mail</span><input name="email" type="email" required placeholder="pessoa@empresa.com" /></label>
          <button className="btn small"><Send size={16} /> Enviar convite</button>
          {inviteLink && <div className="invite-link"><small>Se o envio por e-mail não estiver configurado:</small><input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} /></div>}
        </form>
        <form className="panel-card stack-form" onSubmit={createCommunity}>
          <h3>Criar comunidade</h3>
          <label><span>Nome</span><input name="name" required placeholder="Ex.: Comercial" /></label>
          <label><span>Descrição</span><input name="description" placeholder="Assuntos deste grupo" /></label>
          <button className="btn small"><CirclePlus size={16} /> Criar</button>
        </form>
      </div>

      <section className="panel-card">
        <h3>Colaboradores</h3>
        <div className="member-list">
          {data.members.map((member) => (
            <div className="member-row" key={member.uid}>
              <Avatar name={member.displayName || member.email} size={38} />
              <div className="ellipsis">
                <strong>{member.displayName || member.email}</strong>
                <small>{member.email}</small>
              </div>
              {member.role === "owner" ? (
                <span className="private-pill">Proprietário</span>
              ) : data.role === "owner" ? (
                <select className="role-select" value={member.role === "admin" ? "admin" : "member"} onChange={(e) => changeRole(member.uid, e.target.value as "admin" | "member")}>
                  <option value="member">Usuário</option>
                  <option value="admin">Administrador</option>
                </select>
              ) : (
                <span className="private-pill">{member.role === "admin" ? "Administrador" : "Usuário"}</span>
              )}
              {member.uid !== data.me.uid && !!data.allCompanyCommunities.length && (
                <select className="community-add-select" defaultValue="" onChange={(e) => { if (e.target.value) addToCommunity(member.uid, e.target.value); e.target.value = ""; }}>
                  <option value="">Adicionar à comunidade…</option>
                  {data.allCompanyCommunities.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel-card">
        <h3>Comunidades da empresa</h3>
        {data.allCompanyCommunities.map((community) => (
          <div className="admin-community-row" key={community.id}>
            <div className="community-avatar">{community.name.slice(0, 2).toUpperCase()}</div>
            <div className="ellipsis"><strong>{community.name}</strong><small>{community.description || "Comunidade privada"} · {community.memberCount || 0} membros</small></div>
            <span className="private-pill">Privada</span>
            <button className="btn danger small" onClick={() => removeCommunity(community)}>Excluir</button>
          </div>
        ))}
        {!data.allCompanyCommunities.length && <p className="muted">Nenhuma comunidade criada.</p>}
      </section>
    </section>
  );
}

function ProfilePage({ data, refresh, showToast }: { data: BootstrapData; refresh: () => Promise<void>; showToast: (m: string) => void }) {
  const [photoError, setPhotoError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setPhotoError("Use uma imagem JPG, PNG ou WebP.");
    if (file.size > 5 * 1024 * 1024) return setPhotoError("A foto pode ter no máximo 5 MB.");
    try {
      const qs = new URLSearchParams({ scope: "avatar", name: file.name });
      const result = await api<{ media: { id: string } }>(`/media/upload?${qs}`, {
        method: "POST", headers: { "Content-Type": file.type, "X-File-Name": file.name }, body: file
      });
      await api("/me", { method: "PATCH", body: JSON.stringify({ avatarMediaId: result.media.id }) });
      showToast("Foto atualizada."); await refresh();
    } catch (err) { setPhotoError(errorMessage(err)); }
  };

  const removePhoto = async () => {
    try { await api("/me", { method: "PATCH", body: JSON.stringify({ avatarMediaId: "" }) }); showToast("Foto removida."); await refresh(); }
    catch (err) { setPhotoError(errorMessage(err)); }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError("");
    const form = event.currentTarget;
    const fd = new FormData(form);
    const current = String(fd.get("current") || "");
    const next = String(fd.get("next") || "");
    const confirmNext = String(fd.get("confirm") || "");
    if (next !== confirmNext) return setPasswordError("As novas senhas não coincidem.");
    if (next.length < 6) return setPasswordError("A nova senha precisa ter pelo menos 6 caracteres.");
    try {
      if (!auth.currentUser?.email) throw new Error("Sua conta não possui e-mail.");
      await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, current));
      await updatePassword(auth.currentUser, next);
      form.reset(); showToast("Senha atualizada.");
    } catch (err) { setPasswordError(errorMessage(err)); }
  };

  return (
    <section className="page-section">
      <div className="profile-grid">
        <section className="panel-card profile-panel">
          <div className="profile-head">
            <div className="avatar-edit">
              <Avatar name={data.me.displayName || data.me.email} mediaId={data.me.avatarMediaId} size={92} />
              <label className="camera-button" title="Trocar foto"><Camera size={18} /><input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadPhoto(e.target.files?.[0])} /></label>
            </div>
            <div><h2>{data.me.displayName || "Usuário"}</h2><p>{data.me.email}</p><span className="private-pill">{auth.currentUser?.emailVerified ? "E-mail verificado" : "E-mail não verificado"}</span></div>
          </div>
          <p className="muted">Sua conta Uorqui pertence a você, mesmo quando você troca de empresa.</p>
          <div className="inline-actions">
            <label className="btn secondary"><Camera size={17} /> Trocar foto<input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadPhoto(e.target.files?.[0])} /></label>
            {data.me.avatarMediaId && <button className="btn ghost" onClick={removePhoto}>Remover foto</button>}
          </div>
          {photoError && <div className="form-error">{photoError}</div>}
          {!auth.currentUser?.emailVerified && <button className="btn secondary small" onClick={() => sendEmailVerification(auth.currentUser!).then(() => showToast("E-mail de verificação enviado.")).catch((e) => showToast(errorMessage(e)))}>Enviar verificação</button>}
        </section>

        <section className="panel-card">
          <div className="settings-heading"><KeyRound size={21} /><div><h3>Alterar senha</h3><p>Confirme sua senha atual antes da troca.</p></div></div>
          <form className="stack-form" onSubmit={changePassword}>
            <label><span>Senha atual</span><input name="current" type="password" required autoComplete="current-password" /></label>
            <label><span>Nova senha</span><input name="next" type="password" required minLength={6} autoComplete="new-password" /></label>
            <label><span>Confirmar nova senha</span><input name="confirm" type="password" required minLength={6} autoComplete="new-password" /></label>
            {passwordError && <div className="form-error">{passwordError}</div>}
            <button className="btn">Atualizar senha</button>
          </form>
        </section>
      </div>
      <section className="panel-card session-card"><div><strong>Sessão</strong><p className="muted">Encerrar o acesso neste dispositivo.</p></div><button className="btn secondary" onClick={() => signOut(auth)}><LogOut size={17} /> Sair da conta</button></section>
    </section>
  );
}

function NotificationsPage({ data, refresh, showToast }: {
  data: BootstrapData; refresh: () => Promise<void>; showToast: (m: string) => void;
}) {
  const accept = async (notification: NotificationItem) => {
    const inviteId = notification.data?.inviteId;
    if (!inviteId) return;
    try {
      const result = await api<{ companyId?: string }>("/invites/accept", {
        method: "POST", body: JSON.stringify({ inviteId })
      });
      if (result.companyId) localStorage.setItem("uorqui-company", result.companyId);
      showToast("Convite aceito.");
      await refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  const read = async (notification: NotificationItem) => {
    if (!notification.id || notification.read) return;
    try {
      await api(`/notifications/${notification.id}/read`, { method: "POST" });
      await refresh();
    } catch {}
  };

  const unread = data.notifications.filter((item) => !item.read).length;

  return (
    <section className="page-section notifications-page">
      <div className="page-heading">
        <div>
          <h2>Notificações</h2>
          <p>{unread ? `${unread} ${unread === 1 ? "notificação não lida" : "notificações não lidas"}.` : "Você está em dia."}</p>
        </div>
      </div>
      <div className="notifications-page-list">
        {data.notifications.map((item, index) => (
          <article className={`notification-page-item ${item.read ? "" : "unread"}`} key={item.id || index} onClick={() => read(item)}>
            <div className="notification-icon">
              {item.type.includes("community") || item.type.includes("invite")
                ? <Users size={19} />
                : item.type === "announcement" ? <Megaphone size={19} /> : <Bell size={19} />}
            </div>
            <div className="notification-page-copy">
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              {item.status === "pending" && item.type.includes("invite") && (
                <button className="btn small" onClick={(event) => { event.stopPropagation(); accept(item); }}><Check size={16} /> Aceitar</button>
              )}
            </div>
            {!item.read && <span className="unread-dot" aria-label="Não lida" />}
          </article>
        ))}
        {!data.notifications.length && <Empty title="Tudo em dia" text="Convites, menções e comunicados aparecerão nesta página." />}
      </div>
    </section>
  );
}

function Composer({ data, initialScope, initialCommunityId, onClose, onDone, showToast }: {
  data: BootstrapData;
  initialScope?: "company" | "community" | "world";
  initialCommunityId?: string;
  onClose: () => void;
  onDone: () => Promise<void>;
  showToast: (m: string) => void;
}) {
  const [scope, setScope] = useState<"company" | "community" | "world">(initialScope || "company");
  const [type, setType] = useState<"post" | "question" | "announcement">("post");
  const [communityId, setCommunityId] = useState(initialCommunityId || data.communities[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => { if (type === "announcement") setScope("company"); }, [type]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    const fd = new FormData(event.currentTarget);
    const text = String(fd.get("text") || "").trim();
    const title = String(fd.get("title") || "").trim();
    try {
      if (scope === "community" && !communityId) throw new Error("Escolha uma comunidade.");
      const attachmentIds: string[] = [];
      for (const file of files.slice(0, 5)) {
        const qs = new URLSearchParams({ scope, name: file.name });
        if (scope !== "world") qs.set("companyId", data.selectedCompanyId);
        if (scope === "community") qs.set("communityId", communityId);
        const uploaded = await api<{ media: { id: string } }>(`/media/upload?${qs}`, {
          method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": file.name }, body: file
        });
        attachmentIds.push(uploaded.media.id);
      }
      await api("/posts", {
        method: "POST",
        body: JSON.stringify({
          scope, type, text, title, companyId: scope === "world" ? "" : data.selectedCompanyId,
          communityId: scope === "community" ? communityId : "",
          requiresReadReceipt: type === "announcement" && fd.get("receipt") === "on",
          attachmentIds
        })
      });
      showToast("Publicado."); await onDone();
    } catch (err) {
      showToast(errorMessage(err)); setBusy(false);
    }
  };

  return (
    <Modal title="Criar publicação" onClose={onClose} wide>
      <form className="composer-form" onSubmit={submit}>
        <div className="audience-row">
          <button type="button" className={scope === "company" ? "selected" : ""} onClick={() => setScope("company")} disabled={type === "announcement"}><Building2 size={17} /> Empresa</button>
          <button type="button" className={scope === "community" ? "selected" : ""} onClick={() => setScope("community")} disabled={type === "announcement" || !data.communities.length}><Users size={17} /> Comunidade</button>
          <button type="button" className={scope === "world" ? "selected" : ""} onClick={() => setScope("world")} disabled={type === "announcement"}><Globe2 size={17} /> Mundo</button>
        </div>
        {scope === "community" && <label><span>Comunidade</span><select value={communityId} onChange={(e) => setCommunityId(e.target.value)}>{data.communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <div className="type-row">
          <button type="button" className={type === "post" ? "selected" : ""} onClick={() => setType("post")}><MessageSquareText size={16} /> Post</button>
          <button type="button" className={type === "question" ? "selected" : ""} onClick={() => setType("question")}><FileQuestion size={16} /> Pergunta</button>
          {data.canAdmin && <button type="button" className={type === "announcement" ? "selected" : ""} onClick={() => setType("announcement")}><Megaphone size={16} /> Comunicado</button>}
        </div>
        {type === "announcement" && <label><span>Título</span><input name="title" required maxLength={180} placeholder="Título do comunicado" /></label>}
        <textarea name="text" rows={7} required maxLength={5000} placeholder={type === "question" ? "Qual é a sua dúvida?" : "O que você quer compartilhar?"} />
        {type === "announcement" && <label className="check-row"><input type="checkbox" name="receipt" /> Solicitar confirmação de leitura</label>}
        <label className="file-button"><Camera size={17} /> Fotos/arquivos<input type="file" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))} /></label>
        {!!files.length && <small className="muted">{files.map((f) => f.name).join(", ")}</small>}
        <div className="modal-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy}>{busy ? "Publicando…" : "Publicar"}</button></div>
      </form>
    </Modal>
  );
}


function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><MessageSquareText size={30} /><h3>{title}</h3><p>{text}</p></div>;
}
