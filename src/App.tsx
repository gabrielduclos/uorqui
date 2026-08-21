import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowLeft, BarChart3, Bell, Building2, CalendarDays, Camera, Check, ChevronDown,
  ChevronRight, CirclePlus, CreditCard, Crown, Download, FileQuestion, Globe2, Home,
  KeyRound, LogOut, Megaphone, MessageSquareText, Plus, Search, Send, Settings,
  ShieldCheck, Smartphone, UserRound, Users, X
} from "lucide-react";
import {
  createUserWithEmailAndPassword, EmailAuthProvider, onAuthStateChanged,
  reauthenticateWithCredential, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, updatePassword, updateProfile, type User
} from "firebase/auth";
import { auth } from "./lib/firebase";
import { api, prefetchPostMedia } from "./lib/api";
import { currentPushState, enablePushNotifications, setupForegroundPush, syncPushRegistration, unregisterPushBeforeLogout, type PushState } from "./lib/push";
import { usePwaInstall } from "./lib/pwa";
import type {
  BootstrapData, Community, CommunityMember, HomeTab, NotificationItem, Post, View
} from "./types";
import { Avatar } from "./components/Avatar";
import { Modal } from "./components/Modal";
import { PostCard } from "./components/PostCard";
import "./styles.css";

const emptyData: BootstrapData = {
  me: { uid: "" }, companies: [], selectedCompanyId: "", company: null, role: null,
  canAdmin: false, isSuperadmin: false, communities: [], communityMap: {}, posts: [], worldPosts: [],
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
  const [headerSearch, setHeaderSearch] = useState("");
  const [searchSeed, setSearchSeed] = useState("");
  const [sharedPost, setSharedPost] = useState<Post | null>(null);
  const [sharedPostLoading, setSharedPostLoading] = useState(false);
  const pwaInstall = usePwaInstall();

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
      const visibleMedia = prefetchPostMedia([...next.posts, ...next.worldPosts], 8);
      await Promise.race([
        visibleMedia,
        new Promise<void>((resolve) => window.setTimeout(resolve, 250))
      ]);
      setData(next);
      void prefetchPostMedia([...next.posts, ...next.worldPosts], 24);
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
    const params = new URLSearchParams(location.search);
    const sharedCompany = params.get("company") || "";
    const stored = localStorage.getItem("uorqui-company") || "";
    refresh(sharedCompany || stored);
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

  useEffect(() => {
    if (!user || !data.me.uid || loading) return;
    const params = new URLSearchParams(location.search);
    const postId = params.get("post") || "";
    if (!postId) {
      setSharedPost(null);
      return;
    }

    let active = true;
    setSharedPostLoading(true);
    api<{ post: Post }>(`/posts/${encodeURIComponent(postId)}`)
      .then(async (result) => {
        await prefetchPostMedia([result.post], 5);
        if (active) setSharedPost(result.post);
      })
      .catch((error) => {
        if (active) {
          setSharedPost(null);
          showToast(errorMessage(error));
        }
      })
      .finally(() => active && setSharedPostLoading(false));

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, data.me.uid, data.selectedCompanyId, loading]);

  useEffect(() => {
    if (!user || !data.me.uid || loading) return;

    let unsubscribe: (() => void) | undefined;
    let active = true;

    if (currentPushState() === "granted") {
      void syncPushRegistration().catch(() => {});
      void setupForegroundPush((payload) => {
        if (!active) return;
        const title = payload.notification?.title || payload.data?.title || "Nova notificação no Uorqui";
        showToast(title);
        void refresh();
      }).then((cleanup) => {
        if (active) unsubscribe = cleanup;
        else cleanup();
      }).catch(() => {});
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, data.me.uid, selectedCompanyId, loading]);

  useEffect(() => {
    if (!user || !data.me.uid || loading) return;
    const params = new URLSearchParams(location.search);
    const billing = params.get("billing");
    const billingCompany = params.get("billingCompany") || "";
    if (!billing) return;

    setView("companies");
    if (billing === "success") showToast("Pagamento concluído. O Premium será ativado assim que o Asaas confirmar o webhook.");
    else if (billing === "cancel") showToast("Pagamento cancelado. Nenhuma cobrança foi confirmada.");
    else if (billing === "expired") showToast("O checkout expirou. Você pode gerar um novo na tela Empresas.");

    params.delete("billing");
    params.delete("billingCompany");
    const query = params.toString();
    history.replaceState({}, "", `${location.pathname}${query ? `?${query}` : ""}`);
    if (billingCompany) void refresh(billingCompany);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, data.me.uid, loading]);

  if (!authReady) return <Boot />;
  if (!user) return <AuthScreen />;
  if (loading && !data.me.uid) return <Boot />;
  if (fatal) return <ErrorScreen message={fatal} onRetry={() => refresh()} onLogout={() => unregisterPushBeforeLogout()} />;
  if (!data.companies.length && !data.isSuperadmin) return <Onboarding onCreated={(companyId) => refresh(companyId)} />;

  const unread = data.notifications.filter((n) => !n.read).length;
  const companyName = data.company?.name || "Uorqui";
  const pageTitle: Record<View, string> = {
    home: "Início", communities: "Comunidades", search: "Buscar", admin: "Administrar", profile: "Perfil", notifications: "Notificações", companies: "Empresas", superadmin: "Superadmin"
  };

  const navigate = (next: View) => {
    if (sharedPost) {
      setSharedPost(null);
      const params = new URLSearchParams(location.search);
      params.delete("post");
      params.delete("company");
      const query = params.toString();
      history.replaceState({}, "", `${location.pathname}${query ? `?${query}` : ""}`);
    }
    setView(next);
  };

  const openComposer = (target: { scope?: "company" | "community" | "world"; communityId?: string } = {}) => {
    pwaInstall.noteInteraction();
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

  const changeCompany = async (id: string, nextView: View = "home") => {
    localStorage.setItem("uorqui-company", id);
    setSelectedCompanyId(id);
    setSelectedCommunityId("");
    setView(nextView);
    await refresh(id);
  };

  const openPostFromNotification = async (notification: NotificationItem) => {
    const postId = notification.data?.postId || "";
    const companyId = notification.data?.companyId || "";
    if (!postId) return;

    try {
      if (companyId && companyId !== selectedCompanyId) {
        localStorage.setItem("uorqui-company", companyId);
        setSelectedCompanyId(companyId);
        await refresh(companyId);
      }

      const params = new URLSearchParams(location.search);
      params.set("post", postId);
      if (companyId) params.set("company", companyId);
      history.replaceState({}, "", `${location.pathname}?${params.toString()}`);

      setSharedPostLoading(true);
      const result = await api<{ post: Post }>(`/posts/${encodeURIComponent(postId)}`);
      await Promise.race([
        prefetchPostMedia([result.post], 5),
        new Promise<void>((resolve) => window.setTimeout(resolve, 180))
      ]);
      setSharedPost(result.post);
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setSharedPostLoading(false);
    }
  };

  const closeSharedPost = () => {
    setSharedPost(null);
    const params = new URLSearchParams(location.search);
    params.delete("post");
    params.delete("company");
    const query = params.toString();
    history.replaceState({}, "", `${location.pathname}${query ? `?${query}` : ""}`);
  };

  const reloadSharedPost = async () => {
    if (!sharedPost?.id) return;
    const result = await api<{ post: Post }>(`/posts/${encodeURIComponent(sharedPost.id)}`);
    await Promise.race([
      prefetchPostMedia([result.post], 5),
      new Promise<void>((resolve) => window.setTimeout(resolve, 180))
    ]);
    setSharedPost(result.post);
  };

  const renderPage = () => {
    if (data.isSuperadmin && (view === "superadmin" || (!data.companies.length && view !== "profile"))) {
      return <SuperadminPage showToast={showToast} onProfile={() => navigate("profile")} />;
    }
    if (sharedPostLoading) return <div className="page-section"><div className="loading-line">Abrindo publicação…</div></div>;
    if (sharedPost) return (
      <SharedPostPage
        data={data}
        post={sharedPost}
        onBack={closeSharedPost}
        reload={reloadSharedPost}
        refreshGlobal={() => refresh(sharedPost.companyId || selectedCompanyId)}
        showToast={showToast}
      />
    );
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
    if (view === "search") return <SearchPage data={data} initialQuery={searchSeed} refresh={() => refresh()} showToast={showToast} />;
    if (view === "admin") return <AdminPage data={data} onCompanyChange={(id) => changeCompany(id, "admin")} refresh={() => refresh()} showToast={showToast} />;
    if (view === "notifications") return <NotificationsPage data={data} refresh={() => refresh()} showToast={showToast} onOpenPost={openPostFromNotification} />;
    if (view === "companies") return <CompaniesPage data={data} onSelectCompany={(id) => changeCompany(id, "home")} showToast={showToast} />;
    return <ProfilePage
      data={data}
      refresh={() => refresh()}
      showToast={showToast}
      onOpenSuperadmin={() => navigate("superadmin")}
      pwaInstalled={pwaInstall.installed}
      pwaMode={pwaInstall.mode}
      pwaInstalling={pwaInstall.installing}
      onInstallPwa={() => pwaInstall.install()}
    />;
  };

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <button className="brand-button" onClick={() => navigate("home")}>
            <img src="/assets/uorqui-wordmark.png" alt="Uorqui" />
          </button>

          {!!data.companies.length && (
            <label className="company-picker">
              <span className="company-mark">{companyName.slice(0, 2).toUpperCase()}</span>
              <select value={selectedCompanyId} onChange={(e) => changeCompany(e.target.value)}>
                {data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
              <ChevronDown size={16} />
            </label>
          )}

          <nav className="side-nav">
            {!!data.companies.length && <>
              <NavButton active={view === "home"} icon={<Home />} label="Início" onClick={() => navigate("home")} />
              <NavButton active={view === "communities"} icon={<Users />} label="Comunidades" onClick={() => navigate("communities")} />
              <NavButton active={view === "search"} icon={<Search />} label="Buscar" onClick={() => navigate("search")} />
              {data.canAdmin && <NavButton active={view === "admin"} icon={<Settings />} label="Administrar" onClick={() => navigate("admin")} />}
            </>}
            {data.isSuperadmin && <NavButton active={view === "superadmin"} icon={<ShieldCheck />} label="Superadmin" onClick={() => navigate("superadmin")} />}
            <NavButton active={view === "profile"} icon={<UserRound />} label="Perfil" onClick={() => navigate("profile")} />
          </nav>

          {!!data.companies.length && <button className="btn publish-main" onClick={() => openComposer()}><Plus size={19} /> Publicar</button>}

          <div className="sidebar-user">
            <Avatar name={data.me.displayName || data.me.email} mediaId={data.me.avatarMediaId} />
            <div className="ellipsis">
              <strong>{data.me.displayName || "Usuário"}</strong>
              <small>{data.me.email}</small>
            </div>
            <button className="icon-btn" aria-label="Sair" onClick={() => unregisterPushBeforeLogout()}><LogOut size={18} /></button>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="topbar-line">
              <div className="topbar-brand">
                <button className="mobile-logo" onClick={() => navigate("home")}><img src="/assets/uorqui-wordmark.png" alt="Uorqui" /></button>
                <h1>{pageTitle[view]}</h1>
              </div>

              <form
                className="mobile-header-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  const next = headerSearch.trim();
                  if (next.length < 2) return;
                  setSearchSeed(next);
                  navigate("search");
                }}
              >
                <Search size={17} />
                <input
                  value={headerSearch}
                  onChange={(event) => {
                    const value = event.target.value;
                    setHeaderSearch(value);
                    if (value.trim().length >= 2) {
                      setSearchSeed(value);
                      navigate("search");
                    } else if (view === "search") {
                      setSearchSeed("");
                    }
                  }}
                  onBlur={() => setHeaderSearch("")}
                  placeholder="Buscar"
                  aria-label="Buscar no Uorqui"
                />
              </form>

              <div className="topbar-actions">
                <button className={`icon-btn top-bell ${view === "notifications" ? "active" : ""}`} onClick={() => navigate("notifications")} aria-label="Notificações">
                  <Bell size={21} />
                  {unread > 0 && <span className="count-badge">{unread > 99 ? "99+" : unread}</span>}
                </button>
                {data.canAdmin && (
                  <button className={`icon-btn mobile-admin-button ${view === "admin" ? "active" : ""}`} onClick={() => navigate("admin")} aria-label="Administrar empresa">
                    <Settings size={21} />
                  </button>
                )}
              </div>
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
          <section className="side-card compact"><strong>Uorqui 1.2.4</strong><small>Conversas de trabalho que não se perdem.</small></section>
        </aside>
      </div>

      {!!data.companies.length && (
        <nav className="mobile-nav">
          <MobileNav active={view === "home" && homeTab !== "world"} icon={<Home />} label="Início" onClick={() => { setHomeTab("for-you"); navigate("home"); }} />
          <MobileNav active={view === "communities"} icon={<Users />} label="Comunidades" onClick={() => navigate("communities")} />
          <button className="mobile-create" onClick={() => setComposerOpen(true)} aria-label="Publicar"><Plus size={26} /></button>
          <MobileNav active={view === "companies"} icon={<Building2 />} label="Empresas" onClick={() => navigate("companies")} />
          <MobileNav active={view === "profile"} icon={<UserRound />} label="Perfil" onClick={() => navigate("profile")} />
        </nav>
      )}

      {user && data.me.uid && pwaInstall.bannerVisible && !pwaInstall.installed && (
        <aside className="pwa-install-banner" role="status">
          <div className="pwa-install-icon"><img src="/assets/uorqui-icon-192.png" alt="" /></div>
          <div className="pwa-install-copy">
            <strong>Instale o Uorqui</strong>
            <span>Abra mais rápido e use como um app no celular.</span>
          </div>
          <button className="btn small" onClick={() => pwaInstall.install()} disabled={pwaInstall.installing}>
            <Download size={15} /> {pwaInstall.installing ? "Abrindo…" : "Instalar"}
          </button>
          <button className="icon-btn pwa-install-close" onClick={pwaInstall.dismissBanner} aria-label="Agora não">
            <X size={18} />
          </button>
        </aside>
      )}

      {pwaInstall.instructionsOpen && (
        <Modal title="Instalar Uorqui" onClose={pwaInstall.closeInstructions}>
          <div className="pwa-install-instructions">
            <div className="pwa-install-instruction-icon"><Smartphone size={30} /></div>
            {pwaInstall.isIOS ? (
              <>
                <h3>Adicionar à Tela de Início</h3>
                <p>No Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</p>
                <ol>
                  <li>Abra o menu <strong>Compartilhar</strong> do Safari.</li>
                  <li>Role as opções e escolha <strong>Adicionar à Tela de Início</strong>.</li>
                  <li>Confirme em <strong>Adicionar</strong>.</li>
                </ol>
              </>
            ) : (
              <>
                <h3>Instalar pelo navegador</h3>
                <p>Se o botão automático não estiver disponível, abra o menu do navegador e procure por <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</p>
              </>
            )}
            <button className="btn" onClick={pwaInstall.closeInstructions}>Entendi</button>
          </div>
        </Modal>
      )}

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
  return <div className="boot"><img src="/assets/uorqui-wordmark.png" alt="Uorqui" /><span>Carregando…</span></div>;
}

function ErrorScreen({ message, onRetry, onLogout }: { message: string; onRetry: () => void; onLogout: () => void }) {
  return <div className="center-card"><img src="/assets/uorqui-wordmark.png" alt="Uorqui" /><h2>Não foi possível abrir o Uorqui.</h2><p>{message}</p><div><button className="btn" onClick={onRetry}>Tentar novamente</button><button className="btn secondary" onClick={onLogout}>Sair</button></div></div>;
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
        <button className="text-button" onClick={() => unregisterPushBeforeLogout()}>Sair desta conta</button>
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

function SharedPostPage({
  data, post, onBack, reload, refreshGlobal, showToast
}: {
  data: BootstrapData;
  post: Post;
  onBack: () => void;
  reload: () => Promise<void>;
  refreshGlobal: () => Promise<void>;
  showToast: (message: string) => void;
}) {
  const like = async () => {
    try { await api(`/posts/${post.id}/reaction`, { method: "POST" }); await reload(); }
    catch (error) { showToast(errorMessage(error)); }
  };
  const read = async () => {
    try {
      await api(`/posts/${post.id}/read`, { method: "POST" });
      showToast("Leitura confirmada.");
      await reload();
      await refreshGlobal();
    } catch (error) { showToast(errorMessage(error)); }
  };
  const remove = async () => {
    const adminDeletingAnother = data.canAdmin && post.authorUid !== data.me.uid;
    if (!confirm(adminDeletingAnother ? "Apagar esta publicação como administrador?" : "Excluir sua publicação?")) return;
    try {
      const result = await api<{ tombstone?: boolean }>(`/posts/${post.id}`, { method: "DELETE" });
      if (result.tombstone) await reload();
      else onBack();
      showToast(result.tombstone ? "Conteúdo removido pela administração." : "Publicação excluída.");
    } catch (error) { showToast(errorMessage(error)); }
  };

  return (
    <section className="page-section shared-post-page">
      <button className="back-button shared-post-back" onClick={onBack}><ArrowLeft size={18} /> Voltar</button>
      <PostCard
        post={post}
        companyName={post.companyName || data.company?.name}
        community={data.communityMap[post.communityId || ""]}
        onLike={like}
        onRead={read}
        canDelete={post.authorUid === data.me.uid || (data.canAdmin && post.scope !== "world")}
        onDelete={remove}
        currentUid={data.me.uid}
        canAdmin={data.canAdmin}
        onChanged={reload}
        showToast={showToast}
      />
    </section>
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
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [addUid, setAddUid] = useState("");
  const [membersPage, setMembersPage] = useState(false);
  const selectedCommunity = data.allCompanyCommunities.find((community) => community.id === selectedCommunityId)
    || data.communities.find((community) => community.id === selectedCommunityId);

  const loadCommunityPosts = async (communityId: string) => {
    try {
      const result = await api<{ community: Community; posts: Post[] }>(`/communities/${communityId}/posts`);
      setCommunityPosts(result.posts);
      setDetailLoading(false);
      void prefetchPostMedia(result.posts, 16);
    } catch (err) {
      setDetailLoading(false);
      showToast(errorMessage(err));
    }
  };

  const loadCommunityMembers = async (communityId: string) => {
    setMembersLoading(true);
    try {
      const result = await api<{ community: Community; members: CommunityMember[]; count: number }>(`/communities/${communityId}/members`);
      setCommunityMembers(result.members);
      setMembersLoaded(true);
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    setMembersPage(false);
    setCommunityMembers([]);
    setMembersLoaded(false);
    setAddUid("");

    if (!selectedCommunityId) {
      setCommunityPosts([]);
      setDetailLoading(false);
      return;
    }

    // Bootstrap already carries the visible community posts. Render those on the
    // first frame and refresh quietly in the background instead of blocking on
    // another request plus the member list.
    const cached = data.posts.filter(post => post.scope === "community" && post.communityId === selectedCommunityId);
    setCommunityPosts(cached);
    setDetailLoading(cached.length === 0);
    void loadCommunityPosts(selectedCommunityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommunityId, data.selectedCompanyId]);

  const openMembers = () => {
    setMembersPage(true);
    if (selectedCommunityId && !membersLoaded) void loadCommunityMembers(selectedCommunityId);
  };

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
      if (selectedCommunityId) await loadCommunityPosts(selectedCommunityId);
    } catch (err) { showToast(errorMessage(err)); }
  };

  const read = async (post: Post) => {
    try {
      await api(`/posts/${post.id}/read`, { method: "POST" });
      showToast("Leitura confirmada.");
      if (selectedCommunityId) await loadCommunityPosts(selectedCommunityId);
      void refresh();
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
      if (selectedCommunityId) await loadCommunityPosts(selectedCommunityId);
      void refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  const addMember = async () => {
    if (!selectedCommunityId || !addUid) return;
    try {
      await api(`/communities/${selectedCommunityId}/members`, { method: "POST", body: JSON.stringify({ uid: addUid }) });
      setAddUid("");
      showToast("Usuário adicionado à comunidade.");
      await loadCommunityMembers(selectedCommunityId);
      void refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  const removeMember = async (member: CommunityMember) => {
    if (!selectedCommunityId) return;
    if (!confirm(`Remover ${member.displayName || member.email || "este usuário"} desta comunidade?`)) return;
    try {
      await api(`/communities/${selectedCommunityId}/members/${member.uid}`, { method: "DELETE" });
      showToast("Usuário removido da comunidade.");
      await loadCommunityMembers(selectedCommunityId);
      void refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  if (selectedCommunityId && selectedCommunity) {
    const currentIds = new Set(communityMembers.map((member) => member.uid));
    const availableMembers = data.members.filter((member) => !currentIds.has(member.uid));
    const memberCount = membersLoaded ? communityMembers.length : Number(selectedCommunity.memberCount || 0);

    if (membersPage) {
      return (
        <section className="page-section">
          <div className="members-page-head">
            <button className="back-button" onClick={() => setMembersPage(false)}><ArrowLeft size={18} /> {selectedCommunity.name}</button>
            <div><h2>Membros de {selectedCommunity.name}</h2><p>{memberCount} {memberCount === 1 ? "membro" : "membros"} nesta comunidade.</p></div>
          </div>

          {data.canAdmin && (
            <section className="panel-card members-manage-card">
              <div className="members-manage-copy"><strong>Adicionar usuário</strong><small>Escolha um colaborador da empresa que ainda não participa desta comunidade.</small></div>
              {!membersLoading && availableMembers.length ? (
                <div className="community-add-member">
                  <select value={addUid} onChange={(e) => setAddUid(e.target.value)}>
                    <option value="">Escolha um usuário…</option>
                    {availableMembers.map((member) => <option value={member.uid} key={member.uid}>{member.displayName || member.email}</option>)}
                  </select>
                  <button className="btn small" disabled={!addUid} onClick={addMember}><Plus size={15} /> Adicionar</button>
                </div>
              ) : !membersLoading ? <small className="muted">Todos os colaboradores da empresa já estão nesta comunidade.</small> : null}
            </section>
          )}

          <section className="panel-card members-page-list">
            {membersLoading && <div className="loading-line">Carregando membros…</div>}
            {!membersLoading && communityMembers.map((member) => (
              <div className="community-member-row members-page-row" key={member.uid}>
                <Avatar name={member.displayName || member.email} mediaId={member.avatarMediaId} size={42} />
                <div className="ellipsis"><strong>{member.displayName || member.email}</strong><small>{member.email}</small></div>
                <span className="private-pill">{member.companyRole === "owner" ? "Proprietário" : member.companyRole === "admin" ? "Administrador" : "Usuário"}</span>
                {data.canAdmin && <button className="btn danger small" onClick={() => removeMember(member)}>Remover</button>}
              </div>
            ))}
            {!membersLoading && membersLoaded && !communityMembers.length && <p className="muted">Nenhum usuário nesta comunidade.</p>}
          </section>
        </section>
      );
    }

    return (
      <section className="page-section">
        <div className="community-detail-head">
          <button className="back-button" onClick={onBack}><ArrowLeft size={18} /> Comunidades</button>
          <div className="community-detail-title">
            <div className="community-avatar large">{selectedCommunity.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <h2>{selectedCommunity.name}</h2>
              <p>{selectedCommunity.description || "Comunidade privada da empresa."}</p>
              <button className="community-members-link" onClick={openMembers}><Users size={14} />{memberCount} {memberCount === 1 ? "membro" : "membros"}<ChevronRight size={14} /></button>
            </div>
          </div>
          <button className="btn small" onClick={() => onComposeCommunity(selectedCommunity.id)}><Plus size={17} /> Publicar aqui</button>
        </div>

        <div className="feed community-feed">
          {detailLoading && !communityPosts.length && <div className="loading-line">Carregando publicações…</div>}
          {communityPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              companyName={data.company?.name}
              community={selectedCommunity}
              onLike={like}
              onRead={read}
              canDelete={post.authorUid === data.me.uid || data.canAdmin}
              onDelete={removePost}
              currentUid={data.me.uid}
              canAdmin={data.canAdmin}
              onChanged={async () => { if (selectedCommunityId) await loadCommunityPosts(selectedCommunityId); }}
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
            <div><strong>{community.name}</strong><p>{community.description || "Comunidade privada da empresa."}</p><small className="community-member-count">{community.memberCount || 0} {(community.memberCount || 0) === 1 ? "membro" : "membros"}</small></div>
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

function SearchPage({ data, initialQuery, refresh, showToast }: {
  data: BootstrapData; initialQuery?: string; refresh: () => Promise<void>; showToast: (m: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery || "");
  const [posts, setPosts] = useState<Post[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRequestId = useRef(0);

  const runSearch = async (value: string) => {
    const normalized = value.trim();
    if (normalized.length < 2) {
      searchRequestId.current += 1;
      setPosts([]);
      setSearched(false);
      setSearching(false);
      return;
    }

    const requestId = ++searchRequestId.current;
    setSearching(true);
    try {
      const qs = new URLSearchParams({ q: normalized, companyId: data.selectedCompanyId });
      const result = await api<{ posts: Post[] }>(`/search?${qs}`);
      if (requestId !== searchRequestId.current) return;
      setPosts(result.posts);
      setSearched(true);
      void prefetchPostMedia(result.posts, 12);
    } catch (err) {
      if (requestId === searchRequestId.current) showToast(errorMessage(err));
    } finally {
      if (requestId === searchRequestId.current) setSearching(false);
    }
  };

  useEffect(() => {
    if (initialQuery !== undefined && initialQuery !== query) setQuery(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      runSearch(query);
    }, 220);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, data.selectedCompanyId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await runSearch(query);
  };

  const like = async (post: Post) => {
    try { await api(`/posts/${post.id}/reaction`, { method: "POST" }); await refresh(); }
    catch (err) { showToast(errorMessage(err)); }
  };

  const read = async (post: Post) => {
    try {
      await api(`/posts/${post.id}/read`, { method: "POST" });
      showToast("Leitura confirmada.");
      await refresh();
      await runSearch(query);
    } catch (err) { showToast(errorMessage(err)); }
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
      <form className="large-search" onSubmit={submit}>
        <Search size={20} />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ex.: erro E37, férias, procedimento…" />
        <button className="btn small">Buscar</button>
      </form>
      {searching && <div className="live-search-status">Buscando…</div>}
      <div className="feed search-results">
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
        {searched && !posts.length && <Empty title="Nenhum resultado" text="Tente outras palavras ou uma busca mais curta." />}
      </div>
    </section>
  );
}

function AdminPage({ data, onCompanyChange, refresh, showToast }: {
  data: BootstrapData;
  onCompanyChange: (companyId: string) => Promise<void>;
  refresh: () => Promise<void>;
  showToast: (m: string) => void;
}) {
  const [inviteLink, setInviteLink] = useState("");
  const manageableCompanies = data.companies.filter((company) => company.role === "owner" || company.role === "admin");
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
      <div className="page-heading admin-page-heading">
        <div><h2>Administrar</h2><p>Escolha a empresa e gerencie colaboradores e comunidades privadas.</p></div>
        <label className="admin-company-picker">
          <span>Empresa</span>
          <select value={data.selectedCompanyId} onChange={(event) => onCompanyChange(event.target.value)}>
            {manageableCompanies.map((company) => (
              <option value={company.id} key={company.id}>{company.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="admin-company-context">
        <div className="company-profile-mark">{data.company?.name?.slice(0, 2).toUpperCase()}</div>
        <div><strong>{data.company?.name}</strong><small>{data.role === "owner" ? "Proprietário" : "Administrador"}</small></div>
      </div>
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


type SuperadminMetrics = {
  totalUsers: number;
  totalCompanies: number;
  freeCompanies: number;
  premiumCompanies: number;
  paidPremiumCompanies: number;
  manualPremiumCompanies: number;
  activeMemberships: number;
  totalCommunities: number;
  totalPosts: number;
  totalComments: number;
  newUsers30d: number;
  newCompanies30d: number;
  posts30d: number;
  comments30d: number;
  estimatedMonthlyRecurringRevenue: number;
  premiumMonthlyPrice: number;
};

type SuperadminCompany = {
  id: string;
  name: string;
  effectivePlan: "free" | "premium";
  billingStatus: string;
  premiumSource?: "asaas" | "manual" | "";
  premiumUntil?: string;
  manualPremiumUntil?: string;
  memberCount: number;
  communityCount: number;
  ownerName?: string;
  ownerEmail?: string;
  createdAt?: string;
};

function SuperadminPage({
  showToast,
  onProfile
}: {
  showToast: (message: string) => void;
  onProfile?: () => void;
}) {
  const [metrics, setMetrics] = useState<SuperadminMetrics | null>(null);
  const [companies, setCompanies] = useState<SuperadminCompany[]>([]);
  const [query, setQuery] = useState("");
  const [loadingSuperadmin, setLoadingSuperadmin] = useState(true);
  const [busyCompany, setBusyCompany] = useState("");
  const [daysByCompany, setDaysByCompany] = useState<Record<string, string>>({});

  const load = async () => {
    setLoadingSuperadmin(true);
    try {
      const result = await api<{
        metrics: SuperadminMetrics;
        companies: SuperadminCompany[];
      }>("/superadmin/overview");
      setMetrics(result.metrics);
      setCompanies(result.companies);
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setLoadingSuperadmin(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grantPremium = async (company: SuperadminCompany) => {
    if (busyCompany) return;
    const days = Math.max(1, Math.min(3650, Number(daysByCompany[company.id] || 30)));
    setBusyCompany(company.id);
    try {
      const result = await api<{ message?: string }>(
        `/superadmin/companies/${company.id}/premium`,
        {
          method: "PATCH",
          body: JSON.stringify({ action: "grant", days })
        }
      );
      showToast(result.message || "Premium adicionado.");
      await load();
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setBusyCompany("");
    }
  };

  const revokePremium = async (company: SuperadminCompany) => {
    if (
      busyCompany ||
      !confirm(`Remover o Premium manual de ${company.name}? Se houver assinatura paga ativa, ela continuará Premium.`)
    ) return;

    setBusyCompany(company.id);
    try {
      const result = await api<{ message?: string }>(
        `/superadmin/companies/${company.id}/premium`,
        {
          method: "PATCH",
          body: JSON.stringify({ action: "revoke" })
        }
      );
      showToast(result.message || "Premium manual removido.");
      await load();
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setBusyCompany("");
    }
  };

  const money = (value = 0) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const date = (value?: string) =>
    value ? new Date(value).toLocaleDateString("pt-BR") : "—";

  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const visibleCompanies = companies.filter((company) => {
    if (!normalizedQuery) return true;
    return [
      company.name,
      company.ownerName || "",
      company.ownerEmail || "",
      company.effectivePlan
    ].some(value => value.toLocaleLowerCase("pt-BR").includes(normalizedQuery));
  });

  return (
    <section className="page-section superadmin-page">
      <div className="page-heading superadmin-heading">
        <div>
          <span className="superadmin-kicker"><ShieldCheck size={15} /> Uorqui Superadmin</span>
          <h2>Métricas e planos</h2>
          <p>Visão operacional do produto. O Superadmin não recebe acesso ao conteúdo privado das empresas.</p>
        </div>
        <div className="superadmin-head-actions">
          {onProfile && <button className="btn secondary small" onClick={onProfile}>Perfil</button>}
          <button className="btn secondary small" disabled={loadingSuperadmin} onClick={load}>Atualizar</button>
        </div>
      </div>

      {loadingSuperadmin && !metrics && <div className="loading-line">Carregando métricas…</div>}

      {metrics && (
        <>
          <div className="superadmin-metrics">
            <article className="superadmin-metric">
              <Users size={19} />
              <span>Usuários</span>
              <strong>{metrics.totalUsers}</strong>
              <small>+{metrics.newUsers30d} nos últimos 30 dias</small>
            </article>
            <article className="superadmin-metric">
              <Building2 size={19} />
              <span>Empresas</span>
              <strong>{metrics.totalCompanies}</strong>
              <small>+{metrics.newCompanies30d} nos últimos 30 dias</small>
            </article>
            <article className="superadmin-metric">
              <Crown size={19} />
              <span>Premium</span>
              <strong>{metrics.premiumCompanies}</strong>
              <small>{metrics.paidPremiumCompanies} pagas · {metrics.manualPremiumCompanies} cortesia</small>
            </article>
            <article className="superadmin-metric">
              <BarChart3 size={19} />
              <span>MRR estimado</span>
              <strong>{money(metrics.estimatedMonthlyRecurringRevenue)}</strong>
              <small>Somente empresas Premium pagas</small>
            </article>
            <article className="superadmin-metric">
              <MessageSquareText size={19} />
              <span>Publicações</span>
              <strong>{metrics.totalPosts}</strong>
              <small>+{metrics.posts30d} nos últimos 30 dias</small>
            </article>
            <article className="superadmin-metric">
              <Users size={19} />
              <span>Comunidades</span>
              <strong>{metrics.totalCommunities}</strong>
              <small>{metrics.activeMemberships} vínculos ativos de equipe</small>
            </article>
          </div>

          <div className="superadmin-secondary-metrics">
            <span><strong>{metrics.freeCompanies}</strong> empresas Free</span>
            <span><strong>{metrics.totalComments}</strong> comentários</span>
            <span><strong>{metrics.comments30d}</strong> comentários em 30 dias</span>
            <span><strong>{money(metrics.premiumMonthlyPrice)}</strong> preço mensal atual</span>
          </div>
        </>
      )}

      <section className="panel-card superadmin-companies-panel">
        <div className="superadmin-company-toolbar">
          <div>
            <h3>Empresas</h3>
            <small>{visibleCompanies.length} de {companies.length}</small>
          </div>
          <label className="superadmin-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar empresa ou proprietário"
            />
          </label>
        </div>

        <div className="superadmin-company-list">
          {visibleCompanies.map((company) => {
            const premium = company.effectivePlan === "premium";
            const manual = company.premiumSource === "manual" && !!company.manualPremiumUntil;

            return (
              <article className="superadmin-company-row" key={company.id}>
                <div className="company-profile-mark">{company.name.slice(0, 2).toUpperCase()}</div>

                <div className="superadmin-company-main">
                  <div className="superadmin-company-name">
                    <strong>{company.name}</strong>
                    <span className={`plan-pill ${premium ? "premium" : "free"}`}>
                      {premium ? <><Crown size={12} /> Premium</> : "Free"}
                    </span>
                  </div>
                  <small>
                    {company.ownerName || "Proprietário"}{company.ownerEmail ? ` · ${company.ownerEmail}` : ""}
                  </small>
                  <small>
                    {company.memberCount} membros · {company.communityCount} comunidades · criada em {date(company.createdAt)}
                  </small>
                  {manual && (
                    <span className="manual-premium-note">
                      Cortesia até {date(company.manualPremiumUntil)}
                    </span>
                  )}
                  {!manual && company.premiumSource === "asaas" && (
                    <span className="paid-premium-note">Premium via Asaas · {company.billingStatus}</span>
                  )}
                </div>

                <div className="superadmin-premium-actions">
                  <select
                    value={daysByCompany[company.id] || "30"}
                    onChange={(event) =>
                      setDaysByCompany(current => ({ ...current, [company.id]: event.target.value }))
                    }
                    disabled={busyCompany === company.id}
                  >
                    <option value="30">30 dias</option>
                    <option value="60">60 dias</option>
                    <option value="90">90 dias</option>
                    <option value="180">180 dias</option>
                    <option value="365">1 ano</option>
                  </select>
                  <button
                    className="btn small"
                    disabled={busyCompany === company.id}
                    onClick={() => grantPremium(company)}
                  >
                    <Crown size={15} /> {manual ? "Adicionar tempo" : "Dar Premium"}
                  </button>
                  {manual && (
                    <button
                      className="btn danger small"
                      disabled={busyCompany === company.id}
                      onClick={() => revokePremium(company)}
                    >
                      Remover cortesia
                    </button>
                  )}
                </div>
              </article>
            );
          })}

          {!loadingSuperadmin && !visibleCompanies.length && (
            <p className="muted superadmin-empty">Nenhuma empresa encontrada.</p>
          )}
        </div>
      </section>
    </section>
  );
}

type CompanySummary = {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
  plan?: "free" | "premium";
  effectivePlan?: "free" | "premium";
  billingStatus?: "inactive" | "pending" | "active" | "past_due" | "canceled";
  premiumUntil?: string;
  manualPremiumUntil?: string;
  premiumSource?: "asaas" | "manual" | "";
  memberCount?: number;
  communityCount?: number;
  limits?: { members: number | null; communities: number | null };
  billingReady?: boolean;
  premiumMonthlyPrice?: number;
  billingSubscriptionId?: string;
  communities: Array<{ id: string; name: string; description?: string; memberCount?: number }>;
};

function CompaniesPage({
  data,
  onSelectCompany,
  showToast
}: {
  data: BootstrapData;
  onSelectCompany: (companyId: string) => Promise<void>;
  showToast: (message: string) => void;
}) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [billingBusy, setBillingBusy] = useState("");

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    try {
      const result = await api<{ companies: CompanySummary[] }>("/companies/summary");
      setCompanies(result.companies);
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setLoadingCompanies(false);
    }
  };

  useEffect(() => {
    void loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.companies.length, data.selectedCompanyId]);

  const currency = (value = 49.9) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const upgrade = async (company: CompanySummary) => {
    if (billingBusy) return;
    setBillingBusy(company.id);
    try {
      const result = await api<{ url: string }>(`/companies/${company.id}/billing/checkout`, { method: "POST" });
      window.location.href = result.url;
    } catch (error) {
      showToast(errorMessage(error));
      setBillingBusy("");
    }
  };

  const cancelPremium = async (company: CompanySummary) => {
    if (billingBusy || !confirm(`Cancelar a renovação do Premium de ${company.name}? O acesso Premium permanece até o fim do período já pago.`)) return;
    setBillingBusy(company.id);
    try {
      await api(`/companies/${company.id}/billing/cancel`, { method: "POST" });
      showToast("Renovação do Premium cancelada.");
      await loadCompanies();
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setBillingBusy("");
    }
  };

  return (
    <section className="page-section companies-page">
      <div className="page-heading">
        <div><h2>Empresas</h2><p>Cada empresa possui seu próprio plano. A mesma conta pode participar de empresas Free e Premium.</p></div>
      </div>

      {loadingCompanies && <div className="loading-line">Carregando empresas…</div>}

      {!loadingCompanies && (
        <div className="companies-summary-list">
          {companies.map((company) => {
            const premium = company.effectivePlan === "premium";
            const pending = company.billingStatus === "pending";
            const memberLimit = company.limits?.members ?? 5;
            const communityLimit = company.limits?.communities ?? 2;
            return (
              <section className={`company-summary-card ${company.id === data.selectedCompanyId ? "current" : ""}`} key={company.id}>
                <div className="company-summary-head">
                  <div className="company-profile-mark">{company.name.slice(0, 2).toUpperCase()}</div>
                  <div className="ellipsis">
                    <strong>{company.name}</strong>
                    <small>{company.role === "owner" ? "Proprietário" : company.role === "admin" ? "Administrador" : "Usuário"}</small>
                  </div>
                  <span className={`plan-pill ${premium ? "premium" : "free"}`}>{premium ? <><Crown size={13} /> Premium</> : "Free"}</span>
                  {company.id === data.selectedCompanyId ? <span className="private-pill">Atual</span> : <button className="btn secondary small" onClick={() => onSelectCompany(company.id)}>Abrir</button>}
                </div>

                <div className="company-plan-summary">
                  <div className="plan-usage">
                    <strong>{premium ? "Uorqui Premium" : "Uorqui Free"}</strong>
                    <small>
                      {premium
                        ? `${company.memberCount || 0} membros · ${company.communityCount || 0} comunidades · sem os limites do Free`
                        : `${company.memberCount || 0}/${memberLimit} membros · ${company.communityCount || 0}/${communityLimit} comunidades`}
                    </small>
                  </div>

                  {!premium && company.role === "owner" && (
                    <div className="upgrade-box">
                      <div><Crown size={18} /><span><strong>Premium para empresas</strong><small>Mais de 5 membros e mais de 2 comunidades. Todo o restante já está liberado no Free.</small></span></div>
                      <button className="btn small" disabled={!company.billingReady || billingBusy === company.id} onClick={() => upgrade(company)}>
                        <CreditCard size={16} /> {pending ? "Continuar pagamento" : `Ativar · ${currency(company.premiumMonthlyPrice)}/mês`}
                      </button>
                      <small className="payment-methods">Pix ou cartão de crédito via Asaas.</small>
                      {!company.billingReady && <small className="billing-warning">Configure os Secrets do Asaas no Worker para habilitar a cobrança.</small>}
                    </div>
                  )}

                  {!premium && company.role !== "owner" && <small className="muted">O proprietário desta empresa gerencia o plano.</small>}

                  {premium && (
                    <div className="premium-status">
                      <Crown size={17} />
                      <div>
                        <strong>Premium ativo</strong>
                        <small>
                          {company.premiumSource === "manual" && company.manualPremiumUntil
                            ? `Cortesia Uorqui até ${new Date(company.manualPremiumUntil).toLocaleDateString("pt-BR")}.`
                            : company.premiumUntil
                              ? `Acesso pago até ${new Date(company.premiumUntil).toLocaleDateString("pt-BR")}.`
                              : "Assinatura ativa."}
                        </small>
                      </div>
                      {company.role === "owner" && company.billingSubscriptionId && company.billingStatus !== "canceled" && (
                        <button className="text-button" disabled={billingBusy === company.id} onClick={() => cancelPremium(company)}>Cancelar renovação</button>
                      )}
                    </div>
                  )}

                  {company.billingStatus === "past_due" && <div className="billing-warning">Pagamento pendente. O Premium permanece disponível somente até o fim do período já confirmado.</div>}
                  {company.billingStatus === "canceled" && premium && <div className="billing-warning">Renovação cancelada. O plano volta ao Free após o período pago.</div>}
                </div>

                <div className="company-summary-communities">
                  {company.communities.map((community) => (
                    <div className="company-summary-community" key={community.id}>
                      <div className="community-avatar">{community.name.slice(0, 2).toUpperCase()}</div>
                      <div className="ellipsis"><strong>{community.name}</strong><small>{community.description || "Comunidade privada"}{typeof community.memberCount === "number" ? ` · ${community.memberCount} membros` : ""}</small></div>
                    </div>
                  ))}
                  {!company.communities.length && <p className="muted company-no-communities">Nenhuma comunidade disponível para sua conta nesta empresa.</p>}
                </div>
              </section>
            );
          })}
          {!companies.length && <Empty title="Nenhuma empresa" text="As empresas das quais você participa aparecerão aqui." />}
        </div>
      )}
    </section>
  );
}

function ProfilePage({
  data, refresh, showToast, onOpenSuperadmin,
  pwaInstalled, pwaMode, pwaInstalling, onInstallPwa
}: {
  data: BootstrapData;
  refresh: () => Promise<void>;
  showToast: (m: string) => void;
  onOpenSuperadmin: () => void;
  pwaInstalled: boolean;
  pwaMode: "installed" | "prompt" | "ios" | "manual";
  pwaInstalling: boolean;
  onInstallPwa: () => Promise<unknown>;
}) {
  const [photoError, setPhotoError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [companyError, setCompanyError] = useState("");
  const [createCompanyOpen, setCreateCompanyOpen] = useState(false);
  const [deleteCompany, setDeleteCompany] = useState<{ id: string; name: string } | null>(null);

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

  const createCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCompanyError("");
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") || "").trim();
    if (!name) return;
    try {
      await api("/companies", { method: "POST", body: JSON.stringify({ name }) });
      form.reset();
      setCreateCompanyOpen(false);
      showToast("Empresa criada.");
      await refresh();
    } catch (err) { setCompanyError(errorMessage(err)); }
  };

  const confirmDeleteCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deleteCompany) return;
    setCompanyError("");
    const confirmation = String(new FormData(event.currentTarget).get("confirmation") || "");
    try {
      await api(`/companies/${deleteCompany.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation })
      });
      if (localStorage.getItem("uorqui-company") === deleteCompany.id) {
        localStorage.removeItem("uorqui-company");
      }
      setDeleteCompany(null);
      showToast("Empresa excluída.");
      await refresh();
    } catch (err) { setCompanyError(errorMessage(err)); }
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
      <section className={`panel-card profile-install-card ${pwaInstalled ? "installed" : ""}`}>
        <div className="profile-install-icon">
          {pwaInstalled ? <Check size={21} /> : <Download size={21} />}
        </div>
        <div className="profile-install-copy">
          <strong>{pwaInstalled ? "Uorqui instalado" : "Instalar Uorqui"}</strong>
          <p className="muted">
            {pwaInstalled
              ? "Você está usando o Uorqui como aplicativo."
              : pwaMode === "ios"
                ? "Adicione o Uorqui à Tela de Início para abrir como um app."
                : "Tenha um ícone próprio, tela cheia e acesso mais rápido ao Uorqui."}
          </p>
        </div>
        {!pwaInstalled && (
          <button className="btn small" disabled={pwaInstalling} onClick={() => onInstallPwa()}>
            <Download size={15} />
            {pwaInstalling ? "Abrindo…" : pwaMode === "ios" ? "Como instalar" : "Instalar"}
          </button>
        )}
      </section>

      {data.isSuperadmin && (
        <section className="panel-card superadmin-profile-card">
          <div>
            <strong>Superadmin Uorqui</strong>
            <p className="muted">Métricas globais, empresas e concessão manual de Premium.</p>
          </div>
          <button className="btn small" onClick={onOpenSuperadmin}><ShieldCheck size={16} /> Abrir Superadmin</button>
        </section>
      )}

      <section className="panel-card profile-companies-card">
        <div className="profile-companies-head">
          <div>
            <strong>Empresas</strong>
            <p className="muted">Sua conta pode participar de várias empresas. Somente o proprietário pode excluir uma empresa.</p>
          </div>
          <button className="btn small" onClick={() => { setCompanyError(""); setCreateCompanyOpen(true); }}>
            <Plus size={16} /> Criar empresa
          </button>
        </div>

        <div className="profile-company-list">
          {data.companies.map((company) => (
            <div className="profile-company-row" key={company.id}>
              <div className="company-profile-mark">{company.name.slice(0, 2).toUpperCase()}</div>
              <div className="ellipsis">
                <strong>{company.name}</strong>
                <small>{company.role === "owner" ? "Proprietário" : company.role === "admin" ? "Administrador" : "Usuário"}</small>
              </div>
              {company.role === "owner" && (
                <button className="btn danger small" onClick={() => { setCompanyError(""); setDeleteCompany({ id: company.id, name: company.name }); }}>
                  Excluir
                </button>
              )}
            </div>
          ))}
        </div>
        {companyError && <div className="form-error">{companyError}</div>}
      </section>

      <section className="panel-card session-card"><div><strong>Sessão</strong><p className="muted">Encerrar o acesso neste dispositivo.</p></div><button className="btn secondary" onClick={() => unregisterPushBeforeLogout()}><LogOut size={17} /> Sair da conta</button></section>

      {createCompanyOpen && (
        <Modal title="Criar empresa" onClose={() => setCreateCompanyOpen(false)}>
          <form className="stack-form" onSubmit={createCompany}>
            <label><span>Nome da empresa</span><input name="name" required maxLength={120} placeholder="Ex.: Minha Empresa" /></label>
            <p className="muted modal-help">Você será o proprietário e poderá convidar administradores e usuários depois.</p>
            {companyError && <div className="form-error">{companyError}</div>}
            <button className="btn">Criar empresa</button>
          </form>
        </Modal>
      )}

      {deleteCompany && (
        <Modal title="Excluir empresa" onClose={() => setDeleteCompany(null)}>
          <form className="stack-form" onSubmit={confirmDeleteCompany}>
            <div className="danger-notice">
              <strong>Esta ação é permanente.</strong>
              <p>Comunidades, publicações, comentários, membros, convites e arquivos desta empresa serão removidos.</p>
            </div>
            <label>
              <span>Digite <strong>{deleteCompany.name}</strong> para confirmar</span>
              <input name="confirmation" required autoComplete="off" />
            </label>
            {companyError && <div className="form-error">{companyError}</div>}
            <button className="btn danger-confirm">Excluir empresa definitivamente</button>
          </form>
        </Modal>
      )}
    </section>
  );
}

function NotificationsPage({ data, refresh, showToast, onOpenPost }: {
  data: BootstrapData;
  refresh: () => Promise<void>;
  showToast: (m: string) => void;
  onOpenPost: (notification: NotificationItem) => Promise<void>;
}) {
  const [pushState, setPushState] = useState<PushState>(() => currentPushState());
  const [pushBusy, setPushBusy] = useState(false);

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

  const activatePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const next = await enablePushNotifications();
      setPushState(next);

      if (next === "granted") showToast("Notificações push ativadas.");
      else if (next === "denied") showToast("As notificações foram bloqueadas pelo navegador.");
      else if (next === "not_configured") showToast("Falta configurar a chave pública VAPID do Firebase.");
      else if (next === "unsupported") showToast("Este navegador não oferece suporte a notificações push.");
    } catch (error) {
      showToast(errorMessage(error));
      setPushState(currentPushState());
    } finally {
      setPushBusy(false);
    }
  };

  const openNotification = async (notification: NotificationItem) => {
    if (!notification.id) return;

    if (!notification.read && !notification.persistent) {
      try {
        await api(`/notifications/${notification.id}/read`, { method: "POST" });
      } catch {}
    }

    if (notification.data?.postId) {
      await onOpenPost(notification);
      if (!notification.persistent) void refresh();
      return;
    }

    if (!notification.read && !notification.persistent) {
      await refresh();
    }
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

      <section className={`push-activation-card ${pushState === "granted" ? "enabled" : ""}`}>
        <div className="notification-icon"><Bell size={19} /></div>
        <div>
          <strong>{pushState === "granted" ? "Push ativado" : "Receba notificações mesmo fora do Uorqui"}</strong>
          <p>
            {pushState === "granted"
              ? "Novas publicações relevantes, respostas, curtidas e confirmações pendentes podem chegar ao seu dispositivo."
              : pushState === "denied"
                ? "O navegador bloqueou as notificações. Reative a permissão nas configurações do site."
                : pushState === "not_configured"
                  ? "A integração está pronta, mas falta informar a chave pública VAPID do Firebase."
                  : pushState === "unsupported"
                    ? "Este navegador não oferece suporte ao sistema de push usado pelo Uorqui."
                    : "Ative para receber novas publicações da sua empresa/comunidades, respostas e curtidas."}
          </p>
        </div>
        {pushState === "default" && (
          <button className="btn small" disabled={pushBusy} onClick={activatePush}>
            {pushBusy ? "Ativando…" : "Ativar push"}
          </button>
        )}
      </section>

      <div className="notifications-page-list">
        {data.notifications.map((item, index) => (
          <article
            className={`notification-page-item ${item.read ? "" : "unread"} ${item.persistent && !item.read ? "persistent" : ""}`}
            key={item.id || index}
            onClick={() => openNotification(item)}
          >
            <div className="notification-icon">
              {item.type.includes("community") || item.type.includes("invite")
                ? <Users size={19} />
                : item.type === "announcement" || item.type === "read_required"
                  ? <Megaphone size={19} />
                  : <Bell size={19} />}
            </div>

            <div className="notification-page-copy">
              <strong>{item.title}</strong>
              <p>{item.body}</p>

              {item.persistent && !item.read && (
                <span className="persistent-notification-note">
                  Pendente até você confirmar a leitura na publicação.
                </span>
              )}

              {item.status === "pending" && item.type.includes("invite") && (
                <button className="btn small" onClick={(event) => { event.stopPropagation(); accept(item); }}>
                  <Check size={16} /> Aceitar
                </button>
              )}

              {!!item.data?.postId && (
                <button
                  className="text-button notification-open-post"
                  onClick={(event) => {
                    event.stopPropagation();
                    void openNotification(item);
                  }}
                >
                  Abrir publicação
                </button>
              )}
            </div>

            {!item.read && <span className="unread-dot" aria-label="Não lida" />}
          </article>
        ))}

        {!data.notifications.length && (
          <Empty title="Tudo em dia" text="Publicações relevantes, respostas, curtidas, convites e confirmações aparecerão aqui." />
        )}
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
  const [type, setType] = useState<"post" | "question" | "announcement" | "poll" | "event">("post");
  const [communityId, setCommunityId] = useState(initialCommunityId || data.communities[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [pollOptions, setPollOptions] = useState(["", ""]);

  useEffect(() => { if (type === "announcement") setScope("company"); }, [type]);

  const updatePollOption = (index: number, value: string) => {
    setPollOptions((current) => current.map((item, i) => i === index ? value : item));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const fd = new FormData(event.currentTarget);
    const text = String(fd.get("text") || "").trim();
    const title = String(fd.get("title") || "").trim();

    try {
      if (scope === "community" && !communityId) throw new Error("Escolha uma comunidade.");
      if (type === "poll" && pollOptions.filter(option => option.trim()).length < 2) throw new Error("A enquete precisa de pelo menos 2 opções.");

      const eventStartLocal = String(fd.get("eventStart") || "");
      const eventEndLocal = String(fd.get("eventEnd") || "");
      const eventStart = type === "event" && eventStartLocal ? new Date(eventStartLocal).toISOString() : "";
      const eventEnd = type === "event" && eventEndLocal ? new Date(eventEndLocal).toISOString() : "";
      const eventTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

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
          scope, type, text, title,
          companyId: scope === "world" ? "" : data.selectedCompanyId,
          communityId: scope === "community" ? communityId : "",
          requiresReadReceipt: type === "announcement" && fd.get("receipt") === "on",
          pollOptions: type === "poll" ? pollOptions.map(option => option.trim()).filter(Boolean) : [],
          eventStart,
          eventEnd,
          eventLocation: type === "event" ? String(fd.get("eventLocation") || "").trim() : "",
          eventTimeZone,
          attachmentIds
        })
      });

      showToast(type === "event" ? "Evento publicado." : type === "poll" ? "Enquete publicada." : "Publicado.");
      await onDone();
    } catch (err) {
      showToast(errorMessage(err));
      setBusy(false);
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
          <button type="button" className={type === "poll" ? "selected" : ""} onClick={() => setType("poll")}><BarChart3 size={16} /> Enquete</button>
          <button type="button" className={type === "event" ? "selected" : ""} onClick={() => setType("event")}><CalendarDays size={16} /> Evento</button>
          {data.canAdmin && <button type="button" className={type === "announcement" ? "selected" : ""} onClick={() => setType("announcement")}><Megaphone size={16} /> Comunicado</button>}
        </div>

        {(type === "announcement" || type === "event") && <label><span>{type === "event" ? "Nome do evento" : "Título"}</span><input name="title" required maxLength={180} placeholder={type === "event" ? "Ex.: Reunião mensal" : "Título do comunicado"} /></label>}

        {type === "event" && (
          <div className="event-form-grid">
            <label><span>Início</span><input name="eventStart" type="datetime-local" required /></label>
            <label><span>Término (opcional)</span><input name="eventEnd" type="datetime-local" /></label>
            <label className="event-location-field"><span>Local ou link</span><input name="eventLocation" maxLength={240} placeholder="Sala, endereço ou link da reunião" /></label>
          </div>
        )}

        <textarea
          name="text"
          rows={type === "event" ? 4 : 7}
          required={type !== "event"}
          maxLength={5000}
          placeholder={type === "question" ? "Qual é a sua dúvida?" : type === "poll" ? "Qual pergunta você quer fazer?" : type === "event" ? "Descrição do evento (opcional)" : "O que você quer compartilhar?"}
        />

        {type === "poll" && (
          <div className="poll-composer">
            <strong>Opções da enquete</strong>
            {pollOptions.map((option, index) => (
              <div className="poll-option-input" key={index}>
                <input value={option} required={index < 2} maxLength={160} onChange={(e) => updatePollOption(index, e.target.value)} placeholder={`Opção ${index + 1}`} />
                {pollOptions.length > 2 && <button type="button" className="icon-btn" onClick={() => setPollOptions(current => current.filter((_, i) => i !== index))}><X size={16} /></button>}
              </div>
            ))}
            {pollOptions.length < 6 && <button type="button" className="text-button poll-add-option" onClick={() => setPollOptions(current => [...current, ""])}><Plus size={14} /> Adicionar opção</button>}
            <small className="muted">De 2 a 6 opções. Cada pessoa pode votar uma vez e alterar o voto.</small>
          </div>
        )}

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
