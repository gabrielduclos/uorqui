import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowLeft, BarChart3, Bell, Building2, CalendarDays, Camera, Check, ChevronDown,
  ChevronRight, CirclePlus, CreditCard, Crown, Download, FileQuestion, Globe2, Home,
  KeyRound, LogOut, Megaphone, MessageSquareText, Plus, Search, Send, Settings,
  ShieldCheck, Smartphone, Trash2, UserMinus, UserPlus, UserRound, Users, X
} from "lucide-react";
import {
  createUserWithEmailAndPassword, deleteUser as deleteFirebaseUser, EmailAuthProvider, onAuthStateChanged,
  reauthenticateWithCredential, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, updatePassword, updateProfile, type User
} from "firebase/auth";
import { auth } from "./lib/firebase";
import { ApiError, api, prefetchPostMedia } from "./lib/api";
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

function communityVisibility(community?: Pick<Community, "visibility"> | null): "public" | "private" {
  return community?.visibility === "public" ? "public" : "private";
}

async function refreshFirebaseSession() {
  const current = auth.currentUser;
  if (!current) throw new Error("Faça login novamente para continuar.");
  await current.reload();
  await current.getIdToken(true);
  return current.emailVerified;
}

function optimisticTombstone(post: Post): Post {
  const deletedAt = new Date().toISOString();
  return {
    ...post,
    deletedByAdmin: true,
    deletedAt,
    text: "",
    title: "",
    attachments: [],
    reactionCount: 0,
    commentCount: 0
  };
}

function isPlanLimitError(error: unknown) {
  return error instanceof ApiError && error.status === 402;
}

type PlanOfferReason =
  | { kind: "company_created"; message?: string }
  | { kind: "limit"; message?: string }
  | { kind: "manual"; message?: string }
  | null;

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
  const [manageCommunityMembersId, setManageCommunityMembersId] = useState("");
  const [composerTarget, setComposerTarget] = useState<{ scope?: "company" | "community" | "world"; communityId?: string }>({});
  const [headerSearch, setHeaderSearch] = useState("");
  const [searchSeed, setSearchSeed] = useState("");
  const [sharedPost, setSharedPost] = useState<Post | null>(null);
  const [sharedPostLoading, setSharedPostLoading] = useState(false);
  const [pushPermissionPromptOpen, setPushPermissionPromptOpen] = useState(false);
  const [pushPermissionBusy, setPushPermissionBusy] = useState(false);
  const [planOfferReason, setPlanOfferReason] = useState<PlanOfferReason>(null);
  const [lastCreatedPost, setLastCreatedPost] = useState<Post | null>(null);
  const [, setAuthRevision] = useState(0);
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
    if (!user || user.emailVerified) return;
    let active = true;
    let checking = false;

    const checkVerification = async () => {
      if (checking || !auth.currentUser) return;
      checking = true;
      try {
        const verified = await refreshFirebaseSession();
        if (active && verified) {
          setAuthRevision((current) => current + 1);
          await refresh();
        }
      } catch {
        // A tela também oferece uma verificação manual com retorno visível.
      } finally {
        checking = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkVerification();
    };
    window.addEventListener("focus", checkVerification);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.removeEventListener("focus", checkVerification);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, user?.emailVerified]);

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
        const body = payload.notification?.body || payload.data?.body || "Você tem uma nova atualização.";
        const type = payload.data?.type || "";
        if (["company_member_joined", "community_added", "community_removed"].includes(type)) {
          void navigator.serviceWorker.ready.then((registration) => registration.showNotification(title, {
            body,
            icon: "/assets/uorqui-icon-192-v1215.png",
            badge: "/assets/uorqui-favicon.png",
            tag: `uorqui-${payload.data?.notificationId || Date.now()}`,
            data: { url: payload.data?.url || "/", notificationId: payload.data?.notificationId || "", type }
          })).catch(() => {});
        }
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
    const adminRequested = params.get("admin") === "1";
    const notificationsRequested = params.get("notifications") === "1";
    const communityId = params.get("community") || "";
    if (!adminRequested && !notificationsRequested && !communityId) return;

    const companyId = params.get("company") || "";
    params.delete("admin");
    params.delete("notifications");
    params.delete("community");
    params.delete("company");
    const query = params.toString();
    history.replaceState({}, "", `${location.pathname}${query ? `?${query}` : ""}`);

    const openRequestedView = async () => {
      if (companyId && companyId !== data.selectedCompanyId) {
        localStorage.setItem("uorqui-company", companyId);
        setSelectedCompanyId(companyId);
        await refresh(companyId);
      }

      if (adminRequested) {
        setView("admin");
        return;
      }
      if (communityId) {
        setSelectedCommunityId(communityId);
        setView("communities");
        return;
      }
      setView("notifications");
    };

    void openRequestedView().catch((error) => showToast(errorMessage(error)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, data.me.uid, loading]);


  useEffect(() => {
    if (!user || !data.me.uid || loading) return;
    if (currentPushState() !== "default") return;

    const key = `uorqui-push-permission-prompt:${data.me.uid}`;
    const lastPrompt = Number(localStorage.getItem(key) || "0");
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    if (lastPrompt && Date.now() - lastPrompt < sevenDays) return;

    const timer = window.setTimeout(() => {
      setPushPermissionPromptOpen(true);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [user?.uid, data.me.uid, loading]);

  const postponePushPermission = () => {
    if (data.me.uid) {
      localStorage.setItem(
        `uorqui-push-permission-prompt:${data.me.uid}`,
        String(Date.now())
      );
    }
    setPushPermissionPromptOpen(false);
  };

  const activatePushFromAutomaticPrompt = async () => {
    if (pushPermissionBusy) return;
    setPushPermissionBusy(true);

    try {
      const next = await enablePushNotifications();

      if (next === "granted") {
        setPushPermissionPromptOpen(false);
        localStorage.removeItem(`uorqui-push-permission-prompt:${data.me.uid}`);
        showToast("Notificações push ativadas.");
        return;
      }

      if (data.me.uid) {
        localStorage.setItem(
          `uorqui-push-permission-prompt:${data.me.uid}`,
          String(Date.now())
        );
      }

      if (next === "denied") {
        showToast("As notificações foram bloqueadas pelo navegador.");
      } else if (next === "not_configured") {
        showToast("Falta configurar a chave pública VAPID do Firebase.");
      } else if (next === "unsupported") {
        showToast("Este navegador não oferece suporte a notificações push.");
      }
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setPushPermissionBusy(false);
    }
  };

  useEffect(() => {
    if (!user || !data.me.uid || loading) return;
    const params = new URLSearchParams(location.search);
    const billing = params.get("billing");
    const billingCompany = params.get("billingCompany") || "";
    if (!billing) return;

    setView("plans");
    if (billing === "success") showToast("Pagamento concluído. O Premium será ativado assim que o Asaas confirmar o webhook.");
    else if (billing === "cancel") showToast("Pagamento cancelado. Nenhuma cobrança foi confirmada.");
    else if (billing === "expired") showToast("O checkout expirou. Você pode gerar um novo na tela Planos.");

    params.delete("billing");
    params.delete("billingCompany");
    const query = params.toString();
    history.replaceState({}, "", `${location.pathname}${query ? `?${query}` : ""}`);
    if (billingCompany) void refresh(billingCompany);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, data.me.uid, loading]);

  useEffect(() => {
    if (!user || !data.me.uid || loading) return;
    const params = new URLSearchParams(location.search);
    if (params.get("notifications") !== "1") return;
    if (data.companies.length || data.isSuperadmin) setView("notifications");
    params.delete("notifications");
    const query = params.toString();
    history.replaceState({}, "", `${location.pathname}${query ? `?${query}` : ""}`);
  }, [user, data.me.uid, data.companies.length, data.isSuperadmin, loading]);

  if (!authReady) return <Boot />;
  if (!user) return <AuthScreen />;
  if (loading && !data.me.uid) return <Boot />;
  if (fatal) return <ErrorScreen message={fatal} onRetry={() => refresh()} onLogout={() => unregisterPushBeforeLogout()} />;
  if (!data.companies.length && !data.isSuperadmin) return (
    <Onboarding
      data={data}
      refresh={() => refresh()}
      showToast={showToast}
      onAccepted={async (companyId) => {
        if (companyId) localStorage.setItem("uorqui-company", companyId);
        await refresh(companyId || "");
        setView("home");
      }}
      onCreated={async (companyId) => {
        localStorage.setItem("uorqui-company", companyId);
        await refresh(companyId);
        setPlanOfferReason({
          kind: "company_created",
          message: "Sua empresa foi criada no plano Free. Você pode continuar grátis ou ativar o Premium agora."
        });
        setView("plans");
      }}
    />
  );

  const unread = data.notifications.filter((n) => !n.read).length;
  const companyName = data.company?.name || "Uorqui";
  const pageTitle: Record<View, string> = {
    home: "Início", communities: "Comunidades", search: "Buscar", admin: "Administrar", profile: "Perfil", notifications: "Notificações", companies: "Empresas", plans: "Planos", superadmin: "Superadmin"
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

  const openPlans = (
    kind: "company_created" | "limit" | "manual" = "manual",
    message = ""
  ) => {
    setPlanOfferReason({ kind, message });
    setView("plans");
  };

  const changeCompany = async (id: string, nextView: View = "home") => {
    localStorage.setItem("uorqui-company", id);
    setSelectedCompanyId(id);
    setSelectedCommunityId("");
    setLastCreatedPost(null);
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
      if (notification.data?.openComments === "true") params.set("comments", "1");
      else params.delete("comments");
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
    params.delete("comments");
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
        lastCreatedPost={lastCreatedPost}
        selectedCommunityId={selectedCommunityId}
        onSelectCommunity={setSelectedCommunityId}
        onBack={() => setSelectedCommunityId("")}
        openMembersRequested={manageCommunityMembersId === selectedCommunityId}
        onMembersOpened={() => setManageCommunityMembersId("")}
        onComposeCommunity={(communityId) => openComposer({ scope: "community", communityId })}
        refresh={() => refresh()}
        showToast={showToast}
        onUpgradeRequired={(message) => openPlans("limit", message)}
      />
    );
    if (view === "search") return <SearchPage data={data} initialQuery={searchSeed} refresh={() => refresh()} showToast={showToast} />;
    if (view === "admin") return <AdminPage
      data={data}
      onCompanyChange={(id) => changeCompany(id, "admin")}
      onManageCommunity={(communityId) => {
        setManageCommunityMembersId(communityId);
        openCommunity(communityId);
      }}
      refresh={() => refresh()}
      showToast={showToast}
      onUpgradeRequired={(message) => openPlans("limit", message)}
    />;
    if (view === "notifications") return <NotificationsPage
      data={data}
      refresh={() => refresh()}
      showToast={showToast}
      onOpenPost={openPostFromNotification}
      onOpenAdmin={(companyId) => changeCompany(companyId, "admin")}
      onOpenCommunity={async (companyId, communityId) => {
        if (companyId && companyId !== selectedCompanyId) await changeCompany(companyId, "communities");
        setSelectedCommunityId(communityId);
        setView("communities");
      }}
    />;
    if (view === "companies") return <CompaniesPage
      data={data}
      onSelectCompany={(id) => changeCompany(id, "home")}
      onCompanyLeft={async (leftCompanyId, nextCompanyId) => {
        if (leftCompanyId === selectedCompanyId) {
          if (nextCompanyId) localStorage.setItem("uorqui-company", nextCompanyId);
          else localStorage.removeItem("uorqui-company");
          setSelectedCompanyId(nextCompanyId);
          setSelectedCommunityId("");
          setLastCreatedPost(null);
          await refresh(nextCompanyId);
          return;
        }
        await refresh(selectedCompanyId);
      }}
      onOpenPlans={() => openPlans("manual")}
      showToast={showToast}
    />;
    if (view === "plans") return <PlansPage
      data={data}
      reason={planOfferReason}
      onCompanyChange={(id) => changeCompany(id, "plans")}
      refresh={() => refresh()}
      showToast={showToast}
    />;
    return <ProfilePage
      data={data}
      refresh={() => refresh()}
      showToast={showToast}
      onOpenSuperadmin={() => navigate("superadmin")}
      onCompanyCreated={async (companyId) => {
        setPlanOfferReason({
          kind: "company_created",
          message: "Sua nova empresa começou no Free. Veja a diferença para o Premium."
        });
        await changeCompany(companyId, "plans");
      }}
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
              <NavButton active={view === "plans"} icon={<Crown />} label="Planos" onClick={() => openPlans("manual")} />
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
                {!!data.company && (
                  <button className={`icon-btn mobile-plan-button ${view === "plans" ? "active" : ""}`} onClick={() => openPlans("manual")} aria-label="Planos">
                    <Crown size={21} />
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
          {!!data.company && (
            <button className="side-card side-plan-card" onClick={() => openPlans("manual")}>
              <span className={`plan-pill ${data.company.effectivePlan === "premium" ? "premium" : "free"}`}>
                {data.company.effectivePlan === "premium" ? <><Crown size={12} /> Premium</> : "Free"}
              </span>
              <strong>Plano da empresa</strong>
              <small>{data.company.effectivePlan === "premium" ? "Premium ativo" : "Ver Free e Premium"}</small>
            </button>
          )}
          <section className="side-card">
            <strong>Suas comunidades</strong>
            {data.communities.slice(0, 5).map((c) => (
              <button className="mini-community" key={c.id} onClick={() => openCommunity(c.id)}>
                <span>{c.name.slice(0, 2).toUpperCase()}</span><div><b>{c.name}</b><small>{c.description || "Comunidade privada"}</small></div>
              </button>
            ))}
            {!data.communities.length && <small>Você ainda não participa de comunidades.</small>}
          </section>
          <section className="side-card compact"><strong>Uorqui 1.2.15</strong><small>Conversas de trabalho que não se perdem.</small></section>
        </aside>
      </div>

      {!!data.companies.length && (
        <nav className="mobile-nav">
          <MobileNav active={view === "home" && homeTab !== "world"} icon={<Home />} label="Início" onClick={() => { setHomeTab("for-you"); navigate("home"); }} />
          <MobileNav active={view === "communities"} icon={<Users />} label="Comunidades" onClick={() => navigate("communities")} />
          <button className="mobile-create" onClick={() => setComposerOpen(true)} aria-label="Publicar"><Plus size={26} /></button>
          {data.canAdmin
            ? <MobileNav active={view === "admin"} icon={<Settings />} label="Administrar" onClick={() => navigate("admin")} />
            : <span className="mobile-nav-spacer" aria-hidden="true" />}
          <MobileNav active={view === "profile"} icon={<UserRound />} label="Perfil" onClick={() => navigate("profile")} />
        </nav>
      )}

      {user && data.me.uid && pushPermissionPromptOpen && currentPushState() === "default" && (
        <Modal title="Ativar notificações" onClose={postponePushPermission}>
          <div className="push-permission-prompt">
            <div className="push-permission-prompt-icon"><Bell size={28} /></div>
            <h3>Não perca o que importa</h3>
            <p>
              Autorize o Uorqui a enviar notificações de novas publicações relevantes,
              comunicados, respostas, curtidas e confirmações de leitura.
            </p>
            <div className="modal-actions">
              <button className="btn secondary" onClick={postponePushPermission}>Agora não</button>
              <button
                className="btn"
                disabled={pushPermissionBusy}
                onClick={activatePushFromAutomaticPrompt}
              >
                <Bell size={16} />
                {pushPermissionBusy ? "Ativando…" : "Ativar notificações"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {user && data.me.uid && pwaInstall.bannerVisible && !pwaInstall.installed && (
        <aside className="pwa-install-banner" role="status">
          <div className="pwa-install-icon"><img src="/assets/uorqui-icon-192-v1215.png" alt="" /></div>
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
        onDone={(post) => {
          setComposerOpen(false);
          setLastCreatedPost(post);
          setData((current) => {
            if (post.scope === "world") {
              return { ...current, worldPosts: [post, ...current.worldPosts.filter(item => item.id !== post.id)] };
            }
            if (post.companyId === current.selectedCompanyId) {
              return { ...current, posts: [post, ...current.posts.filter(item => item.id !== post.id)] };
            }
            return current;
          });
          void refresh(post.companyId || selectedCompanyId);
        }}
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

function companyRegistrationPayload(form: HTMLFormElement) {
  const fd = new FormData(form);
  return {
    name: String(fd.get("name") || "").trim(),
    cnpj: String(fd.get("cnpj") || "").trim(),
    address: {
      postalCode: String(fd.get("postalCode") || "").trim(),
      street: String(fd.get("street") || "").trim(),
      number: String(fd.get("number") || "").trim(),
      complement: String(fd.get("complement") || "").trim(),
      district: String(fd.get("district") || "").trim(),
      city: String(fd.get("city") || "").trim(),
      state: String(fd.get("state") || "").trim().toUpperCase()
    }
  };
}

function CompanyRegistrationFields() {
  return (
    <>
      <label><span>Nome da empresa</span><input name="name" required maxLength={120} placeholder="Ex.: Minha Empresa" /></label>
      <label><span>CNPJ</span><input name="cnpj" required inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00" /></label>
      <div className="company-address-heading"><strong>Endereço para nota fiscal</strong><small>Todos os campos abaixo, exceto complemento, são obrigatórios.</small></div>
      <div className="company-address-grid">
        <label className="postal-code"><span>CEP</span><input name="postalCode" required inputMode="numeric" maxLength={9} placeholder="00000-000" /></label>
        <label className="street"><span>Logradouro</span><input name="street" required maxLength={160} placeholder="Rua, avenida…" /></label>
        <label><span>Número</span><input name="number" required maxLength={30} /></label>
        <label><span>Complemento</span><input name="complement" maxLength={100} placeholder="Sala, bloco…" /></label>
        <label><span>Bairro</span><input name="district" required maxLength={100} /></label>
        <label><span>Cidade</span><input name="city" required maxLength={100} /></label>
        <label><span>UF</span><input name="state" required minLength={2} maxLength={2} autoCapitalize="characters" placeholder="SP" /></label>
      </div>
    </>
  );
}

function Onboarding({ data, refresh, showToast, onAccepted, onCreated }: {
  data: BootstrapData;
  refresh: () => Promise<void>;
  showToast: (message: string) => void;
  onAccepted: (companyId?: string) => Promise<void>;
  onCreated: (id: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busyInviteId, setBusyInviteId] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [createInstead, setCreateInstead] = useState(false);
  const pendingInvites = data.notifications.filter((item) =>
    item.status === "pending" &&
    (item.type === "company_invite" || item.type === "community_invite") &&
    item.data?.inviteId
  );

  const resendVerification = async () => {
    if (!auth.currentUser || verificationBusy) return;
    setVerificationBusy(true);
    setError("");
    try {
      await sendEmailVerification(auth.currentUser);
      showToast("E-mail de verificação enviado.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setVerificationBusy(false);
    }
  };

  const checkVerification = async () => {
    if (verificationBusy) return;
    setVerificationBusy(true);
    setError("");
    try {
      const verified = await refreshFirebaseSession();
      if (!verified) {
        setError("A confirmação ainda não apareceu no Firebase. Abra o link recebido por e-mail e tente novamente.");
        return;
      }
      showToast("E-mail confirmado. Agora você pode aceitar o convite.");
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setVerificationBusy(false);
    }
  };

  const acceptInvite = async (notification: NotificationItem) => {
    const inviteId = notification.data?.inviteId || "";
    if (!inviteId || busyInviteId) return;
    setBusyInviteId(inviteId);
    setError("");
    try {
      const verified = await refreshFirebaseSession();
      if (!verified) throw new Error("Confirme seu e-mail e toque em “Já confirmei” antes de aceitar.");
      const result = await api<{ companyId?: string }>("/invites/accept", {
        method: "POST",
        body: JSON.stringify({ inviteId })
      });
      showToast("Convite aceito.");
      await onAccepted(result.companyId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyInviteId("");
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const payload = companyRegistrationPayload(event.currentTarget);
    try {
      const result = await api<{ company: { id: string } }>("/companies", { method: "POST", body: JSON.stringify(payload) });
      await onCreated(result.company.id);
    } catch (err) { setError(errorMessage(err)); }
  };

  const showCompanyForm = !pendingInvites.length || createInstead;

  return (
    <div className="onboarding">
      <img src="/assets/uorqui-logo-light.png" alt="Uorqui" />
      <div className="onboarding-card">
        {pendingInvites.length > 0 && (
          <section className="onboarding-invites">
            <Users size={30} />
            <h2>{pendingInvites.length === 1 ? "Você recebeu um convite" : "Você recebeu convites"}</h2>
            <p>Aceite o convite para entrar no Uorqui sem precisar criar outra empresa.</p>

            {!auth.currentUser?.emailVerified && (
              <div className="onboarding-verification">
                <strong>Confirme seu e-mail primeiro</strong>
                <span>Depois de abrir o link do Firebase, volte aqui e toque em “Já confirmei”.</span>
                <div>
                  <button className="btn secondary small" disabled={verificationBusy} onClick={resendVerification}>
                    {verificationBusy ? "Enviando…" : "Enviar verificação"}
                  </button>
                  <button className="btn small" disabled={verificationBusy} onClick={checkVerification}>
                    {verificationBusy ? "Verificando…" : "Já confirmei"}
                  </button>
                </div>
              </div>
            )}

            <div className="onboarding-invite-list">
              {pendingInvites.map((notification) => {
                const inviteId = notification.data?.inviteId || "";
                return (
                  <article className="onboarding-invite" key={notification.id || inviteId}>
                    <div>
                      <strong>{notification.title}</strong>
                      <span>{notification.body}</span>
                    </div>
                    <button className="btn small" disabled={!!busyInviteId} onClick={() => acceptInvite(notification)}>
                      <Check size={16} />
                      {busyInviteId === inviteId ? "Aceitando…" : "Aceitar convite"}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {showCompanyForm && (
          <section className="onboarding-company-form">
            <Building2 size={30} />
            <h2>Comece sua empresa no Uorqui</h2>
            <p>Para criar sua empresa agora, informe os dados fiscais usados na nota.</p>
            <form onSubmit={submit}>
              <CompanyRegistrationFields />
              <button className="btn">Criar empresa</button>
            </form>
          </section>
        )}

        {pendingInvites.length > 0 && !createInstead && (
          <button className="text-button onboarding-create-instead" onClick={() => { setError(""); setCreateInstead(true); }}>
            Criar uma empresa em vez disso
          </button>
        )}
        {error && <div className="form-error onboarding-error">{error}</div>}
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
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(() => new Set());
  const [postOverrides, setPostOverrides] = useState<Record<string, Post>>({});
  const posts = useMemo(() => {
    let source: Post[];
    if (tab === "world") source = data.worldPosts;
    else if (tab === "announcement") source = data.posts.filter((p) => p.type === "announcement");
    else if (tab === "recent") source = [...data.posts].sort((a, b) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0));
    else source = data.posts;
    return source.filter((post) => !hiddenPostIds.has(post.id)).map((post) => postOverrides[post.id] || post);
  }, [data, tab, hiddenPostIds, postOverrides]);

  const like = async (post: Post) => {
    try {
      const result = await api<{ liked: boolean; reactionCount: number }>(`/posts/${post.id}/reaction`, { method: "POST" });
      void refresh();
      return result;
    } catch (err) {
      showToast(errorMessage(err));
      throw err;
    }
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

    if (adminDeletingAnother) {
      setPostOverrides((current) => ({ ...current, [post.id]: optimisticTombstone(post) }));
    } else {
      setHiddenPostIds((current) => new Set(current).add(post.id));
    }

    try {
      const result = await api<{ tombstone?: boolean; post?: Post }>(`/posts/${post.id}`, { method: "DELETE" });
      if (result.post) setPostOverrides((current) => ({ ...current, [post.id]: result.post! }));
      showToast(result.tombstone ? "Conteúdo removido pela administração." : "Publicação excluída.");
      void refresh();
    } catch (err) {
      setHiddenPostIds((current) => { const next = new Set(current); next.delete(post.id); return next; });
      setPostOverrides((current) => { const next = { ...current }; delete next[post.id]; return next; });
      showToast(errorMessage(err));
    }
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
    try {
      const result = await api<{ liked: boolean; reactionCount: number }>(`/posts/${post.id}/reaction`, { method: "POST" });
      void reload();
      return result;
    } catch (error) {
      showToast(errorMessage(error));
      throw error;
    }
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
      showToast(result.tombstone ? "Conteúdo removido pela administração." : "Publicação excluída.");
      if (result.tombstone) void reload();
      else onBack();
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
        initialCommentsOpen={new URLSearchParams(location.search).get("comments") === "1"}
        onChanged={reload}
        showToast={showToast}
      />
    </section>
  );
}

function CommunitiesPage({
  data, lastCreatedPost, selectedCommunityId, onSelectCommunity, onBack, openMembersRequested, onMembersOpened,
  onComposeCommunity, refresh, showToast, onUpgradeRequired
}: {
  data: BootstrapData;
  lastCreatedPost: Post | null;
  selectedCommunityId: string;
  onSelectCommunity: (id: string) => void;
  onBack: () => void;
  openMembersRequested: boolean;
  onMembersOpened: () => void;
  onComposeCommunity: (id: string) => void;
  refresh: () => Promise<void>;
  showToast: (m: string) => void;
  onUpgradeRequired: (message: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [communityPosts, setCommunityPosts] = useState<Post[]>([]);
  const [communityMembers, setCommunityMembers] = useState<CommunityMember[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberAction, setMemberAction] = useState<{ uid: string; kind: "add" | "remove" } | null>(null);
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
    setMemberSearch("");
    setMemberAction(null);

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

  useEffect(() => {
    if (!openMembersRequested || !selectedCommunityId) return;
    setMembersPage(true);
    if (!membersLoaded) void loadCommunityMembers(selectedCommunityId);
    onMembersOpened();
    // Deve executar somente quando a tela Administrar solicitar a gestão dos membros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMembersRequested, selectedCommunityId]);

  useEffect(() => {
    if (
      !lastCreatedPost ||
      lastCreatedPost.scope !== "community" ||
      lastCreatedPost.communityId !== selectedCommunityId
    ) return;
    setCommunityPosts((current) => [
      lastCreatedPost,
      ...current.filter(post => post.id !== lastCreatedPost.id)
    ]);
  }, [lastCreatedPost, selectedCommunityId]);

  const openMembers = () => {
    setMembersPage(true);
    if (selectedCommunityId && !membersLoaded) void loadCommunityMembers(selectedCommunityId);
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    try {
      const result = await api<{ community: Community }>(`/companies/${data.selectedCompanyId}/communities`, {
        method: "POST", body: JSON.stringify({
          name: fd.get("name"),
          description: fd.get("description"),
          visibility: fd.get("visibility")
        })
      });
      setCreateOpen(false);
      showToast("Comunidade criada.");
      await refresh();
      onSelectCommunity(result.community.id);
    } catch (err) {
      if (isPlanLimitError(err)) {
        setCreateOpen(false);
        onUpgradeRequired(errorMessage(err));
        return;
      }
      showToast(errorMessage(err));
    }
  };

  const like = async (post: Post) => {
    try {
      const result = await api<{ liked: boolean; reactionCount: number }>(`/posts/${post.id}/reaction`, { method: "POST" });
      if (selectedCommunityId) void loadCommunityPosts(selectedCommunityId);
      return result;
    } catch (err) {
      showToast(errorMessage(err));
      throw err;
    }
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

    const previousPosts = communityPosts;
    setCommunityPosts((current) => adminDeletingAnother
      ? current.map((item) => item.id === post.id ? optimisticTombstone(item) : item)
      : current.filter((item) => item.id !== post.id));

    try {
      const result = await api<{ tombstone?: boolean; post?: Post }>(`/posts/${post.id}`, { method: "DELETE" });
      if (result.post) {
        setCommunityPosts((current) => current.map((item) => item.id === post.id ? result.post! : item));
      }
      showToast(result.tombstone ? "Conteúdo removido pela administração." : "Publicação excluída.");
      void refresh();
    } catch (err) {
      setCommunityPosts(previousPosts);
      showToast(errorMessage(err));
    }
  };

  const addMember = async (uid: string) => {
    if (!selectedCommunityId || !uid || memberAction) return;
    const companyMember = data.members.find((member) => member.uid === uid);
    if (!companyMember) return;

    const previousMembers = communityMembers;
    const optimisticMember: CommunityMember = {
      uid,
      displayName: companyMember.displayName,
      email: companyMember.email,
      companyRole: companyMember.role === "owner" || companyMember.role === "admin" ? companyMember.role : "member",
      communityRole: "member"
    };

    setMemberAction({ uid, kind: "add" });
    setCommunityMembers((current) => [...current.filter((member) => member.uid !== uid), optimisticMember]
      .sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "", "pt-BR")));
    setMembersLoaded(true);

    try {
      await api(`/communities/${selectedCommunityId}/members`, { method: "POST", body: JSON.stringify({ uid }) });
      showToast("Usuário adicionado à comunidade.");
      void refresh();
    } catch (err) {
      setCommunityMembers(previousMembers);
      showToast(errorMessage(err));
    } finally {
      setMemberAction(null);
    }
  };

  const removeMember = async (member: CommunityMember) => {
    if (!selectedCommunityId || memberAction) return;
    if (!confirm(`Remover ${member.displayName || member.email || "este usuário"} desta comunidade?`)) return;

    const previousMembers = communityMembers;
    setMemberAction({ uid: member.uid, kind: "remove" });
    setCommunityMembers((current) => current.filter((item) => item.uid !== member.uid));

    try {
      await api(`/communities/${selectedCommunityId}/members/${member.uid}`, { method: "DELETE" });
      showToast("Usuário removido da comunidade.");
      void refresh();
    } catch (err) {
      setCommunityMembers(previousMembers);
      showToast(errorMessage(err));
    } finally {
      setMemberAction(null);
    }
  };

  if (selectedCommunityId && selectedCommunity) {
    const communityMemberMap = new Map(communityMembers.map((member) => [member.uid, member]));
    const memberCount = membersLoaded ? communityMembers.length : Number(selectedCommunity.memberCount || 0);
    const memberSearchValue = memberSearch.trim().toLocaleLowerCase("pt-BR");
    const listedMembers = (data.canAdmin ? data.members : communityMembers).filter((member) => {
      if (!memberSearchValue) return true;
      return `${member.displayName || ""} ${member.email || ""}`.toLocaleLowerCase("pt-BR").includes(memberSearchValue);
    });

    if (membersPage) {
      return (
        <section className="page-section">
          <div className="members-page-head">
            <button className="back-button" onClick={() => setMembersPage(false)}><ArrowLeft size={18} /> {selectedCommunity.name}</button>
            <div><h2>{data.canAdmin ? "Gerenciar membros" : "Membros"} de {selectedCommunity.name}</h2><p>{memberCount} {memberCount === 1 ? "membro" : "membros"} nesta comunidade.</p></div>
          </div>

          {data.canAdmin && (
            <section className="panel-card members-manage-card">
              <div className="members-manage-copy">
                <strong>Gerenciar participantes</strong>
                <small>{memberCount} de {data.members.length} colaboradores participam. Adicione ou remova cada pessoa diretamente na lista.</small>
              </div>
              <label className="community-member-search">
                <Search size={16} />
                <input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Buscar por nome ou e-mail" />
                {memberSearch && <button type="button" onClick={() => setMemberSearch("")} aria-label="Limpar busca"><X size={14} /></button>}
              </label>
            </section>
          )}

          <section className="panel-card members-page-list">
            {membersLoading && <div className="loading-line">Carregando membros…</div>}
            {!membersLoading && listedMembers.map((companyMember) => {
              const membership = communityMemberMap.get(companyMember.uid);
              const isMember = Boolean(membership);
              const displayName = membership?.displayName || companyMember.displayName || companyMember.email || "Usuário";
              const email = membership?.email || companyMember.email;
              const role = membership?.companyRole || ("role" in companyMember ? companyMember.role : undefined);
              const busy = memberAction?.uid === companyMember.uid;
              const actionKind = busy ? memberAction!.kind : (isMember ? "remove" : "add");

              return (
                <div className={`community-member-row members-page-row ${isMember ? "is-member" : "not-member"}`} key={companyMember.uid}>
                  <Avatar name={displayName} mediaId={membership?.avatarMediaId} size={42} />
                  <div className="ellipsis"><strong>{displayName}</strong><small>{email}</small></div>
                  <span className="private-pill">{role === "owner" ? "Proprietário" : role === "admin" ? "Administrador" : "Usuário"}</span>
                  {data.canAdmin && (
                    <div className="member-community-controls">
                      <span className={`community-membership-status ${isMember ? "active" : "inactive"}`}>
                        {isMember ? <Check size={13} /> : <X size={13} />}
                        {isMember ? "Na comunidade" : "Não participa"}
                      </span>
                      <button
                        className={`member-community-action ${actionKind}`}
                        disabled={Boolean(memberAction)}
                        onClick={() => isMember ? removeMember(membership!) : addMember(companyMember.uid)}
                      >
                        {actionKind === "remove" ? <UserMinus size={15} /> : <UserPlus size={15} />}
                        {busy ? (actionKind === "remove" ? "Removendo…" : "Adicionando…") : (isMember ? "Remover" : "Adicionar")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {!membersLoading && membersLoaded && !listedMembers.length && (
              <p className="muted">{memberSearch ? "Nenhum colaborador encontrado para esta busca." : "Nenhum usuário nesta comunidade."}</p>
            )}
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
              <p>{selectedCommunity.description || (communityVisibility(selectedCommunity) === "public" ? "Comunidade pública da empresa." : "Comunidade privada da empresa.")}</p>
              <span className={`community-visibility-badge ${communityVisibility(selectedCommunity)}`}>
                {communityVisibility(selectedCommunity) === "public" ? <Globe2 size={13} /> : <ShieldCheck size={13} />}
                {communityVisibility(selectedCommunity) === "public" ? "Pública na empresa" : "Privada"}
              </span>
            </div>
          </div>
          <div className="community-detail-actions">
            <button className="btn secondary community-manage-members" onClick={openMembers}>
              <Users size={17} />
              {data.canAdmin ? "Gerenciar membros" : "Ver membros"}
              <span>{memberCount}</span>
            </button>
            <button className="btn" onClick={() => onComposeCommunity(selectedCommunity.id)}><Plus size={17} /> Publicar aqui</button>
          </div>
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
            <div>
              <strong>{community.name}</strong>
              <p>{community.description || (communityVisibility(community) === "public" ? "Comunidade pública da empresa." : "Comunidade privada da empresa.")}</p>
              <div className="community-card-meta">
                <small className={`community-visibility-badge ${communityVisibility(community)}`}>
                  {communityVisibility(community) === "public" ? <Globe2 size={12} /> : <ShieldCheck size={12} />}
                  {communityVisibility(community) === "public" ? "Pública" : "Privada"}
                </small>
                <small className="community-member-count">{community.memberCount || 0} {(community.memberCount || 0) === 1 ? "membro" : "membros"}</small>
              </div>
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
          <label>
            <span>Visibilidade</span>
            <select name="visibility" defaultValue="private">
              <option value="private">Privada — somente participantes e administradores</option>
              <option value="public">Pública — pesquisável por toda a empresa</option>
            </select>
          </label>
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
    try {
      const result = await api<{ liked: boolean; reactionCount: number }>(`/posts/${post.id}/reaction`, { method: "POST" });
      void refresh();
      return result;
    } catch (err) {
      showToast(errorMessage(err));
      throw err;
    }
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

    const previousPosts = posts;
    setPosts((current) => adminDeletingAnother
      ? current.map((item) => item.id === post.id ? optimisticTombstone(item) : item)
      : current.filter((item) => item.id !== post.id));

    try {
      const result = await api<{ tombstone?: boolean; post?: Post }>(`/posts/${post.id}`, { method: "DELETE" });
      if (result.post) setPosts((current) => current.map((item) => item.id === post.id ? result.post! : item));
      showToast(result.tombstone ? "Conteúdo removido pela administração." : "Publicação excluída.");
      void refresh();
    } catch (err) {
      setPosts(previousPosts);
      showToast(errorMessage(err));
    }
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

type SentInvite = {
  id: string;
  type: "company" | "community";
  email: string;
  communityName?: string;
  status: "pending" | "accepted" | "expired" | string;
  emailSent?: boolean;
  emailStatus?: "sent" | "failed" | "not_configured" | "unknown" | string;
  emailError?: string;
  createdAt?: string;
  expiresAt?: string;
  acceptedAt?: string;
  canceledAt?: string;
  lastResentAt?: string;
  resendCount?: number;
};

function AdminPage({ data, onCompanyChange, onManageCommunity, refresh, showToast, onUpgradeRequired }: {
  data: BootstrapData;
  onCompanyChange: (companyId: string) => Promise<void>;
  onManageCommunity: (communityId: string) => void;
  refresh: () => Promise<void>;
  showToast: (m: string) => void;
  onUpgradeRequired: (message: string) => void;
}) {
  const [inviteLink, setInviteLink] = useState("");
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteActionBusy, setInviteActionBusy] = useState("");
  const [communityVisibilityBusy, setCommunityVisibilityBusy] = useState("");
  const [communityVisibilityOverrides, setCommunityVisibilityOverrides] = useState<Record<string, "public" | "private">>({});
  const manageableCompanies = data.companies.filter((company) => company.role === "owner" || company.role === "admin");

  useEffect(() => {
    setCommunityVisibilityOverrides({});
    setCommunityVisibilityBusy("");
  }, [data.selectedCompanyId]);

  const loadSentInvites = async () => {
    if (!data.canAdmin || !data.selectedCompanyId) return;
    setInvitesLoading(true);
    try {
      const result = await api<{ invites: SentInvite[] }>(`/companies/${data.selectedCompanyId}/invites`);
      setSentInvites(result.invites);
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setInvitesLoading(false);
    }
  };

  useEffect(() => {
    void loadSentInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.selectedCompanyId, data.canAdmin]);

  if (!data.canAdmin) return <Empty title="Acesso restrito" text="Somente administradores podem acessar esta área." />;

  const inviteCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") || "");
    try {
      const result = await api<{ inviteUrl?: string; emailSent?: boolean; emailStatus?: string; emailError?: string }>(`/companies/${data.selectedCompanyId}/invites`, {
        method: "POST", body: JSON.stringify({ email })
      });
      form.reset();
      if (result.emailSent) showToast("Convite enviado por e-mail.");
      else {
        setInviteLink(result.inviteUrl || "");
        showToast(result.emailStatus === "not_configured"
          ? "Convite criado. O e-mail não está configurado; use o link."
          : result.emailStatus === "failed"
            ? "Convite criado, mas o e-mail falhou. Use o link."
            : "Convite criado. Use o link para compartilhar.");
      }
      await Promise.all([refresh(), loadSentInvites()]);
    } catch (err) {
      if (isPlanLimitError(err)) {
        onUpgradeRequired(errorMessage(err));
        return;
      }
      showToast(errorMessage(err));
    }
  };

  const cancelInvite = async (invite: SentInvite) => {
    if (!confirm(`Cancelar o convite enviado para ${invite.email || "este usuário"}?`)) return;
    const actionKey = `cancel:${invite.id}`;
    setInviteActionBusy(actionKey);
    try {
      await api(`/companies/${data.selectedCompanyId}/invites/${encodeURIComponent(invite.id)}`, {
        method: "DELETE"
      });
      showToast("Convite cancelado.");
      await loadSentInvites();
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setInviteActionBusy("");
    }
  };

  const resendInvite = async (invite: SentInvite) => {
    const actionKey = `resend:${invite.id}`;
    setInviteActionBusy(actionKey);
    try {
      const result = await api<{ inviteUrl?: string; emailSent?: boolean; emailStatus?: string; emailError?: string }>(
        `/companies/${data.selectedCompanyId}/invites/${encodeURIComponent(invite.id)}/resend`,
        { method: "POST" }
      );
      if (invite.type === "community") {
        showToast("Convite interno reenviado.");
      } else if (result.emailSent) {
        showToast("Convite reenviado por e-mail.");
      } else {
        setInviteLink(result.inviteUrl || "");
        showToast(result.emailStatus === "not_configured"
          ? "Convite renovado. O e-mail não está configurado; use o link."
          : result.emailStatus === "failed"
            ? "Convite renovado, mas o e-mail falhou. Use o link."
            : "Convite renovado. Use o novo link.");
      }
      await loadSentInvites();
    } catch (err) {
      if (isPlanLimitError(err)) {
        onUpgradeRequired(errorMessage(err));
        return;
      }
      showToast(errorMessage(err));
    } finally {
      setInviteActionBusy("");
    }
  };

  const createCommunity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    try {
      await api(`/companies/${data.selectedCompanyId}/communities`, {
        method: "POST",
        body: JSON.stringify({
          name: fd.get("name"),
          description: fd.get("description"),
          visibility: fd.get("visibility")
        })
      });
      form.reset(); showToast("Comunidade criada."); await refresh();
    } catch (err) {
      if (isPlanLimitError(err)) {
        onUpgradeRequired(errorMessage(err));
        return;
      }
      showToast(errorMessage(err));
    }
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

  const changeCommunityVisibility = async (community: Community, visibility: "public" | "private") => {
    if (communityVisibilityBusy) return;
    const previous = communityVisibilityOverrides[community.id];
    setCommunityVisibilityOverrides((current) => ({ ...current, [community.id]: visibility }));
    setCommunityVisibilityBusy(community.id);
    try {
      await api(`/communities/${community.id}`, {
        method: "PATCH",
        body: JSON.stringify({ visibility })
      });
      showToast(visibility === "public"
        ? "Comunidade pública para os colaboradores desta empresa."
        : "Comunidade privada para participantes e administradores.");
      await refresh();
    } catch (err) {
      setCommunityVisibilityOverrides((current) => {
        const next = { ...current };
        if (previous) next[community.id] = previous;
        else delete next[community.id];
        return next;
      });
      showToast(errorMessage(err));
    } finally {
      setCommunityVisibilityBusy("");
    }
  };

  const removeCommunity = async (community: Community) => {
    if (!confirm(`Excluir a comunidade "${community.name}"?`)) return;
    try { await api(`/communities/${community.id}`, { method: "DELETE" }); showToast("Comunidade excluída."); await refresh(); }
    catch (err) { showToast(errorMessage(err)); }
  };

  return (
    <section className="page-section">
      <div className="page-heading admin-page-heading">
        <div><h2>Administrar</h2><p>Escolha a empresa e gerencie colaboradores e comunidades públicas ou privadas.</p></div>
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
        <button className="btn secondary small admin-plan-button" onClick={() => onUpgradeRequired("")}>
          <Crown size={15} /> {data.company?.effectivePlan === "premium" ? "Premium" : "Ver planos"}
        </button>
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
          <label>
            <span>Visibilidade</span>
            <select name="visibility" defaultValue="private">
              <option value="private">Privada — somente participantes e administradores</option>
              <option value="public">Pública — pesquisável por toda a empresa</option>
            </select>
          </label>
          <button className="btn small"><CirclePlus size={16} /> Criar</button>
        </form>
      </div>

      <section className="panel-card sent-invites-card">
        <div className="sent-invites-head">
          <div><h3>Convites enviados</h3><small>Acompanhe os convites da empresa e das comunidades.</small></div>
          <button className="btn secondary small" disabled={invitesLoading} onClick={() => loadSentInvites()}>
            {invitesLoading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
        {invitesLoading && !sentInvites.length && <div className="loading-line">Carregando convites…</div>}
        <div className="sent-invite-list">
          {sentInvites.map((invite) => {
            const statusLabel = invite.status === "accepted"
              ? "Aceito"
              : invite.status === "expired"
                ? "Expirado"
                : invite.status === "canceled"
                  ? "Cancelado"
                  : "Pendente";
            const dateLabel = invite.createdAt ? new Date(invite.createdAt).toLocaleDateString("pt-BR") : "";
            const canCancel = invite.status === "pending";
            const canResend = invite.status !== "accepted";
            const deliveryLabel = invite.type === "community"
              ? "Convite interno"
              : invite.emailStatus === "sent" || invite.emailSent
                ? "E-mail enviado"
                : invite.emailStatus === "not_configured"
                  ? "E-mail não configurado"
                  : invite.emailStatus === "failed"
                    ? "Falha no e-mail"
                    : "Link gerado";
            return (
              <div className="sent-invite-row" key={invite.id}>
                <div className="ellipsis">
                  <strong>{invite.email || "Usuário convidado"}</strong>
                  <small>{invite.type === "community" ? invite.communityName || "Comunidade" : "Empresa"} · enviado em {dateLabel}</small>
                </div>
                <span className={`invite-status ${invite.status}`}>{statusLabel}</span>
                <small
                  className={`invite-delivery ${invite.emailStatus || "unknown"}`}
                  title={invite.emailError || undefined}
                >
                  {deliveryLabel}
                </small>
                <div className="sent-invite-actions">
                  {canResend && (
                    <button
                      className="btn secondary small"
                      disabled={!!inviteActionBusy}
                      onClick={() => resendInvite(invite)}
                      title="Reenviar convite"
                    >
                      <Send size={14} />
                      {inviteActionBusy === `resend:${invite.id}` ? "Reenviando…" : "Reenviar"}
                    </button>
                  )}
                  {canCancel && (
                    <button
                      className="btn secondary small invite-cancel-button"
                      disabled={!!inviteActionBusy}
                      onClick={() => cancelInvite(invite)}
                      title="Cancelar convite"
                    >
                      <X size={14} />
                      {inviteActionBusy === `cancel:${invite.id}` ? "Cancelando…" : "Cancelar"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!invitesLoading && !sentInvites.length && <p className="muted">Nenhum convite enviado ainda.</p>}
        </div>
      </section>

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
            </div>
          ))}
        </div>
      </section>

      <section className="panel-card">
        <h3>Comunidades da empresa</h3>
        <p className="admin-community-help">Abra uma comunidade para visualizar todos os colaboradores e adicionar ou remover participantes.</p>
        {data.allCompanyCommunities.map((community) => (
          <div className="admin-community-row" key={community.id}>
            <div className="community-avatar">{community.name.slice(0, 2).toUpperCase()}</div>
            <div className="ellipsis"><strong>{community.name}</strong><small>{community.description || (communityVisibility(community) === "public" ? "Comunidade pública" : "Comunidade privada")} · {community.memberCount || 0} membros</small></div>
            <select
              className={`community-visibility-select ${communityVisibilityOverrides[community.id] || communityVisibility(community)}`}
              value={communityVisibilityOverrides[community.id] || communityVisibility(community)}
              disabled={Boolean(communityVisibilityBusy)}
              onChange={(event) => changeCommunityVisibility(community, event.target.value as "public" | "private")}
              aria-label={`Visibilidade de ${community.name}`}
            >
              <option value="private">Privada</option>
              <option value="public">Pública</option>
            </select>
            <div className="admin-community-actions">
              <button className="btn secondary small" onClick={() => onManageCommunity(community.id)}><Users size={14} /> Gerenciar membros</button>
              <button className="btn danger small" onClick={() => removeCommunity(community)}>Excluir</button>
            </div>
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
  cnpj?: string;
  address?: {
    postalCode: string;
    street: string;
    number: string;
    complement?: string;
    district: string;
    city: string;
    state: string;
  };
  administrators?: Array<{ uid: string; displayName?: string; email?: string }>;
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

function PlansPage({
  data,
  reason,
  onCompanyChange,
  refresh,
  showToast
}: {
  data: BootstrapData;
  reason: PlanOfferReason;
  onCompanyChange: (companyId: string) => Promise<void>;
  refresh: () => Promise<void>;
  showToast: (message: string) => void;
}) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [billingBusy, setBillingBusy] = useState(false);

  const load = async () => {
    setLoadingPlans(true);
    try {
      const result = await api<{ companies: CompanySummary[] }>("/companies/summary");
      setCompanies(result.companies);
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setLoadingPlans(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.selectedCompanyId, data.companies.length]);

  const company =
    companies.find(item => item.id === data.selectedCompanyId) ||
    companies[0] ||
    null;

  const premium = company?.effectivePlan === "premium";
  const owner = company?.role === "owner";
  const pending = company?.billingStatus === "pending";
  const price = company?.premiumMonthlyPrice || 49.9;

  const currency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(value);

  const upgrade = async () => {
    if (!company || billingBusy || !owner) return;
    setBillingBusy(true);
    try {
      const result = await api<{ url: string }>(
        `/companies/${company.id}/billing/checkout`,
        { method: "POST" }
      );
      window.location.href = result.url;
    } catch (error) {
      showToast(errorMessage(error));
      setBillingBusy(false);
    }
  };

  const offerTitle =
    reason?.kind === "company_created"
      ? "Sua empresa já está pronta"
      : reason?.kind === "limit"
        ? "Sua empresa chegou ao limite do Free"
        : "";

  return (
    <section className="page-section plans-page">
      <div className="page-heading plans-heading">
        <div>
          <h2>Planos</h2>
          <p>O plano pertence à empresa. Sua mesma conta pode ter empresas Free e Premium.</p>
        </div>

        {data.companies.length > 1 && (
          <label className="plans-company-picker">
            <span>Empresa</span>
            <select
              value={data.selectedCompanyId}
              onChange={(event) => onCompanyChange(event.target.value)}
            >
              {data.companies.map(item => (
                <option value={item.id} key={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {offerTitle && company && (
        <section className={`plan-offer-banner ${reason?.kind === "limit" ? "limit" : ""}`}>
          <div className="plan-offer-icon"><Crown size={21} /></div>
          <div>
            <strong>{offerTitle}</strong>
            <p>
              {reason?.message ||
                (reason?.kind === "company_created"
                  ? "Você pode usar o Uorqui Free normalmente e ativar o Premium quando quiser."
                  : "Ative o Premium para continuar expandindo esta empresa.")}
            </p>
          </div>
        </section>
      )}

      {loadingPlans && <div className="loading-line">Carregando planos…</div>}

      {!loadingPlans && company && (
        <>
          <section className="plans-company-summary">
            <div className="company-profile-mark">{company.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <strong>{company.name}</strong>
              <small>
                {company.memberCount || 0} membros · {company.communityCount || 0} comunidades
              </small>
            </div>
            <span className={`plan-pill ${premium ? "premium" : "free"}`}>
              {premium ? <><Crown size={12} /> Premium</> : "Free"}
            </span>
          </section>

          <div className="plans-grid">
            <article className={`plan-card ${!premium ? "current" : ""}`}>
              <div className="plan-card-head">
                <div>
                  <span className="plan-eyebrow">Para começar</span>
                  <h3>Free</h3>
                </div>
                <strong className="plan-price">R$ 0<small>/mês</small></strong>
              </div>

              <p className="plan-description">
                A empresa usa todas as funcionalidades essenciais do Uorqui dentro dos limites do plano.
              </p>

              <ul className="plan-features">
                <li><Check size={16} /> Até 5 pessoas na empresa</li>
                <li><Check size={16} /> Até 2 comunidades</li>
                <li><Check size={16} /> Posts, perguntas e conclusões</li>
                <li><Check size={16} /> Enquetes e eventos</li>
                <li><Check size={16} /> Comunicados com confirmação de leitura</li>
                <li><Check size={16} /> Busca, notificações push e Mundo</li>
              </ul>

              {!premium
                ? <button className="btn secondary plan-current-button" disabled>Plano atual</button>
                : <span className="plan-secondary-note">Disponível se o Premium for encerrado.</span>}
            </article>

            <article className={`plan-card premium-card ${premium ? "current" : ""}`}>
              <div className="premium-ribbon">Uorqui para empresas</div>
              <div className="plan-card-head">
                <div>
                  <span className="plan-eyebrow"><Crown size={13} /> Crescimento</span>
                  <h3>Premium</h3>
                </div>
                <strong className="plan-price">{currency(price)}<small>/mês por empresa</small></strong>
              </div>

              <p className="plan-description">
                Tudo do Free, sem os limites de 5 pessoas e 2 comunidades.
              </p>

              <ul className="plan-features">
                <li><Check size={16} /> Mais de 5 pessoas</li>
                <li><Check size={16} /> Mais de 2 comunidades</li>
                <li><Check size={16} /> Todas as funcionalidades do Free</li>
                <li><Check size={16} /> Plano independente das outras empresas da sua conta</li>
                <li><Check size={16} /> Pagamento mensal via Pix ou cartão</li>
              </ul>

              {premium ? (
                <div className="premium-active-box">
                  <Crown size={18} />
                  <div>
                    <strong>Premium ativo</strong>
                    <small>
                      {company.premiumSource === "manual" && company.manualPremiumUntil
                        ? `Cortesia até ${new Date(company.manualPremiumUntil).toLocaleDateString("pt-BR")}.`
                        : company.premiumUntil
                          ? `Acesso confirmado até ${new Date(company.premiumUntil).toLocaleDateString("pt-BR")}.`
                          : "Assinatura ativa."}
                    </small>
                  </div>
                </div>
              ) : owner ? (
                <>
                  <button
                    className="btn plan-upgrade-button"
                    disabled={!company.billingReady || billingBusy}
                    onClick={upgrade}
                  >
                    <CreditCard size={17} />
                    {billingBusy
                      ? "Abrindo checkout…"
                      : pending
                        ? "Continuar pagamento"
                        : "Ativar Premium"}
                  </button>
                  <small className="plan-checkout-note">
                    Pix ou cartão. O Premium só é ativado após a confirmação do pagamento.
                  </small>
                  {!company.billingReady && (
                    <div className="billing-warning">
                      A cobrança ainda não está habilitada para esta instalação do Uorqui.
                    </div>
                  )}
                </>
              ) : (
                <div className="plan-owner-note">
                  O Premium é contratado pelo proprietário desta empresa.
                </div>
              )}
            </article>
          </div>

          <p className="plans-footnote">
            O Free não é um teste: ele pode ser usado sem prazo. O Premium entra quando a empresa precisa crescer além dos limites do Free.
          </p>
        </>
      )}
    </section>
  );
}

function CompaniesPage({
  data,
  onSelectCompany,
  onCompanyLeft,
  onOpenPlans,
  showToast
}: {
  data: BootstrapData;
  onSelectCompany: (companyId: string) => Promise<void>;
  onCompanyLeft: (leftCompanyId: string, nextCompanyId: string) => Promise<void>;
  onOpenPlans: () => void;
  showToast: (message: string) => void;
}) {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [billingBusy, setBillingBusy] = useState("");
  const [leaveTarget, setLeaveTarget] = useState<CompanySummary | null>(null);
  const [newOwnerUid, setNewOwnerUid] = useState("");
  const [leaveError, setLeaveError] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);

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

  const leaveCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!leaveTarget || leaveBusy) return;
    if (leaveTarget.role === "owner" && !newOwnerUid) {
      setLeaveError("Escolha o administrador que receberá a propriedade.");
      return;
    }

    setLeaveBusy(true);
    setLeaveError("");
    try {
      const result = await api<{ nextCompanyId?: string }>(`/companies/${leaveTarget.id}/leave`, {
        method: "POST",
        body: JSON.stringify({ newOwnerUid: leaveTarget.role === "owner" ? newOwnerUid : "" })
      });
      const leftCompanyId = leaveTarget.id;
      setLeaveTarget(null);
      setNewOwnerUid("");
      showToast(leaveTarget.role === "owner" ? "Propriedade transferida e saída concluída." : "Você saiu da empresa.");
      await onCompanyLeft(leftCompanyId, result.nextCompanyId || "");
    } catch (error) {
      setLeaveError(errorMessage(error));
    } finally {
      setLeaveBusy(false);
    }
  };

  return (
    <section className="page-section companies-page">
      <div className="page-heading">
        <div><h2>Empresas</h2><p>Cada empresa possui seu próprio plano. A mesma conta pode participar de empresas Free e Premium.</p></div>
        <button className="btn secondary small" onClick={onOpenPlans}><Crown size={15} /> Ver planos</button>
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
                    <small>{company.role === "owner" ? "Proprietário" : company.role === "admin" ? "Administrador" : "Usuário"}{company.cnpj ? ` · CNPJ ${company.cnpj}` : ""}</small>
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
                <div className="company-membership-actions">
                  <button className="btn danger small" onClick={() => {
                    setLeaveError("");
                    setNewOwnerUid("");
                    setLeaveTarget(company);
                  }}>
                    <LogOut size={15} /> Sair da empresa
                  </button>
                </div>
              </section>
            );
          })}
          {!companies.length && <Empty title="Nenhuma empresa" text="As empresas das quais você participa aparecerão aqui." />}
        </div>
      )}

      {leaveTarget && (
        <Modal title={`Sair de ${leaveTarget.name}`} onClose={() => !leaveBusy && setLeaveTarget(null)}>
          <form className="stack-form" onSubmit={leaveCompany}>
            {leaveTarget.role === "owner" ? (
              <>
                <div className="danger-notice">
                  <strong>Transfira a propriedade antes de sair.</strong>
                  <p>Você perderá o acesso à empresa e o administrador escolhido passará a ser o proprietário.</p>
                </div>
                {!!leaveTarget.administrators?.length ? (
                  <label>
                    <span>Novo proprietário</span>
                    <select required value={newOwnerUid} onChange={(event) => setNewOwnerUid(event.target.value)}>
                      <option value="">Escolha um administrador…</option>
                      {leaveTarget.administrators.map((administrator) => (
                        <option value={administrator.uid} key={administrator.uid}>
                          {administrator.displayName || administrator.email}{administrator.displayName && administrator.email ? ` · ${administrator.email}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="form-error">Promova outro colaborador a Administrador na tela Administrar antes de sair.</div>
                )}
              </>
            ) : (
              <div className="danger-notice">
                <strong>Confirmar saída da empresa?</strong>
                <p>Você perderá o acesso às publicações e comunidades de {leaveTarget.name}.</p>
              </div>
            )}
            {leaveError && <div className="form-error">{leaveError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn secondary" disabled={leaveBusy} onClick={() => setLeaveTarget(null)}>Cancelar</button>
              <button className="btn danger-confirm" disabled={leaveBusy || (leaveTarget.role === "owner" && (!leaveTarget.administrators?.length || !newOwnerUid))}>
                {leaveBusy ? "Saindo…" : leaveTarget.role === "owner" ? "Transferir e sair" : "Sair da empresa"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function ProfilePage({
  data, refresh, showToast, onOpenSuperadmin, onCompanyCreated,
  pwaInstalled, pwaMode, pwaInstalling, onInstallPwa
}: {
  data: BootstrapData;
  refresh: () => Promise<void>;
  showToast: (m: string) => void;
  onOpenSuperadmin: () => void;
  onCompanyCreated: (companyId: string) => Promise<void>;
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
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");

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

  const resendVerification = async () => {
    if (!auth.currentUser || verificationBusy) return;
    setVerificationBusy(true);
    try {
      await sendEmailVerification(auth.currentUser);
      showToast("E-mail de verificação enviado.");
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setVerificationBusy(false);
    }
  };

  const confirmVerification = async () => {
    if (verificationBusy) return;
    setVerificationBusy(true);
    try {
      const verified = await refreshFirebaseSession();
      if (!verified) throw new Error("A confirmação ainda não apareceu no Firebase. Tente novamente após abrir o link do e-mail.");
      showToast("E-mail confirmado.");
      await refresh();
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setVerificationBusy(false);
    }
  };

  const deleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (deleteAccountBusy) return;
    setDeleteAccountError("");
    const fd = new FormData(event.currentTarget);
    const password = String(fd.get("password") || "");
    const confirmation = String(fd.get("confirmation") || "").trim().toUpperCase();
    if (confirmation !== "EXCLUIR") {
      setDeleteAccountError("Digite EXCLUIR para confirmar.");
      return;
    }

    setDeleteAccountBusy(true);
    try {
      const current = auth.currentUser;
      if (!current?.email) throw new Error("Faça login novamente para apagar sua conta.");
      await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, password));
      await current.getIdToken(true);
      await api("/me", {
        method: "DELETE",
        body: JSON.stringify({ confirmation })
      });
      await deleteFirebaseUser(current);

      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith("uorqui-")) localStorage.removeItem(key);
      }
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (key?.startsWith("uorqui-")) sessionStorage.removeItem(key);
      }
      location.replace("/");
    } catch (err) {
      setDeleteAccountError(errorMessage(err));
      setDeleteAccountBusy(false);
    }
  };

  const createCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCompanyError("");
    const form = event.currentTarget;
    const payload = companyRegistrationPayload(form);
    if (!payload.name) return;
    try {
      const result = await api<{ company: { id: string } }>("/companies", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      form.reset();
      setCreateCompanyOpen(false);
      showToast("Empresa criada.");
      await onCompanyCreated(result.company.id);
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
          {!auth.currentUser?.emailVerified && (
            <div className="profile-verification-actions">
              <button className="btn secondary small" disabled={verificationBusy} onClick={resendVerification}>
                {verificationBusy ? "Aguarde…" : "Enviar verificação"}
              </button>
              <button className="btn small" disabled={verificationBusy} onClick={confirmVerification}>
                {verificationBusy ? "Verificando…" : "Já confirmei"}
              </button>
            </div>
          )}
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

      <section className="panel-card delete-account-card">
        <div className="delete-account-copy">
          <Trash2 size={16} />
          <div>
            <strong>Apagar minha conta</strong>
            <p>Remove seus acessos e dados pessoais. Publicações e respostas permanecem identificadas apenas como “Conta removida”.</p>
          </div>
        </div>
        <button className="delete-account-trigger" onClick={() => { setDeleteAccountError(""); setDeleteAccountOpen(true); }}>
          Apagar conta
        </button>
      </section>

      {createCompanyOpen && (
        <Modal title="Criar empresa" onClose={() => setCreateCompanyOpen(false)}>
          <form className="stack-form" onSubmit={createCompany}>
            <CompanyRegistrationFields />
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

      {deleteAccountOpen && (
        <Modal title="Apagar minha conta" onClose={() => !deleteAccountBusy && setDeleteAccountOpen(false)}>
          <form className="stack-form" onSubmit={deleteAccount}>
            <div className="danger-notice">
              <strong>Esta ação é permanente.</strong>
              <p>Se você ainda for proprietário de uma empresa, transfira a propriedade ou exclua a empresa antes. Seus textos permanecerão anonimizados para não quebrar as conversas.</p>
            </div>
            <label>
              <span>Senha atual</span>
              <input name="password" type="password" required autoComplete="current-password" />
            </label>
            <label>
              <span>Digite <strong>EXCLUIR</strong> para confirmar</span>
              <input name="confirmation" required autoComplete="off" />
            </label>
            {deleteAccountError && <div className="form-error">{deleteAccountError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn secondary" disabled={deleteAccountBusy} onClick={() => setDeleteAccountOpen(false)}>Cancelar</button>
              <button className="btn danger-confirm" disabled={deleteAccountBusy}>
                {deleteAccountBusy ? "Apagando…" : "Apagar conta definitivamente"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function NotificationsPage({ data, refresh, showToast, onOpenPost, onOpenAdmin, onOpenCommunity }: {
  data: BootstrapData;
  refresh: () => Promise<void>;
  showToast: (m: string) => void;
  onOpenPost: (notification: NotificationItem) => Promise<void>;
  onOpenAdmin: (companyId: string) => Promise<void>;
  onOpenCommunity: (companyId: string, communityId: string) => Promise<void>;
}) {
  const [pushState, setPushState] = useState<PushState>(() => currentPushState());
  const [pushBusy, setPushBusy] = useState(false);
  const [acceptingInviteId, setAcceptingInviteId] = useState("");

  const accept = async (notification: NotificationItem) => {
    const inviteId = notification.data?.inviteId;
    if (!inviteId || acceptingInviteId) return;
    setAcceptingInviteId(inviteId);
    try {
      const verified = await refreshFirebaseSession();
      if (!verified) {
        throw new Error("Confirme seu e-mail e toque em aceitar novamente.");
      }
      const result = await api<{ companyId?: string }>("/invites/accept", {
        method: "POST", body: JSON.stringify({ inviteId })
      });
      if (result.companyId) localStorage.setItem("uorqui-company", result.companyId);
      showToast("Convite aceito.");
      await refresh();
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setAcceptingInviteId("");
    }
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

    if (notification.data?.targetView === "admin" && notification.data.companyId) {
      await onOpenAdmin(notification.data.companyId);
      return;
    }

    if (notification.data?.targetView === "community" && notification.data.companyId && notification.data.communityId) {
      await onOpenCommunity(notification.data.companyId, notification.data.communityId);
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
              {item.type.includes("community") || item.type.includes("invite") || item.type === "company_member_joined"
                ? <Users size={19} />
                : item.type === "announcement" || item.type === "read_required"
                  ? <Megaphone size={19} />
                  : item.type === "post_follow_up"
                    ? <MessageSquareText size={19} />
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
                <button
                  className="btn small"
                  disabled={!!acceptingInviteId}
                  onClick={(event) => { event.stopPropagation(); accept(item); }}
                >
                  <Check size={16} />
                  {acceptingInviteId === item.data?.inviteId ? "Aceitando…" : "Aceitar"}
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

              {item.data?.targetView === "admin" && item.data.companyId && (
                <button
                  className="text-button notification-open-post"
                  onClick={(event) => {
                    event.stopPropagation();
                    void openNotification(item);
                  }}
                >
                  Gerenciar comunidades
                </button>
              )}

              {item.data?.targetView === "community" && item.data.communityId && (
                <button
                  className="text-button notification-open-post"
                  onClick={(event) => {
                    event.stopPropagation();
                    void openNotification(item);
                  }}
                >
                  Abrir comunidade
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
  onDone: (post: Post) => Promise<void> | void;
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

      const result = await api<{ post: Post }>("/posts", {
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
      await onDone(result.post);
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
