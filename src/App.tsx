import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowLeft, BarChart3, Bell, BriefcaseBusiness, Building2, CalendarDays, Camera, Check, ChevronDown,
  ChevronRight, CirclePlus, CreditCard, Crown, Download, FileQuestion, Globe2, Home,
  Compass, Images, KeyRound, LogOut, Mail, MapPin, Megaphone, MessageSquareText, Mic, Plus, Search, Send, Settings, Share2, Video,
  ShieldCheck, Square, Trash2, UserMinus, UserPlus, UserRound, Users, X
} from "lucide-react";
import {
  createUserWithEmailAndPassword, deleteUser as deleteFirebaseUser, EmailAuthProvider, onAuthStateChanged,
  reauthenticateWithCredential, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, updatePassword, updateProfile, type User
} from "firebase/auth";
import { auth } from "./lib/firebase";
import { ApiError, api, cacheMediaBlobUrl, mediaBlobUrl, prefetchPostMedia } from "./lib/api";
import { connectRealtime } from "./lib/realtime";
import { currentPushState, enablePushNotifications, setupForegroundPush, syncPushRegistration, unregisterPushBeforeLogout, type PushState } from "./lib/push";
import type {
  BootstrapData, Community, CommunityMember, CommunityTopic, Company, HomeTab, JobOpening, NotificationItem, Post, View
} from "./types";
import { Avatar } from "./components/Avatar";
import { AvatarCropModal } from "./components/AvatarCropModal";
import { Modal } from "./components/Modal";
import { PostCard } from "./components/PostCard";
import "./styles.css";

const emptyData: BootstrapData = {
  me: { uid: "" }, companies: [], selectedCompanyId: "", company: null, role: null,
  canAdmin: false, isSuperadmin: false, communities: [], communityMap: {}, posts: [], worldPosts: [],
  notifications: [], allCompanyCommunities: [], members: []
};

function normalizeBootstrapData(value: Partial<BootstrapData> | null | undefined): BootstrapData {
  const next = value || {};
  return {
    ...emptyData,
    ...next,
    me: { ...emptyData.me, ...(next.me || {}) },
    companies: Array.isArray(next.companies) ? next.companies : [],
    communities: Array.isArray(next.communities) ? next.communities : [],
    communityMap: next.communityMap && typeof next.communityMap === "object" ? next.communityMap : {},
    posts: Array.isArray(next.posts) ? next.posts : [],
    worldPosts: Array.isArray(next.worldPosts) ? next.worldPosts : [],
    notifications: Array.isArray(next.notifications) ? next.notifications : [],
    allCompanyCommunities: Array.isArray(next.allCompanyCommunities) ? next.allCompanyCommunities : [],
    members: Array.isArray(next.members) ? next.members : []
  } as BootstrapData;
}

function validateBootstrapData(value: BootstrapData) {
  if (!value.me?.uid) throw new Error("bootstrap: usuário autenticado sem uid");
  for (const key of ["companies","communities","posts","worldPosts","notifications","allCompanyCommunities","members"] as const) {
    if (!Array.isArray(value[key])) throw new Error(`bootstrap: campo ${key} inválido`);
  }
  if (!value.communityMap || typeof value.communityMap !== "object") throw new Error("bootstrap: communityMap inválido");
}


function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Não foi possível concluir esta ação.";
}

function CommunityImage({ community, large = false }: { community: Community; large?: boolean }) {
  const [src,setSrc]=useState("");
  useEffect(()=>{
    let active=true;
    if(!community.avatarMediaId){ setSrc(""); return; }
    mediaBlobUrl(community.avatarMediaId).then(url=>{if(active)setSrc(url);}).catch(()=>{if(active)setSrc("");});
    return()=>{active=false;};
  },[community.avatarMediaId]);
  return src
    ? <img className={`community-avatar community-avatar-image ${large ? "large" : ""}`} src={src} alt="" />
    : <div className={`community-avatar ${large ? "large" : ""}`}>{community.name.slice(0,2).toUpperCase()}</div>;
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

const LAST_VIEW_KEY = "uorqui-last-view-v1";
const LAST_HOME_TAB_KEY = "uorqui-last-home-tab-v1";
const LAST_COMMUNITY_KEY = "uorqui-last-community-v1";
const LAST_SCROLL_KEY = "uorqui-last-scroll-v1";

function storedView(): View {
  try {
    const value = sessionStorage.getItem(LAST_VIEW_KEY) as View | null;
    const allowed: View[] = ["home","communities","search","profile","messages","notifications","plans","superadmin"];
    return value && allowed.includes(value) ? value : "home";
  } catch {
    return "home";
  }
}

function storedHomeTab(): HomeTab {
  try {
    const value = sessionStorage.getItem(LAST_HOME_TAB_KEY) as HomeTab | null;
    return value && ["for-you","communities","world","recent"].includes(value) ? value : "for-you";
  } catch {
    return "for-you";
  }
}

function storedCommunityId() {
  try { return sessionStorage.getItem(LAST_COMMUNITY_KEY) || ""; }
  catch { return ""; }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState<BootstrapData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState("");
  const [view, setView] = useState<View>(() => storedView());
  const [homeTab, setHomeTab] = useState<HomeTab>(() => storedHomeTab());
  const [composerOpen, setComposerOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedCommunityId, setSelectedCommunityId] = useState(() => storedCommunityId());
  const [externalCommunity, setExternalCommunity] = useState<Community | null>(null);
  const [manageCommunityMembersId, setManageCommunityMembersId] = useState("");
  const [composerTarget, setComposerTarget] = useState<{ scope?: "company" | "community" | "world"; communityId?: string; topicId?: string }>({});
  const [headerSearch, setHeaderSearch] = useState("");
  const [headerHidden, setHeaderHidden] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(64);
  const lastScrollYRef = useRef(0);
  const [searchSeed, setSearchSeed] = useState("");
  const [sharedPost, setSharedPost] = useState<Post | null>(null);
  const [sharedPostLoading, setSharedPostLoading] = useState(false);
  const sharedPostReturnScrollRef = useRef(0);
  const [pushPermissionPromptOpen, setPushPermissionPromptOpen] = useState(false);
  const [pushPermissionBusy, setPushPermissionBusy] = useState(false);
  const [planOfferReason, setPlanOfferReason] = useState<PlanOfferReason>(null);
  const [lastCreatedPost, setLastCreatedPost] = useState<Post | null>(null);
  const [realtimeRevision, setRealtimeRevision] = useState(0);
  const [, setAuthRevision] = useState(0);

  useEffect(() => {
    try {
      sessionStorage.setItem(LAST_VIEW_KEY, view);
      sessionStorage.setItem(LAST_HOME_TAB_KEY, homeTab);
      if (selectedCommunityId) sessionStorage.setItem(LAST_COMMUNITY_KEY, selectedCommunityId);
      else sessionStorage.removeItem(LAST_COMMUNITY_KEY);
    } catch {}
  }, [view, homeTab, selectedCommunityId]);

  useEffect(() => {
    const saveScroll = () => {
      try {
        sessionStorage.setItem(LAST_SCROLL_KEY, String(Math.max(0, window.scrollY || 0)));
      } catch {}
    };
    window.addEventListener("scroll", saveScroll, { passive: true });
    window.addEventListener("pagehide", saveScroll);
    return () => {
      window.removeEventListener("scroll", saveScroll);
      window.removeEventListener("pagehide", saveScroll);
    };
  }, []);

  useEffect(() => {
    if (!authReady || !user || loading) return;
    const timer = window.setTimeout(() => {
      try {
        const y = Number(sessionStorage.getItem(LAST_SCROLL_KEY) || "0");
        if (Number.isFinite(y) && y > 0) window.scrollTo({ top: y, behavior: "auto" });
      } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authReady, user?.uid, loading]);

  useEffect(() => {
    const scroller = document.scrollingElement || document.documentElement;
    let lastY = Math.max(0, scroller.scrollTop || window.scrollY);
    let touchY = 0;
    let hidden = false;

    const node = () => document.querySelector<HTMLElement>(".topbar");
    const apply = (hide: boolean, immediate = false) => {
      if (hidden === hide && node()) return;
      hidden = hide;
      const header = node();
      if (header) {
        header.style.transition = immediate ? "none" : "";
        header.classList.toggle("scroll-hidden", hide);
        if (immediate) requestAnimationFrame(() => {
          if (header.isConnected) header.style.transition = "";
        });
      }
      setHeaderHidden(hide);
    };

    const measure = () => {
      const header = node();
      if (header) setHeaderHeight(Math.max(56, Math.ceil(header.getBoundingClientRect().height)));
    };

    measure();
    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(measure)
      : null;
    const initialHeader = node();
    if (initialHeader && observer) observer.observe(initialHeader);

    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY || 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      const nextY = event.touches[0]?.clientY ?? touchY;
      const delta = nextY - touchY;

      // Primeiro movimento do dedo para baixo = usuário quer voltar para cima.
      // Mostra o header imediatamente e flutuando no viewport.
      if (delta > 0.5) apply(false, true);
      else if (delta < -0.5 && lastY > 44) apply(true);

      touchY = nextY;
    };

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) apply(false, true);
      else if (event.deltaY > 0 && lastY > 44) apply(true);
    };

    const onScroll = () => {
      const current = Math.max(0, scroller.scrollTop || window.scrollY);
      if (current <= 8 || current < lastY) apply(false, true);
      else if (current > lastY && current > 44) apply(true);
      lastY = current;
      lastScrollYRef.current = current;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true, capture: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure, { passive: true });

    return () => {
      observer?.disconnect();
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, [user?.uid, view]);

  useEffect(() => {
    const goFeed = () => {
      setView("home");
      setHomeTab("for-you");
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("uorqui:go-feed", goFeed);
    return () => window.removeEventListener("uorqui:go-feed", goFeed);
  }, []);

  useEffect(() => {
    const openMessages = (event: Event) => {
      const detail = (event as CustomEvent<{ targetUid?: string; postId?: string }>).detail || {};
      if (detail.targetUid) sessionStorage.setItem("uorqui-message-target", detail.targetUid);
      if (detail.postId) sessionStorage.setItem("uorqui-message-post", detail.postId);
      setView("messages");
    };
    window.addEventListener("uorqui:open-messages", openMessages);
    return () => window.removeEventListener("uorqui:open-messages", openMessages);
  }, []);

  useEffect(() => onAuthStateChanged(auth, (next) => {
    setUser(next);
    setAuthReady(true);
    if (!next) {
      setData(emptyData);
      setLoading(false);
    }
  }), []);

  const refresh = async (companyId = selectedCompanyId, silent = false) => {
    if (!auth.currentUser) return;
    const firstLoad = !data.me.uid;
    if (!silent && firstLoad) {
      setLoading(true);
      setFatal("");
    }
    try {
      const suffix = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const raw = await api<BootstrapData>(`/bootstrap${suffix}`);
      const next = normalizeBootstrapData(raw);
      validateBootstrapData(next);

      // Smoke test autenticado do caminho que abre logo após o login.
      // Falhas aqui são transformadas em erro visível, nunca em tela branca.
      try {
        const social = await Promise.race([
          api<{ followingCount?: number; posts?: Post[]; communities?: Community[] }>("/social/feed"),
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("social/feed: timeout após 8s")), 8000))
        ]);
        if (social && social.posts !== undefined && !Array.isArray(social.posts)) {
          throw new Error("social/feed: posts inválido");
        }
        if (social && social.communities !== undefined && !Array.isArray(social.communities)) {
          throw new Error("social/feed: communities inválido");
        }
      } catch (smokeError) {
        console.error("Uorqui post-login smoke test", smokeError);
        // O feed social tem fallback no bootstrap. Não bloqueamos o app, mas registramos o erro.
      }

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
      if (!silent) setFatal(errorMessage(error));
    } finally {
      if (!silent && firstLoad) setLoading(false);
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
    if (params.get("discover") !== "1") return;
    setSearchSeed("");
    setView("search");
  }, []);

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
    if (!user || !data.me.uid) return;
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
  }, [user?.uid, data.me.uid]);

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
        if (["company_member_joined", "company_member_removed", "community_added", "community_removed", "job_posted"].includes(type)) {
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
    if (!user || !data.me.uid) return;

    return connectRealtime(selectedCompanyId, () => {
      setRealtimeRevision((current) => current + 1);
      void refresh(selectedCompanyId, true);

      const postId = sharedPost?.id;
      if (postId) {
        void api<{ post: Post }>(`/posts/${encodeURIComponent(postId)}`)
          .then((result) => setSharedPost(result.post))
          .catch(() => {});
      }
    });
    // A conexão só muda com o usuário, a empresa ativa ou a publicação aberta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, data.me.uid, selectedCompanyId, sharedPost?.id]);

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

  const unread = data.notifications.filter((n) => !n.read).length;
  const companyName = data.company?.name || "Uorqui";
  const pageTitle: Record<View, string> = {
    home: "Rede", communities: "Comunidades", search: "Descobrir", jobs: "Rede", admin: "Administrar", "company-data": "Dados da empresa", profile: "Perfil", messages: "Mensagens", notifications: "Notificações", companies: "Empresas", plans: "Planos", superadmin: "Superadmin"
  };

  const navigate = (next: View) => {
    if (sharedPost) {
      setSharedPost(null);
      const params = new URLSearchParams(location.search);
      params.delete("post");
      params.delete("company");
      params.delete("comments");
      params.delete("comment");
      const query = params.toString();
      history.replaceState({}, "", `${location.pathname}${query ? `?${query}` : ""}`);
    }
    setView(next);
  };

  const openComposer = (target: { scope?: "company" | "community" | "world"; communityId?: string; topicId?: string } = {}) => {
    setComposerTarget(target);
    setComposerOpen(true);
  };

  const openCommunity = async (communityId: string) => {
    if (!communityId) return;
    setSelectedCommunityId(communityId);
    setView("communities");
    const known = data.allCompanyCommunities.find(item => item.id === communityId)
      || data.communities.find(item => item.id === communityId);
    if (known) {
      setExternalCommunity(null);
      return;
    }
    try {
      const result = await api<{ community: Community; posts: Post[] }>(`/communities/${encodeURIComponent(communityId)}/posts`);
      setExternalCommunity(result.community);
    } catch (error) {
      showToast(errorMessage(error));
    }
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

  const markNotificationReadLocal = (notificationId: string) => {
    setData((current) => ({
      ...current,
      notifications: current.notifications.map((notification) =>
        notification.id === notificationId ? { ...notification, read: true } : notification
      )
    }));
  };

  const deleteNotificationLocal = (notificationId: string) => {
    setData((current) => ({
      ...current,
      notifications: current.notifications.filter((notification) => notification.id !== notificationId)
    }));
  };

  const openPostThread = async (postId: string, companyId = "", commentId = "") => {
    if (!postId) return;

    try {
      sharedPostReturnScrollRef.current = window.scrollY;

      if (companyId && companyId !== selectedCompanyId) {
        localStorage.setItem("uorqui-company", companyId);
        setSelectedCompanyId(companyId);
        await refresh(companyId, true);
      }

      const params = new URLSearchParams(location.search);
      params.set("post", postId);
      params.set("comments", "1");
      if (companyId) params.set("company", companyId);
      else params.delete("company");
      if (commentId) params.set("comment", commentId);
      else params.delete("comment");

      history.pushState({}, "", `${location.pathname}?${params.toString()}`);

      setSharedPostLoading(true);
      const result = await api<{ post: Post }>(`/posts/${encodeURIComponent(postId)}`);
      await Promise.race([
        prefetchPostMedia([result.post], 5),
        new Promise<void>((resolve) => window.setTimeout(resolve, 180))
      ]);
      setSharedPost(result.post);
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setSharedPostLoading(false);
    }
  };

  useEffect(() => {
    const handleOpenCommunity = (event: Event) => {
      const detail = (event as CustomEvent<{ communityId?: string }>).detail || {};
      if (detail.communityId) void openCommunity(detail.communityId);
    };
    window.addEventListener("uorqui:open-community", handleOpenCommunity);
    return () => window.removeEventListener("uorqui:open-community", handleOpenCommunity);
  }, [data.communities, data.allCompanyCommunities]);

  useEffect(() => {
    const handleOpenPostThread = (event: Event) => {
      const detail = (event as CustomEvent<{ postId?: string; companyId?: string; commentId?: string }>).detail || {};
      if (!detail.postId) return;
      void openPostThread(detail.postId, detail.companyId || "", detail.commentId || "");
    };

    window.addEventListener("uorqui:open-post-thread", handleOpenPostThread);
    return () => window.removeEventListener("uorqui:open-post-thread", handleOpenPostThread);
  }, [selectedCompanyId]);

  // Todos os Hooks precisam ser executados antes de qualquer retorno condicional.
  // Isso evita React #310 na transição login -> aplicação.
  if (!authReady) return <Boot />;
  if (!user) return <AuthScreen />;
  if (loading && !data.me.uid) return <Boot />;
  if (fatal) return <ErrorScreen message={fatal} onRetry={() => refresh()} onLogout={() => unregisterPushBeforeLogout()} />;
  // O Uorqui social não exige mais empresa para entrar.

  const openPostFromNotification = async (notification: NotificationItem) => {
    const postId = notification.data?.postId || "";
    const companyId = notification.data?.companyId || "";
    const commentId = notification.data?.commentId || "";
    if (!postId) return;
    await openPostThread(postId, companyId, commentId);
  };

  const closeSharedPost = () => {
    setSharedPost(null);

    if (history.length > 1) {
      history.back();
    } else {
      const params = new URLSearchParams(location.search);
      params.delete("post");
      params.delete("company");
      params.delete("comments");
      params.delete("comment");
      const query = params.toString();
      history.replaceState({}, "", `${location.pathname}${query ? `?${query}` : ""}`);
    }

    window.setTimeout(() => {
      window.scrollTo({ top: sharedPostReturnScrollRef.current, behavior: "auto" });
    }, 0);
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
    if (data.isSuperadmin && view === "superadmin") {
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
        onCompose={() => openComposer({ scope: "world" })}
        onOpenCommunity={openCommunity}
        onOpenPeople={() => {
          const params = new URLSearchParams(location.search);
          params.set("people", "1");
          history.pushState({}, "", `${location.pathname}?${params.toString()}`);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
        showToast={showToast}
      />
    );
    if (view === "communities") return (
      <CommunitiesPage
        data={data}
        realtimeRevision={realtimeRevision}
        lastCreatedPost={lastCreatedPost}
        selectedCommunityId={selectedCommunityId}
        externalCommunity={externalCommunity}
        onSelectCommunity={(communityId) => { setExternalCommunity(null); setSelectedCommunityId(communityId); }}
        onBack={() => setSelectedCommunityId("")}
        openMembersRequested={manageCommunityMembersId === selectedCommunityId}
        onMembersOpened={() => setManageCommunityMembersId("")}
        onComposeCommunity={(communityId, topicId) => openComposer({ scope: "community", communityId, topicId })}
        refresh={() => refresh()}
        showToast={showToast}
        onUpgradeRequired={(message) => openPlans("limit", message)}
      />
    );
    if (view === "search") return <SearchPage data={data} initialQuery={searchSeed} refresh={() => refresh()} showToast={showToast} />;
    if (view === "jobs") return <HomePage
      data={data}
      tab={homeTab}
      setTab={setHomeTab}
      refresh={() => refresh()}
      onCompose={() => openComposer({ scope: "world" })}
      onOpenCommunity={openCommunity}
      onOpenPeople={() => {
        const params = new URLSearchParams(location.search);
        params.set("people", "1");
        history.pushState({}, "", `${location.pathname}?${params.toString()}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }}
      showToast={showToast}
    />;
    if (view === "admin") return <AdminPage
      data={data}
      onCompanyChange={(id) => changeCompany(id, "admin")}
      onEditCompany={() => navigate("company-data")}
      onManageCommunity={(communityId) => {
        setManageCommunityMembersId(communityId);
        openCommunity(communityId);
      }}
      refresh={() => refresh()}
      showToast={showToast}
      onUpgradeRequired={(message) => openPlans("limit", message)}
    />;
    if (view === "company-data") return <CompanyDataPage
      data={data}
      onBack={() => navigate("admin")}
      refresh={() => refresh()}
      showToast={showToast}
    />;
    if (view === "notifications") return <NotificationsPage
      data={data}
      refresh={() => refresh()}
      showToast={showToast}
      onOpenPost={openPostFromNotification}
      onNotificationRead={markNotificationReadLocal}
      onNotificationDeleted={deleteNotificationLocal}
      onOpenAdmin={(companyId) => changeCompany(companyId, "admin")}
      onOpenJobs={async () => {
        setHomeTab("for-you");
        setView("home");
      }}
      onOpenCommunity={async (companyId, communityId) => {
        if (companyId && companyId !== selectedCompanyId) await changeCompany(companyId, "communities");
        setSelectedCommunityId(communityId);
        setView("communities");
      }}
      onOpenMessages={(uid) => {
        if (uid) sessionStorage.setItem("uorqui-message-target", uid);
        setView("messages");
      }}
    />;
    if (view === "companies") return <CompaniesPage
      data={data}
      realtimeRevision={realtimeRevision}
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
    if (view === "messages") return <MessagesPage me={data.me} showToast={showToast} />;
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
      onOpenCommunities={() => navigate("communities")}
    />;
  };

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <button className="brand-button" onClick={() => navigate("home")}>
            <img src="/assets/uorqui-wordmark.png" alt="Uorqui" />
          </button>

          <nav className="side-nav">
            <NavButton active={view === "home" || view === "jobs"} icon={<Home />} label="Rede" onClick={() => navigate("home")} />
            <NavButton active={view === "communities"} icon={<Users />} label="Comunidades" onClick={() => navigate("communities")} />
            <NavButton active={view === "search"} icon={<Compass />} label="Descobrir" onClick={() => navigate("search")} />
            <NavButton active={view === "messages"} icon={<MessageSquareText />} label="Mensagens" onClick={() => navigate("messages")} />
            <NavButton active={view === "plans"} icon={<Crown />} label="Criadores" onClick={() => openPlans("manual")} />
            {data.isSuperadmin && <NavButton active={view === "superadmin"} icon={<ShieldCheck />} label="Superadmin" onClick={() => navigate("superadmin")} />}
            <NavButton active={view === "profile"} icon={<UserRound />} label="Perfil" onClick={() => navigate("profile")} />
          </nav>

          <button className="btn publish-main" onClick={() => openComposer({ scope: "world" })}><Plus size={19} /> Publicar</button>

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
          <header className={`topbar ${headerHidden ? "scroll-hidden" : ""}`}>
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
                <button className={`icon-btn header-profile-button ${view === "profile" ? "active" : ""}`} onClick={() => navigate("profile")} aria-label="Perfil">
                  <UserRound size={21} />
                </button>
                <button className={`icon-btn mobile-plan-button ${view === "plans" ? "active" : ""}`} onClick={() => openPlans("manual")} aria-label="Criadores">
                  <Crown size={21} />
                </button>
              </div>
            </div>
            {view === "home" && (
              <div className="tabs">
                {([
                  ["for-you", "Para você"], ["communities", "Comunidades"], ["world", "Mundo"], ["recent", "Recentes"]
                ] as const).map(([id, label]) => (
                  <button key={id} className={homeTab === id ? "active" : ""} onClick={() => setHomeTab(id)}>{label}</button>
                ))}
              </div>
            )}
          </header>
          <div className="topbar-spacer" style={{ height: headerHeight }} aria-hidden="true" />
          {renderPage()}
        </main>


      </div>

      <nav className="mobile-nav">
        <MobileNav active={view === "home" || view === "jobs"} icon={<Home />} label="Rede" onClick={() => { setHomeTab("for-you"); navigate("home"); }} />
        <MobileNav active={view === "communities"} icon={<Users />} label="Comunidades" onClick={() => navigate("communities")} />
        <button className="mobile-create" onClick={() => openComposer({ scope: "world" })} aria-label="Publicar"><Plus size={26} /></button>
        <MobileNav active={view === "search"} icon={<Compass />} label="Descobrir" onClick={() => { setSearchSeed(""); navigate("search"); }} />
        <MobileNav active={view === "messages"} icon={<MessageSquareText />} label="Mensagens" onClick={() => navigate("messages")} />
      </nav>

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

      {composerOpen && <Composer
        data={data}
        initialScope={composerTarget.scope}
        initialCommunityId={composerTarget.communityId}
        initialTopicId={composerTarget.topicId}
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
        <h1>Encontre pessoas. Crie comunidades.</h1>
        <p>Uma rede social aberta para conversar, compartilhar interesses e construir comunidades.</p>
      </section>
      <section className="auth-card">
        <img className="auth-mobile-logo" src="/assets/uorqui-logo-light.png" alt="Uorqui" />
        <h2>{mode === "login" ? "Entrar" : "Criar sua conta"}</h2>
        <p>{mode === "login" ? "Acesse sua rede e suas comunidades." : "Crie sua conta e encontre sua comunidade."}</p>
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

function CompanyRegistrationFields({ company }: { company?: Pick<Company, "name" | "cnpj" | "address"> }) {
  const address = company?.address;
  return (
    <>
      <label><span>Nome da empresa</span><input name="name" required maxLength={120} defaultValue={company?.name || ""} placeholder="Ex.: Minha Empresa" /></label>
      <label><span>CNPJ</span><input name="cnpj" required inputMode="numeric" maxLength={18} defaultValue={company?.cnpj || ""} placeholder="00.000.000/0000-00" /></label>
      <div className="company-address-heading"><strong>Endereço para nota fiscal</strong><small>Todos os campos abaixo, exceto complemento, são obrigatórios.</small></div>
      <div className="company-address-grid">
        <label className="postal-code"><span>CEP</span><input name="postalCode" required inputMode="numeric" maxLength={9} defaultValue={address?.postalCode || ""} placeholder="00000-000" /></label>
        <label className="street"><span>Logradouro</span><input name="street" required maxLength={160} defaultValue={address?.street || ""} placeholder="Rua, avenida…" /></label>
        <label><span>Número</span><input name="number" required maxLength={30} defaultValue={address?.number || ""} /></label>
        <label><span>Complemento</span><input name="complement" maxLength={100} defaultValue={address?.complement || ""} placeholder="Sala, bloco…" /></label>
        <label><span>Bairro</span><input name="district" required maxLength={100} defaultValue={address?.district || ""} /></label>
        <label><span>Cidade</span><input name="city" required maxLength={100} defaultValue={address?.city || ""} /></label>
        <label><span>UF</span><input name="state" required minLength={2} maxLength={2} autoCapitalize="characters" defaultValue={address?.state || ""} placeholder="SP" /></label>
      </div>
    </>
  );
}

function CompanyDataPage({ data, onBack, refresh, showToast }: {
  data: BootstrapData;
  onBack: () => void;
  refresh: () => Promise<void>;
  showToast: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!data.canAdmin || !data.company) {
    return <Empty title="Acesso restrito" text="Somente proprietários e administradores podem editar os dados da empresa." />;
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`/companies/${encodeURIComponent(data.company!.id)}`, {
        method: "PATCH",
        body: JSON.stringify(companyRegistrationPayload(event.currentTarget))
      });
      await refresh();
      showToast("Dados da empresa atualizados.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-section company-data-page">
      <button className="back-button" onClick={onBack}><ArrowLeft size={18} /> Administrar</button>
      <div className="page-heading">
        <div>
          <h2>Dados da empresa</h2>
          <p>Atualize os dados cadastrais e o endereço usados para faturamento e emissão de nota fiscal.</p>
        </div>
      </div>
      <form className="panel-card stack-form company-data-form" key={data.company.id} onSubmit={submit}>
        <CompanyRegistrationFields company={data.company} />
        <p className="muted company-data-note">O CNPJ precisa ser válido e não pode estar cadastrado em outra empresa do Uorqui.</p>
        {error && <div className="form-error">{error}</div>}
        <div className="company-data-actions">
          <button type="button" className="btn secondary" disabled={busy} onClick={onBack}>Cancelar</button>
          <button className="btn" disabled={busy}>{busy ? "Salvando…" : "Salvar alterações"}</button>
        </div>
      </form>
    </section>
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

function HomePage({ data, tab, setTab, refresh, onCompose, onOpenCommunity, onOpenPeople, showToast }: {
  data: BootstrapData;
  tab: HomeTab;
  setTab: (tab: HomeTab) => void;
  refresh: () => Promise<void> | void;
  onCompose: () => void;
  onOpenCommunity: (communityId: string) => void;
  onOpenPeople: () => void;
  showToast: (m: string) => void;
}) {
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(() => new Set());
  const [postOverrides, setPostOverrides] = useState<Record<string, Post>>({});
  const [socialFeedPosts, setSocialFeedPosts] = useState<Post[]>([]);
  const [socialFollowingCount, setSocialFollowingCount] = useState<number | null>(null);
  const [suggestedCommunities, setSuggestedCommunities] = useState<Community[]>([]);

  const communityPosts = useMemo(
    () => data.posts.filter((post) => post.scope === "community"),
    [data.posts]
  );

  const posts = useMemo(() => {
    const mergeUnique = (items: Post[]) => Array.from(
      new Map(items.map((post) => [post.id, post])).values()
    ).sort((a, b) => +new Date(b.createdAt || 0) - +new Date(a.createdAt || 0));

    let source: Post[];
    if (tab === "communities") source = communityPosts;
    else if (tab === "world") source = data.worldPosts;
    else if (tab === "recent") source = mergeUnique([...data.worldPosts, ...data.posts]);
    else if (socialFollowingCount !== null) {
      source = socialFeedPosts.length
        ? socialFeedPosts
        : mergeUnique([...data.worldPosts, ...communityPosts]);
    } else source = mergeUnique([...communityPosts, ...data.worldPosts]);

    return source
      .filter((post) => !hiddenPostIds.has(post.id))
      .map((post) => postOverrides[post.id] || post);
  }, [communityPosts, data.posts, data.worldPosts, tab, hiddenPostIds, postOverrides, socialFeedPosts, socialFollowingCount]);

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
    } catch (err) {
      showToast(errorMessage(err));
    }
  };

  const remove = async (post: Post) => {
    const adminDeletingAnother = data.canAdmin && post.authorUid !== data.me.uid;
    const message = adminDeletingAnother
      ? "Apagar esta publicação como administrador? O conteúdo será removido e ficará um aviso no lugar."
      : "Excluir sua publicação? Esta ação não pode ser desfeita.";
    if (!confirm(message)) return;

    if (adminDeletingAnother) setPostOverrides((current) => ({ ...current, [post.id]: optimisticTombstone(post) }));
    else setHiddenPostIds((current) => new Set(current).add(post.id));

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



  const loadSocialFeed = async () => {
    try {
      const result = await api<{ followingCount: number; posts: Post[]; communities: Community[] }>("/social/feed");
      setSocialFeedPosts(result.posts || []);
      setSocialFollowingCount(result.followingCount || 0);
      setSuggestedCommunities(result.communities || []);
      void prefetchPostMedia(result.posts || [], 16);
    } catch {
      // O bootstrap continua sendo fallback se a camada social falhar.
    }
  };

  useEffect(() => {
    void loadSocialFeed();
  }, [data.worldPosts.length, data.posts.length]);

  return (
    <div className="social-home social-home-clean">
      <section className="feed social-feed social-feed-clean">
        {tab === "for-you" && socialFollowingCount === 0 && !!suggestedCommunities.length && (
          <div className="feed-community-suggestions">
            <div className="feed-community-suggestions-head">
              <strong>Comunidades abertas para descobrir</strong>
              <button className="text-button" onClick={onOpenPeople}>Encontrar pessoas</button>
            </div>
            <div className="feed-community-suggestions-row">
              {suggestedCommunities.slice(0, 8).map((community) => (
                <button key={community.id} onClick={() => onOpenCommunity(community.id)}>
                  <span>{community.name.slice(0,2).toUpperCase()}</span>
                  <strong>{community.name}</strong>
                  <small>{community.officialUorqui ? "Oficial Uorqui · " : ""}{community.description || "Comunidade aberta"}</small>
                </button>
              ))}
            </div>
          </div>
        )}
        {posts.map((post) => (
          <PostCard
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
          />
        ))}
        {!posts.length && <Empty title="Nada por aqui ainda" text="Novas publicações aparecerão aqui conforme a rede se movimentar." />}
      </section>
    </div>
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
        initialCommentsOpen
        initialCommentId={new URLSearchParams(location.search).get("comment") || ""}
        onChanged={reload}
        showToast={showToast}
      />
    </section>
  );
}

function CommunitiesPage({
  data, realtimeRevision, lastCreatedPost, selectedCommunityId, onSelectCommunity, onBack, openMembersRequested, onMembersOpened,
  onComposeCommunity, refresh, showToast, onUpgradeRequired
}: {
  data: BootstrapData;
  realtimeRevision: number;
  lastCreatedPost: Post | null;
  selectedCommunityId: string;
  externalCommunity: Community | null;
  onSelectCommunity: (id: string) => void;
  onBack: () => void;
  openMembersRequested: boolean;
  onMembersOpened: () => void;
  onComposeCommunity: (id: string, topicId?: string) => void;
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
  const [joinBusyId, setJoinBusyId] = useState("");
  const [joinStatusByCommunity, setJoinStatusByCommunity] = useState<Record<string, string>>({});
  const [topics, setTopics] = useState<CommunityTopic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [topicCreateOpen, setTopicCreateOpen] = useState(false);
  const [topicBusy, setTopicBusy] = useState(false);
  const [communityImageBusy,setCommunityImageBusy]=useState(false);
  const selectedCommunity = data.allCompanyCommunities.find((community) => community.id === selectedCommunityId)
    || data.communities.find((community) => community.id === selectedCommunityId)
    || (externalCommunity?.id === selectedCommunityId ? externalCommunity : undefined);

  const joinedCommunityIds = useMemo(() => new Set(data.communities.map((community) => community.id)), [data.communities]);
  const isJoinedCommunity = (communityId: string) => joinedCommunityIds.has(communityId);

  const joinCommunity = async (community: Community) => {
    if (joinBusyId) return;
    setJoinBusyId(community.id);
    try {
      const result = await api<{ status: string }>(`/communities/${encodeURIComponent(community.id)}/join`, { method: "POST" });
      setJoinStatusByCommunity((current) => ({ ...current, [community.id]: result.status }));
      if (result.status === "joined") {
        showToast(`Você entrou em ${community.name}.`);
        await refresh();
      } else {
        showToast("Solicitação enviada ao dono e aos administradores.");
      }
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setJoinBusyId("");
    }
  };

  const loadCommunityPosts = async (communityId: string) => {
    try {
      const qs = selectedTopicId ? `?topicId=${encodeURIComponent(selectedTopicId)}` : "";
      const result = await api<{ community: Community; posts: Post[] }>(`/communities/${communityId}/posts${qs}`);
      setCommunityPosts(result.posts);
      setDetailLoading(false);
      void prefetchPostMedia(result.posts, 16);
    } catch (err) {
      setDetailLoading(false);
      showToast(errorMessage(err));
    }
  };

  const loadTopics = async (communityId: string) => {
    try {
      const result = await api<{ topics: CommunityTopic[] }>(`/communities/${encodeURIComponent(communityId)}/topics`);
      setTopics(result.topics || []);
    } catch (error) {
      showToast(errorMessage(error));
    }
  };

  const createTopic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCommunityId || topicBusy) return;
    const fd = new FormData(event.currentTarget);
    setTopicBusy(true);
    try {
      const result = await api<{ topic: CommunityTopic }>(`/communities/${encodeURIComponent(selectedCommunityId)}/topics`, {
        method: "POST",
        body: JSON.stringify({ name: fd.get("name"), description: fd.get("description") })
      });
      setTopics((current) => [...current, result.topic].sort((a,b) => a.name.localeCompare(b.name, "pt-BR")));
      setTopicCreateOpen(false);
      showToast(selectedCommunity?.companyId ? "Setor criado." : "Assunto criado.");
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setTopicBusy(false);
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
    setTopics([]);
    setSelectedTopicId("");

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
    const targetCommunity = data.allCompanyCommunities.find((community) => community.id === selectedCommunityId)
      || data.communities.find((community) => community.id === selectedCommunityId)
      || (externalCommunity?.id === selectedCommunityId ? externalCommunity : undefined);
    const joined = data.communities.some((community) => community.id === selectedCommunityId);
    const canRead = joined || communityVisibility(targetCommunity) === "public";
    setDetailLoading(canRead && cached.length === 0);
    if (canRead) {
      void loadCommunityPosts(selectedCommunityId);
      void loadTopics(selectedCommunityId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommunityId, data.selectedCompanyId]);

  useEffect(() => {
    if (!selectedCommunityId) return;
    const joined = data.communities.some((community) => community.id === selectedCommunityId);
    const targetCommunity = data.allCompanyCommunities.find((community) => community.id === selectedCommunityId)
      || data.communities.find((community) => community.id === selectedCommunityId)
      || (externalCommunity?.id === selectedCommunityId ? externalCommunity : undefined);
    if (joined || communityVisibility(targetCommunity) === "public") void loadCommunityPosts(selectedCommunityId);
  }, [selectedTopicId]);

  useEffect(() => {
    if (!selectedCommunityId || !realtimeRevision) return;
    void loadCommunityPosts(selectedCommunityId);
    if (membersPage) void loadCommunityMembers(selectedCommunityId);
    // Atualiza somente o detalhe aberto sem reiniciar o estado da tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtimeRevision]);

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

  const uploadCommunityImage=async(communityId:string,file:File)=>{
    if(file.size>5*1024*1024)throw new Error("A foto da comunidade pode ter no máximo 5 MB.");
    const qs=new URLSearchParams({scope:"community_avatar",communityId,name:file.name});
    const uploaded=await api<{media:{id:string}}>(`/media/upload?${qs}`,{
      method:"POST",
      headers:{"Content-Type":file.type||"image/jpeg","X-File-Name":file.name},
      body:file
    });
    await api(`/communities/${encodeURIComponent(communityId)}`,{
      method:"PATCH",
      body:JSON.stringify({avatarMediaId:uploaded.media.id})
    });
    return uploaded.media.id;
  };

  const changeCommunityImage=async(file:File)=>{
    if(!selectedCommunityId||communityImageBusy)return;
    setCommunityImageBusy(true);
    try{
      await uploadCommunityImage(selectedCommunityId,file);
      showToast("Foto da comunidade atualizada.");
      await refresh();
    }catch(error){showToast(errorMessage(error));}
    finally{setCommunityImageBusy(false);}
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    try {
      const endpoint = data.selectedCompanyId && data.canAdmin
        ? `/companies/${data.selectedCompanyId}/communities`
        : "/communities";
      const result = await api<{ community: Community }>(endpoint, {
        method: "POST", body: JSON.stringify({
          name: fd.get("name"),
          description: fd.get("description"),
          visibility: fd.get("visibility")
        })
      });
      const photo=fd.get("photo");
      if(photo instanceof File&&photo.size){
        await uploadCommunityImage(result.community.id,photo);
      }
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
          <button className="community-manage-members-tag" onClick={openMembers}>
            <Users size={13} />
            {data.canAdmin ? "Gerenciar membros" : "Ver membros"}
            <b>{memberCount}</b>
          </button>
          <div className="community-detail-title">
            <CommunityImage community={selectedCommunity} large />
            <div>
              <div className="community-detail-name-line"><h2>{selectedCommunity.name}</h2>{selectedCommunity.officialUorqui && <span className="official-uorqui-badge"><ShieldCheck size={11}/> {selectedCommunity.officialLabel || "Oficial Uorqui"}</span>}</div>
              <p>{selectedCommunity.description || (communityVisibility(selectedCommunity) === "public" ? "Comunidade pública." : "Comunidade privada.")}</p>
              <span className={`community-visibility-badge ${communityVisibility(selectedCommunity)}`}>
                {communityVisibility(selectedCommunity) === "public" ? <Globe2 size={13} /> : <ShieldCheck size={13} />}
                {communityVisibility(selectedCommunity) === "public" ? "Pública na empresa" : "Privada"}
              </span>
            </div>
          </div>
          <div className="community-detail-actions">
            {(data.canAdmin || selectedCommunity.createdBy === data.me.uid) && (
              <label className="btn secondary small community-image-upload">
                <Camera size={15}/> {communityImageBusy ? "Enviando…" : "Alterar foto"}
                <input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={communityImageBusy} onChange={e=>{const file=e.target.files?.[0];if(file)void changeCommunityImage(file);e.currentTarget.value="";}}/>
              </label>
            )}
            {isJoinedCommunity(selectedCommunity.id) ? (
              <button className="btn" onClick={() => onComposeCommunity(selectedCommunity.id)}><Plus size={17} /> Publicar aqui</button>
            ) : (
              <button
                className="btn"
                disabled={joinBusyId === selectedCommunity.id || joinStatusByCommunity[selectedCommunity.id] === "pending"}
                onClick={() => { if (!selectedCommunity.companyId) void joinCommunity(selectedCommunity); }}
              >
                <UserPlus size={17} />
                {joinBusyId === selectedCommunity.id
                  ? "Enviando…"
                  : joinStatusByCommunity[selectedCommunity.id] === "pending"
                    ? "Solicitação enviada"
                    : selectedCommunity.companyId
                      ? "Somente por convite"
                      : communityVisibility(selectedCommunity) === "public"
                        ? "Participar"
                        : "Solicitar participação"}
              </button>
            )}
          </div>
        </div>

        <section className="community-topics">
          <div className="community-topics-head">
            <strong>{selectedCommunity.companyId ? "Setores" : "Assuntos"}</strong>
            {(data.canAdmin || selectedCommunity.createdBy === data.me.uid) && (
              <button className="text-button" onClick={() => setTopicCreateOpen(true)}>
                <Plus size={14} /> Novo {selectedCommunity.companyId ? "setor" : "assunto"}
              </button>
            )}
          </div>
          <div className="community-topic-tabs">
            <button className={!selectedTopicId ? "active" : ""} onClick={() => setSelectedTopicId("")}>Todos</button>
            {topics.map((topic) => (
              <button key={topic.id} className={selectedTopicId === topic.id ? "active" : ""} onClick={() => setSelectedTopicId(topic.id)}>
                {topic.name}
              </button>
            ))}
          </div>
          {!!selectedTopicId && isJoinedCommunity(selectedCommunity.id) && (
            <button className="btn small community-topic-publish" onClick={() => onComposeCommunity(selectedCommunity.id, selectedTopicId)}>
              <Plus size={15} /> Publicar em {topics.find(topic => topic.id === selectedTopicId)?.name || "assunto"}
            </button>
          )}
        </section>

        <div className="feed community-feed">
          {!isJoinedCommunity(selectedCommunity.id) && communityVisibility(selectedCommunity) === "private" ? (
            <div className="social-community-empty">
              <ShieldCheck size={30} />
              <strong>Comunidade privada</strong>
              <p>As publicações ficam disponíveis depois que sua solicitação for aprovada.</p>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      </section>
    );
  }

  if (selectedCommunityId && !selectedCommunity) {
    return (
      <section className="page-section">
        <button className="back-button" onClick={() => onSelectCommunity("")}><ArrowLeft size={18}/> Comunidades</button>
        <div className="loading-line">Abrindo comunidade…</div>
      </section>
    );
  }

  const listedCommunities = data.allCompanyCommunities.length ? data.allCompanyCommunities : data.communities;

  return (
    <section className="page-section">
      <div className="page-heading">
        <div><h2>Comunidades</h2><p>Crie uma comunidade ou participe de espaços sobre os assuntos que interessam a você.</p></div>
        <button className="btn small" onClick={() => setCreateOpen(true)}><Plus size={17} /> Criar comunidade</button>
      </div>
      <div className="community-grid">
        {listedCommunities.map((community) => {
          const joined = isJoinedCommunity(community.id);
          const pending = joinStatusByCommunity[community.id] === "pending";
          return (
            <article className="community-card community-link" key={community.id}>
              <button className="community-card-open" onClick={() => onSelectCommunity(community.id)}>
                <CommunityImage community={community} />
                <div>
                  <div className="community-name-line"><strong>{community.name}</strong>{community.officialUorqui && <span className="official-uorqui-badge"><ShieldCheck size={11}/> {community.officialLabel || "Oficial Uorqui"}</span>}</div>
                  <p>{community.description || (communityVisibility(community) === "public" ? "Comunidade pública." : "Comunidade privada.")}</p>
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
              {!joined && (
                <button
                  className="btn secondary small community-join-card-button"
                  disabled={joinBusyId === community.id || pending}
                  onClick={() => { if (!community.companyId) void joinCommunity(community); }}
                >
                  {community.companyId ? "Somente por convite" : pending ? "Solicitação enviada" : communityVisibility(community) === "public" ? "Participar" : "Solicitar participação"}
                </button>
              )}
            </article>
          );
        })}
      </div>
      {!listedCommunities.length && <Empty title={data.canAdmin ? "Crie a primeira comunidade" : "Você ainda não está em comunidades"} text={data.canAdmin ? "Crie apenas os grupos que sua empresa realmente precisa." : "Quando você for adicionado a uma comunidade, ela aparecerá aqui."} />}
      {topicCreateOpen && selectedCommunity && (
        <Modal title={selectedCommunity.companyId ? "Criar setor" : "Criar assunto"} onClose={() => setTopicCreateOpen(false)}>
          <form className="stack-form" onSubmit={createTopic}>
            <label><span>Nome</span><input name="name" required maxLength={80} placeholder={selectedCommunity.companyId ? "Ex.: Engenharia" : "Ex.: Manutenção"} /></label>
            <label><span>Descrição</span><textarea name="description" maxLength={220} rows={3} placeholder="O que será discutido aqui?" /></label>
            <button className="btn" disabled={topicBusy}>{topicBusy ? "Criando…" : selectedCommunity.companyId ? "Criar setor" : "Criar assunto"}</button>
          </form>
        </Modal>
      )}
      {createOpen && <Modal title="Criar comunidade" onClose={() => setCreateOpen(false)}>
        <form className="stack-form" onSubmit={create}>
          <label><span>Nome</span><input name="name" required maxLength={90} placeholder="Ex.: Assistência Técnica" /></label>
          <label><span>Descrição</span><textarea name="description" maxLength={280} rows={3} placeholder="Que assuntos ficam aqui?" /></label>
          <label><span>Foto da comunidade</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></label>
          <label>
            <span>Visibilidade</span>
            <select name="visibility" defaultValue="public">
              <option value="public">Aberta — qualquer pessoa pode encontrar e participar</option>
              <option value="private">Privada — entrada mediante aprovação</option>
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
  const [communities, setCommunities] = useState<(Community & { alreadyMember?: boolean })[]>([]);
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [people, setPeople] = useState<Array<{ uid: string; displayName?: string; username?: string; bio?: string; avatarMediaId?: string; isFollowing?: boolean }>>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const searchRequestId = useRef(0);

  const loadDiscover = async () => {
    setDiscoverLoading(true);
    try {
      const result = await api<{ posts: Post[]; communities: (Community & { alreadyMember?: boolean })[]; jobs: JobOpening[] }>("/discover");
      setPosts(result.posts || []);
      setCommunities(result.communities || []);
      setJobs(result.jobs || []);
      setPeople([]);
      void prefetchPostMedia(result.posts || [], 12);
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setDiscoverLoading(false);
    }
  };

  const runSearch = async (value: string) => {
    const normalized = value.trim();
    if (normalized.length < 2) {
      searchRequestId.current += 1;
      setSearched(false);
      setSearching(false);
      await loadDiscover();
      return;
    }

    const requestId = ++searchRequestId.current;
    setSearching(true);
    try {
      const qs = new URLSearchParams({ q: normalized });
      const [postResult, peopleResult] = await Promise.all([
        api<{ posts: Post[] }>(`/search?${qs}`),
        api<{ people: Array<{ uid: string; displayName?: string; username?: string; bio?: string; avatarMediaId?: string; isFollowing?: boolean }> }>(`/social/people?${qs}`)
      ]);
      if (requestId !== searchRequestId.current) return;
      setPosts(postResult.posts || []);
      setPeople(peopleResult.people || []);
      setCommunities([]);
      setJobs([]);
      setSearched(true);
      void prefetchPostMedia(postResult.posts || [], 12);
    } catch (err) {
      if (requestId === searchRequestId.current) showToast(errorMessage(err));
    } finally {
      if (requestId === searchRequestId.current) setSearching(false);
    }
  };

  useEffect(() => {
    if (initialQuery !== undefined && initialQuery !== query) setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query.trim().length >= 2) void runSearch(query);
      else void loadDiscover();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

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

  const shareJob = async (job: JobOpening) => {
    const url = `${location.origin}/?discover=1&job=${encodeURIComponent(job.id)}`;
    const text = `${job.title} — ${job.companyName}${job.location ? ` · ${job.location}` : ""}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: job.title, text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        showToast("Link da vaga copiado.");
      }
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") showToast("Não foi possível compartilhar a vaga.");
    }
  };

  const openPerson = (uid: string) => {
    if (!uid) return;
    const params = new URLSearchParams(location.search);
    params.delete("people");
    params.set("profile", uid);
    history.pushState({}, "", `${location.pathname}?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <section className="page-section discover-page">
      <div className="page-heading">
        <div><h2>Descobrir</h2><p>Pessoas, publicações, comunidades e oportunidades que podem interessar a você.</p></div>
      </div>

      <form className="large-search" onSubmit={(event) => { event.preventDefault(); void runSearch(query); }}>
        <Search size={20} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar no Uorqui" />
        <button className="btn small">Buscar</button>
      </form>

      {(searching || discoverLoading) && <div className="live-search-status">{searching ? "Buscando…" : "Descobrindo…"}</div>}

      {!searched && !!communities.length && (
        <section className="discover-section">
          <div className="discover-section-head"><strong>Comunidades para descobrir</strong></div>
          <div className="discover-community-row">
            {communities.slice(0, 10).map((community) => (
              <button className={`discover-community-card ${community.officialUorqui ? "official" : ""}`} key={community.id} onClick={() => {
                window.dispatchEvent(new CustomEvent("uorqui:open-community", { detail: { communityId: community.id } }));
              }}>
                <CommunityImage community={community} />
                <div className="discover-community-name"><strong>{community.name}</strong>{community.officialUorqui && <span className="official-uorqui-badge"><ShieldCheck size={10}/> Oficial</span>}</div>
                <small>{community.verifiedCompany ? "Empresa verificada" : community.description || "Comunidade pública"}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {!searched && !!jobs.length && (
        <section className="discover-section">
          <div className="discover-section-head"><strong>Vagas que podem interessar</strong></div>
          <div className="jobs-list discover-jobs">
            {jobs.slice(0, 8).map((job) => (
              <article className="job-card" key={job.id}>
                <div className="job-card-head">
                  <div className="job-company-mark">{job.companyName.slice(0,2).toUpperCase()}</div>
                  <div className="ellipsis"><strong>{job.title}</strong><small>{job.companyName}</small></div>
                  <span className="job-audience-pill world"><Globe2 size={12}/> Mundo</span>
                </div>
                <p className="job-description">{job.description}</p>
                <div className="job-meta">
                  <span><BriefcaseBusiness size={14}/> {jobContractLabels[job.contractType || "clt"] || "Outro"}</span>
                  {job.location && <span><MapPin size={14}/> {job.location}</span>}
                </div>
                <div className="job-card-actions">
                  {job.contactEmail && <a className="btn secondary small" href={`mailto:${job.contactEmail}?subject=${encodeURIComponent(`Candidatura — ${job.title}`)}`}><Mail size={15}/> Candidatar-se</a>}
                  <button className="btn secondary small" onClick={() => void shareJob(job)}><Share2 size={15}/> Compartilhar</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {searched && !!people.length && (
        <section className="discover-section discover-people-section">
          <div className="discover-section-head"><strong>Pessoas</strong></div>
          <div className="discover-people-list">
            {people.map((person) => (
              <button className="discover-person-row" key={person.uid} onClick={() => openPerson(person.uid)}>
                <Avatar name={person.displayName || person.username || "Usuário"} mediaId={person.avatarMediaId} size={44} />
                <div className="ellipsis">
                  <strong>{person.displayName || person.username || "Usuário"}</strong>
                  {person.username && <small>@{person.username}</small>}
                  {person.bio && <p>{person.bio}</p>}
                </div>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="discover-section">
        {!searched && <div className="discover-section-head"><strong>Publicações para você</strong></div>}
        <div className="feed search-results discover-feed">
          {posts.map((post) => <PostCard
            key={post.id}
            post={post}
            companyName={data.company?.name}
            community={data.communityMap[post.communityId || ""]}
            onLike={like}
            onRead={async () => {}}
            canDelete={post.authorUid === data.me.uid}
            onDelete={async () => {}}
            currentUid={data.me.uid}
            canAdmin={false}
            onChanged={refresh}
            showToast={showToast}
          />)}
          {searched && !posts.length && !people.length && <Empty title="Nenhum resultado" text="Tente buscar por nome, usuário ou palavras da publicação." />}
          {!searched && !discoverLoading && !posts.length && <Empty title="Ainda há pouco para descobrir" text="Conforme a rede crescer, novas recomendações aparecerão aqui." />}
        </div>
      </section>
    </section>
  );
}

const jobContractLabels: Record<JobOpening["contractType"] & string, string> = {
  clt: "CLT",
  pj: "PJ",
  internship: "Estágio",
  temporary: "Temporário",
  other: "Outro"
};

function JobsPage({ data, realtimeRevision, showToast, onUpgradeRequired, embedded = false }: {
  data: BootstrapData;
  realtimeRevision: number;
  showToast: (message: string) => void;
  onUpgradeRequired: (message: string) => void;
  embedded?: boolean;
}) {
  const [jobs, setJobs] = useState<JobOpening[]>([]);
  const [tab, setTab] = useState<"company" | "world">("company");
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [audience, setAudience] = useState<"company" | "world">("company");
  const [publishing, setPublishing] = useState(false);
  const [deletingJobId, setDeletingJobId] = useState("");
  const loadedCompanyRef = useRef("");

  const loadJobs = async (silent = false) => {
    if (!data.selectedCompanyId) return;
    if (!silent) setLoadingJobs(true);
    try {
      const query = new URLSearchParams({ companyId: data.selectedCompanyId });
      const result = await api<{ jobs: JobOpening[] }>(`/jobs?${query.toString()}`);
      setJobs(result.jobs);
      loadedCompanyRef.current = data.selectedCompanyId;
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      if (!silent) setLoadingJobs(false);
    }
  };

  useEffect(() => {
    const sameCompany = loadedCompanyRef.current === data.selectedCompanyId;
    if (!sameCompany) {
      setJobs([]);
      setLoadingJobs(true);
    }
    void loadJobs(sameCompany);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.selectedCompanyId, realtimeRevision]);

  const publishJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (publishing) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPublishing(true);
    try {
      const result = await api<{ job: JobOpening }>("/jobs", {
        method: "POST",
        body: JSON.stringify({
          companyId: data.selectedCompanyId,
          title: formData.get("title"),
          description: formData.get("description"),
          location: formData.get("location"),
          contractType: formData.get("contractType"),
          contactEmail: formData.get("contactEmail"),
          audience
        })
      });
      setJobs((current) => [result.job, ...current.filter((job) => job.id !== result.job.id)]);
      setTab(audience);
      setComposerOpen(false);
      setAudience("company");
      form.reset();
      showToast(audience === "world" ? "Vaga publicada para o mundo." : "Vaga publicada para a empresa.");
    } catch (error) {
      const message = errorMessage(error);
      if (isPlanLimitError(error)) onUpgradeRequired(message);
      else showToast(message);
    } finally {
      setPublishing(false);
    }
  };

  const removeJob = async (job: JobOpening) => {
    if (deletingJobId || !confirm(`Excluir a vaga “${job.title}”?`)) return;
    setDeletingJobId(job.id);
    try {
      await api(`/jobs/${encodeURIComponent(job.id)}`, { method: "DELETE" });
      setJobs((current) => current.filter((item) => item.id !== job.id));
      showToast("Vaga excluída.");
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setDeletingJobId("");
    }
  };

  const visibleJobs = jobs.filter((job) => job.audience === tab);
  const companyJobs = jobs.filter((job) => job.companyId === data.selectedCompanyId);
  const contractLabel = (value?: JobOpening["contractType"]) => jobContractLabels[value || "clt"] || "Outro";

  const openComposer = () => {
    if (data.company?.effectivePlan !== "premium") {
      onUpgradeRequired("Converta a comunidade em Empresa para publicar vagas.");
      return;
    }
    setComposerOpen(true);
  };

  const shareJob = async (job: JobOpening) => {
    const url = `${location.origin}/?discover=1&job=${encodeURIComponent(job.id)}`;
    const text = `${job.title} — ${job.companyName}${job.location ? ` · ${job.location}` : ""}`;
    try {
      if (navigator.share) await navigator.share({ title: job.title, text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        showToast("Link da vaga copiado.");
      }
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") showToast("Não foi possível compartilhar a vaga.");
    }
  };

  return (
    <section className={embedded ? "jobs-page jobs-embedded" : "page-section jobs-page"}>
      <div className="page-heading jobs-heading">
        <div>
          <h2>Vagas</h2>
          <p>Divulgue oportunidades dentro da empresa ou para profissionais de qualquer lugar.</p>
          {embedded && <small className="muted">As vagas públicas também podem aparecer em Descobrir.</small>}
        </div>
        {data.canAdmin && (
          <button className="btn small" onClick={openComposer}>
            <BriefcaseBusiness size={16} /> Divulgar vaga
          </button>
        )}
      </div>

      <div className="jobs-tabs" role="tablist" aria-label="Público das vagas">
        <button className={tab === "company" ? "active" : ""} onClick={() => setTab("company")}>
          <Building2 size={15} /> Internas
          <span>{jobs.filter((job) => job.audience === "company").length}</span>
        </button>
        <button className={tab === "world" ? "active" : ""} onClick={() => setTab("world")}>
          <Globe2 size={15} /> Para o mundo
          <span>{jobs.filter((job) => job.audience === "world").length}</span>
        </button>
      </div>

      {loadingJobs ? (
        <div className="loading-line">Carregando vagas…</div>
      ) : (
        <div className="jobs-list">
          {visibleJobs.map((job) => (
            <article className="job-card" key={job.id}>
              <div className="job-card-head">
                <div className="job-company-mark">{job.companyName.slice(0, 2).toUpperCase()}</div>
                <div className="ellipsis">
                  <strong>{job.title}</strong>
                  <small>{job.companyName}</small>
                </div>
                <span className={`job-audience-pill ${job.audience}`}>
                  {job.audience === "world" ? <><Globe2 size={12} /> Mundo</> : <><Building2 size={12} /> Interna</>}
                </span>
              </div>

              <p className="job-description">{job.description}</p>

              <div className="job-meta">
                <span><BriefcaseBusiness size={14} /> {contractLabel(job.contractType)}</span>
                {job.location && <span><MapPin size={14} /> {job.location}</span>}
                {job.createdAt && <span>Publicada em {new Date(job.createdAt).toLocaleDateString("pt-BR")}</span>}
              </div>

              <div className="job-card-actions">
                {job.contactEmail && (
                  <a className="btn secondary small" href={`mailto:${job.contactEmail}?subject=${encodeURIComponent(`Candidatura — ${job.title}`)}`}>
                    <Mail size={15} /> Candidatar-se
                  </a>
                )}
                <button className="btn secondary small" onClick={() => void shareJob(job)}><Share2 size={15} /> Compartilhar</button>
                {data.canAdmin && job.companyId === data.selectedCompanyId && (
                  <button className="icon-btn job-delete-button" disabled={!!deletingJobId} onClick={() => removeJob(job)} aria-label="Excluir vaga" title="Excluir vaga">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </article>
          ))}

          {!visibleJobs.length && (
            <Empty
              title={tab === "company" ? "Nenhuma vaga interna" : "Nenhuma vaga pública"}
              text={data.canAdmin
                ? "Use “Divulgar vaga” para publicar a primeira oportunidade."
                : "As novas oportunidades aparecerão aqui."}
            />
          )}
        </div>
      )}

      {composerOpen && (
        <Modal title="Divulgar vaga" onClose={() => !publishing && setComposerOpen(false)} wide>
          <form className="stack-form job-form" onSubmit={publishJob}>
            <label>
              <span>Título da vaga</span>
              <input name="title" required maxLength={140} placeholder="Ex.: Analista de atendimento" />
            </label>
            <label>
              <span>Descrição</span>
              <textarea name="description" required minLength={20} rows={7} placeholder="Responsabilidades, requisitos e informações importantes…" />
            </label>
            <div className="job-form-grid">
              <label>
                <span>Local ou modalidade</span>
                <input name="location" maxLength={160} placeholder="Ex.: São Paulo · Híbrido" />
              </label>
              <label>
                <span>Contratação</span>
                <select name="contractType" defaultValue="clt">
                  <option value="clt">CLT</option>
                  <option value="pj">PJ</option>
                  <option value="internship">Estágio</option>
                  <option value="temporary">Temporário</option>
                  <option value="other">Outro</option>
                </select>
              </label>
            </div>
            <label>
              <span>E-mail para candidaturas</span>
              <input name="contactEmail" type="email" required defaultValue={data.me.email || ""} placeholder="talentos@empresa.com" />
            </label>

            <fieldset className="job-audience-fieldset">
              <legend>Quem poderá ver?</legend>
              <button type="button" className={audience === "company" ? "selected" : ""} onClick={() => setAudience("company")}>
                <Building2 size={18} />
                <span><strong>Somente a empresa</strong><small>Visível apenas para os colaboradores.</small></span>
                {audience === "company" && <Check size={17} />}
              </button>
              <button type="button" className={audience === "world" ? "selected" : ""} onClick={() => setAudience("world")}>
                <Globe2 size={18} />
                <span><strong>Para o mundo</strong><small>Visível para usuários de todas as empresas.</small></span>
                {audience === "world" && <Check size={17} />}
              </button>
            </fieldset>

            <div className="modal-actions">
              <button type="button" className="btn secondary" disabled={publishing} onClick={() => setComposerOpen(false)}>Cancelar</button>
              <button className="btn" disabled={publishing}>
                <BriefcaseBusiness size={16} /> {publishing ? "Publicando…" : "Publicar vaga"}
              </button>
            </div>
          </form>
        </Modal>
      )}
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

function AdminPage({ data, onCompanyChange, onEditCompany, onManageCommunity, refresh, showToast, onUpgradeRequired }: {
  data: BootstrapData;
  onCompanyChange: (companyId: string) => Promise<void>;
  onEditCompany: () => void;
  onManageCommunity: (communityId: string) => void;
  refresh: () => Promise<void>;
  showToast: (m: string) => void;
  onUpgradeRequired: (message: string) => void;
}) {
  const [inviteLink, setInviteLink] = useState("");
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteActionBusy, setInviteActionBusy] = useState("");
  const [memberActionBusy, setMemberActionBusy] = useState("");
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
      const result = await api<{ pending?: boolean; executeAfter?: string; message?: string }>(`/companies/${data.selectedCompanyId}/members/${uid}`, {
        method: "PATCH", body: JSON.stringify({ role })
      });
      if (result.pending) {
        const when = result.executeAfter ? new Date(result.executeAfter).toLocaleString("pt-BR") : "após 24 horas";
        showToast(`Alteração protegida: será efetivada ${when}.`);
      } else {
        showToast(role === "admin" ? "Usuário agora é Administrador." : "Nível alterado para Usuário.");
      }
      await refresh();
    } catch (err) { showToast(errorMessage(err)); }
  };

  const removeMember = async (member: BootstrapData["members"][number]) => {
    const name = member.displayName || member.email || "este colaborador";
    if (!confirm(`Remover ${name} da empresa e de todas as comunidades?`)) return;
    setMemberActionBusy(member.uid);
    try {
      const result = await api<{ pending?: boolean; executeAfter?: string; message?: string }>(`/companies/${data.selectedCompanyId}/members/${encodeURIComponent(member.uid)}`, {
        method: "DELETE"
      });
      if (result.pending) {
        const when = result.executeAfter ? new Date(result.executeAfter).toLocaleString("pt-BR") : "após 24 horas";
        showToast(`Remoção protegida: será efetivada ${when}.`);
      } else {
        showToast("Colaborador removido da empresa.");
      }
      await Promise.all([refresh(), loadSentInvites()]);
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setMemberActionBusy("");
    }
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
    if (!confirm(`Solicitar a exclusão da comunidade "${community.name}"? Todo o conteúdo será apagado somente depois que todos os administradores aprovarem.`)) return;
    try {
      const result = await api<{ pending?: boolean; requiredApprovals?: number }>(`/communities/${community.id}`, { method: "DELETE" });
      showToast(result.pending
        ? `Solicitação enviada. ${result.requiredApprovals || 0} administrador(es) precisam aprovar.`
        : "Solicitação registrada.");
      await refresh();
    } catch (err) {
      showToast(errorMessage(err));
    }
  };

  return (
    <section className="page-section">
      <div className="page-heading admin-page-heading">
        <div><h2>Administrar</h2><p>Escolha a empresa e gerencie colaboradores e comunidades. Administradores com mais de 7 dias possuem janela de segurança de 24 horas para rebaixamento ou remoção.</p></div>
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
        <div className="admin-company-buttons">
          <button className="btn secondary small" onClick={onEditCompany}>
            <Building2 size={15} /> Editar dados
          </button>
          <button className="btn secondary small admin-plan-button" onClick={() => onUpgradeRequired("")}>
            <Crown size={15} /> {data.company?.effectivePlan === "premium" ? "Premium" : "Ver planos"}
          </button>
        </div>
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
          {data.members.map((member) => {
            const canRemove = member.role !== "owner" && member.uid !== data.me.uid && (data.role === "owner" || member.role !== "admin");
            return (
            <div className="member-row" key={member.uid}>
              <Avatar name={member.displayName || member.email} size={38} />
              <div className="ellipsis">
                <strong>{member.displayName || member.email}</strong>
                <small>{member.email}</small>
              </div>
              <div className="member-admin-actions">
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
                {canRemove && (
                  <button
                    className="icon-btn member-remove-button"
                    disabled={!!memberActionBusy}
                    onClick={() => removeMember(member)}
                    aria-label={`Remover ${member.displayName || member.email || "colaborador"}`}
                    title="Remover da empresa"
                  >
                    <UserMinus size={17} />
                  </button>
                )}
              </div>
            </div>
          );})}
        </div>
      </section>

      <section className="panel-card">
        <h3>Comunidades da empresa</h3>
        <p className="admin-community-help">Abra uma comunidade para visualizar todos os colaboradores e adicionar ou remover participantes.</p>
        {data.allCompanyCommunities.map((community) => (
          <div className="admin-community-row" key={community.id}>
            <CommunityImage community={community} />
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

type SuperadminAiAgent = {
  key: string;
  name: string;
  communityId: string;
  communityName: string;
  agentReady: boolean;
  communityReady: boolean;
  official: boolean;
  publishedToday: boolean;
  postId?: string;
};

type SuperadminAiStatus = {
  day: string;
  totalAgents: number;
  communitiesReady: number;
  postsToday: number;
  agents: SuperadminAiAgent[];
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
  const [aiStatus, setAiStatus] = useState<SuperadminAiStatus | null>(null);
  const [aiBusy, setAiBusy] = useState<"" | "seed" | "publish">("");

  const load = async () => {
    setLoadingSuperadmin(true);
    try {
      const [result, agentStatus] = await Promise.all([
        api<{
          metrics: SuperadminMetrics;
          companies: SuperadminCompany[];
        }>("/superadmin/overview"),
        api<SuperadminAiStatus>("/superadmin/ai-agents/status")
      ]);
      setMetrics(result.metrics);
      setCompanies(result.companies);
      setAiStatus(agentStatus);
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

  const seedAiCommunities = async () => {
    if (aiBusy) return;
    setAiBusy("seed");
    try {
      const result = await api<SuperadminAiStatus>("/superadmin/ai-agents/seed", { method: "POST" });
      setAiStatus(result);
      showToast(`${result.communitiesReady}/${result.totalAgents} comunidades oficiais prontas.`);
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setAiBusy("");
    }
  };

  const publishAiNow = async () => {
    if (aiBusy) return;
    setAiBusy("publish");
    try {
      const result = await api<SuperadminAiStatus & { published?: number; skipped?: number; failed?: number }>(
        "/superadmin/ai-agents/publish",
        { method: "POST" }
      );
      setAiStatus(result);
      showToast(
        result.published
          ? `${result.published} publicação(ões) dos agentes criada(s).`
          : result.postsToday === result.totalAgents
            ? "As 10 comunidades já receberam a publicação de hoje."
            : "Nenhuma nova publicação foi gerada. Verifique o status dos agentes."
      );
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setAiBusy("");
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

      <section className="panel-card superadmin-ai-panel">
        <div className="superadmin-ai-head">
          <div>
            <span className="superadmin-kicker"><Crown size={14}/> Equipe Uorqui · IA</span>
            <h3>Comunidades oficiais e publicações</h3>
            <p className="muted">Uma publicação por comunidade por dia. O disparo manual respeita a trava diária e não cria duplicados.</p>
          </div>
          <div className="superadmin-ai-summary">
            <strong>{aiStatus ? `${aiStatus.postsToday}/${aiStatus.totalAgents}` : "—"}</strong>
            <span>publicadas hoje</span>
          </div>
        </div>

        <div className="superadmin-ai-mobile-actions">
          <button className="btn secondary" disabled={Boolean(aiBusy)} onClick={() => void seedAiCommunities()}>
            {aiBusy === "seed" ? "Criando…" : "Garantir comunidades"}
          </button>
          <button className="btn" disabled={Boolean(aiBusy)} onClick={() => void publishAiNow()}>
            {aiBusy === "publish" ? "Publicando…" : "Publicar agentes agora"}
          </button>
        </div>

        {!aiStatus ? (
          <div className="loading-line superadmin-ai-loading">Carregando agentes…</div>
        ) : (
          <div className="superadmin-ai-grid">
            {aiStatus.agents.map(agent => (
              <div className="superadmin-ai-row" key={agent.key}>
                <div>
                  <strong>{agent.communityName}</strong>
                  <small>{agent.name}</small>
                </div>
                <span className={agent.official ? "ok" : "warn"}>{agent.official ? "Oficial" : "Pendente"}</span>
                <span className={agent.publishedToday ? "ok" : "neutral"}>{agent.publishedToday ? "Publicado hoje" : "Ainda não publicado"}</span>
              </div>
            ))}
          </div>
        )}
      </section>

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
  return (
    <section className="page-section plans-page creator-focus-page">
      <div className="page-heading plans-heading">
        <div>
          <h2>Criadores</h2>
          <p>Crie uma comunidade, construa seu público e transforme seu conteúdo em uma fonte de receita.</p>
        </div>
      </div>

      {reason?.message && !/empresa|cnpj|setor/i.test(reason.message) && (
        <section className="plan-offer-banner">
          <div className="plan-offer-icon"><Crown size={21}/></div>
          <div><strong>Para criadores</strong><p>{reason.message}</p></div>
        </section>
      )}

      <div className="plans-grid creator-plans-grid">
        <article className="plan-card current">
          <div className="plan-card-head">
            <div><span className="plan-eyebrow">Rede aberta</span><h3>Comunidades</h3></div>
            <strong className="plan-price">R$ 0<small>/mês</small></strong>
          </div>
          <p className="plan-description">Participe da rede, publique e crie comunidades sem limitar o crescimento do seu público.</p>
          <ul className="plan-features">
            <li><Check size={16}/> Perfil público, seguidores e feed aberto</li>
            <li><Check size={16}/> Criar e participar de comunidades</li>
            <li><Check size={16}/> Membros ilimitados</li>
            <li><Check size={16}/> Posts, respostas, enquetes e eventos</li>
            <li><Check size={16}/> Descoberta, mensagens e notificações</li>
          </ul>
          <button className="btn secondary plan-current-button" disabled>Disponível para todos</button>
        </article>

        <article className="plan-card premium-card">
          <div className="premium-ribbon">Monetização</div>
          <div className="plan-card-head">
            <div><span className="plan-eyebrow"><Crown size={13}/> Para criadores</span><h3>Criador</h3></div>
            <strong className="plan-price">R$ 0<small>/mês</small></strong>
          </div>
          <p className="plan-description">Transforme uma comunidade de sua autoria em uma comunidade de Criador e ofereça publicações exclusivas por assinatura.</p>
          <ul className="plan-features">
            <li><Check size={16}/> Você define o preço da assinatura</li>
            <li><Check size={16}/> Conteúdo aberto para atrair novos seguidores</li>
            <li><Check size={16}/> Publicações exclusivas para assinantes</li>
            <li><Check size={16}/> Painel de assinaturas e recebimentos</li>
            <li><Check size={16}/> Sem mensalidade fixa</li>
            <li><Check size={16}/> Comissão inicial do Uorqui: 25%</li>
          </ul>
          <span className="plan-secondary-note">Você pode começar sem pagar nada. O Uorqui só recebe quando sua comunidade gera receita.</span>
        </article>
      </div>

      <section className="panel-card creator-growth-note">
        <Crown size={20}/>
        <div>
          <strong>Seu público continua sendo seu público</strong>
          <p className="muted">Use sua comunidade aberta para ser descoberto, traga seus seguidores e escolha quais publicações serão exclusivas para assinantes.</p>
        </div>
      </section>
    </section>
  );
}

function CompaniesPage({
  data,
  realtimeRevision,
  onSelectCompany,
  onCompanyLeft,
  onOpenPlans,
  showToast
}: {
  data: BootstrapData;
  realtimeRevision: number;
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
                      <CommunityImage community={community} />
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

      {data.company?.effectivePlan === "premium" && (
        <section className="company-jobs-panel">
          <JobsPage
            data={data}
            realtimeRevision={realtimeRevision}
            showToast={showToast}
            onUpgradeRequired={() => onOpenPlans()}
            embedded
          />
        </section>
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
  data, refresh, showToast, onOpenSuperadmin, onOpenCommunities
}: {
  data: BootstrapData;
  refresh: () => Promise<void>;
  showToast: (m: string) => void;
  onOpenSuperadmin: () => void;
  onOpenCommunities: () => void;
}) {
  const [photoError, setPhotoError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [pendingAvatarMediaId, setPendingAvatarMediaId] = useState("");
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarEditorFile, setAvatarEditorFile] = useState<File | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [passwordError, setPasswordError] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");

  const selectAvatarFile = (file?: File) => {
    if (!file || photoBusy) return;
    setAvatarMenuOpen(false);
    setPhotoError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setPhotoError("Use uma imagem JPG, PNG ou WebP.");
    if (file.size > 5 * 1024 * 1024) return setPhotoError("A foto pode ter no máximo 5 MB.");
    setAvatarEditorFile(file);
  };

  const uploadPhoto = async (file: File) => {
    if (photoBusy) return;
    setPhotoError("");
    setPhotoBusy(true);
    try {
      const qs = new URLSearchParams({ scope: "avatar", name: file.name });
      const result = await api<{ media: { id: string } }>(`/media/upload?${qs}`, {
        method: "POST", headers: { "Content-Type": file.type, "X-File-Name": file.name }, body: file
      });
      await api("/me", { method: "PATCH", body: JSON.stringify({ avatarMediaId: result.media.id }) });
      cacheMediaBlobUrl(result.media.id, file);
      setPendingAvatarMediaId(result.media.id);
      setAvatarEditorFile(null);
      showToast("Foto atualizada.");
      void refresh().finally(() => setPendingAvatarMediaId(""));
    } catch (err) {
      setPhotoError(errorMessage(err));
      throw err;
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    if (photoBusy || !data.me.avatarMediaId) return;
    if (!confirm("Remover sua foto de perfil?")) return;
    setAvatarMenuOpen(false);
    setPhotoError("");
    setPhotoBusy(true);
    try {
      await api("/me", { method: "PATCH", body: JSON.stringify({ avatarMediaId: "" }) });
      showToast("Foto removida.");
      await refresh();
    } catch (err) {
      setPhotoError(errorMessage(err));
    } finally {
      setPhotoBusy(false);
    }
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

  return (
    <section className="page-section">
      {photoBusy && (
        <div className="profile-photo-blocker" role="status" aria-live="polite" aria-label="Atualizando foto de perfil">
          <div><span className="profile-photo-spinner" /> <strong>Atualizando sua foto…</strong></div>
        </div>
      )}
      <div className="profile-grid">
        <section className="panel-card profile-panel">
          <div className="profile-head">
            <div className="avatar-edit">
              <Avatar name={data.me.displayName || data.me.email} mediaId={pendingAvatarMediaId || data.me.avatarMediaId} size={92} />
              {photoBusy && <span className="avatar-photo-busy"><span className="profile-photo-spinner" /></span>}
              <button
                type="button"
                className="camera-button"
                title="Editar foto"
                aria-label="Editar foto de perfil"
                aria-expanded={avatarMenuOpen}
                disabled={photoBusy}
                onClick={() => setAvatarMenuOpen((current) => !current)}
              ><Camera size={18} /></button>
              <input
                ref={cameraInputRef}
                type="file"
                hidden
                capture="user"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  selectAvatarFile(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <input
                ref={galleryInputRef}
                type="file"
                hidden
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  selectAvatarFile(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              {avatarMenuOpen && (
                <>
                  <button className="avatar-photo-menu-scrim" type="button" aria-label="Fechar opções da foto" onClick={() => setAvatarMenuOpen(false)} />
                  <div className="avatar-photo-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => cameraInputRef.current?.click()}><Camera size={17} /> Tirar uma foto</button>
                    <button type="button" role="menuitem" onClick={() => galleryInputRef.current?.click()}><Images size={17} /> Escolher da galeria</button>
                    {data.me.avatarMediaId && <button type="button" role="menuitem" className="danger" onClick={removePhoto}><Trash2 size={17} /> Remover a foto</button>}
                  </div>
                </>
              )}
            </div>
            <div><h2>{data.me.displayName || "Usuário"}</h2><p>{data.me.email}</p><span className="private-pill">{auth.currentUser?.emailVerified ? "E-mail verificado" : "E-mail não verificado"}</span></div>
          </div>
          <p className="muted">Seu perfil acompanha você por toda a rede e pelas comunidades das quais participa.</p>
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

      <section className="panel-card profile-community-cta">
        <div className="profile-community-cta-icon"><Users size={20} /></div>
        <div className="profile-community-cta-copy">
          <strong>Crie sua comunidade</strong>
          <p className="muted">Abra um espaço sobre um assunto que você gosta e convide outras pessoas para participar.</p>
        </div>
        <button className="btn small" onClick={onOpenCommunities}>
          <Plus size={16} /> Criar comunidade
        </button>
      </section>

      {avatarEditorFile && (
        <AvatarCropModal
          file={avatarEditorFile}
          busy={photoBusy}
          onCancel={() => !photoBusy && setAvatarEditorFile(null)}
          onConfirm={uploadPhoto}
        />
      )}

      {data.isSuperadmin && (
        <section className="panel-card superadmin-profile-card">
          <div>
            <strong>Superadmin Uorqui</strong>
            <p className="muted">Métricas globais da rede, comunidades, criadores e monetização.</p>
          </div>
          <button className="btn small" onClick={onOpenSuperadmin}><ShieldCheck size={16} /> Abrir Superadmin</button>
        </section>
      )}

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

      {deleteAccountOpen && (
        <Modal title="Apagar minha conta" onClose={() => !deleteAccountBusy && setDeleteAccountOpen(false)}>
          <form className="stack-form" onSubmit={deleteAccount}>
            <div className="danger-notice">
              <strong>Esta ação é permanente.</strong>
              <p>Seus textos permanecerão anonimizados quando necessário para não quebrar conversas existentes.</p>
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

type MessageConversation = {
  id: string; targetUid: string; displayName: string; username?: string; avatarMediaId?: string;
  status: "pending" | "accepted"; requestedBy?: string; lastMessagePreview?: string; lastMessageAt?: string; unreadCount?: number;
};
type DirectMessage = {
  id: string; senderUid: string; recipientUid: string; text?: string; createdAt?: string;
  attachments?: Array<{id:string;name?:string;contentType?:string;size?:number}>;
  sharedPost?: {id:string;authorName?:string;text?:string;scope?:string;companyId?:string} | null;
};

function MessagesPage({ me, showToast }: { me: {uid:string;displayName?:string}; showToast: (m:string)=>void }) {
  const [conversations,setConversations]=useState<MessageConversation[]>([]);
  const [nextOffset,setNextOffset]=useState<number|null>(null);
  const [targetUid,setTargetUid]=useState(() => sessionStorage.getItem("uorqui-message-target") || "");
  const [messages,setMessages]=useState<DirectMessage[]>([]);
  const [conversation,setConversation]=useState<{status?:string;requestedBy?:string}|null>(null);
  const [nextBefore,setNextBefore]=useState("");
  const [busy,setBusy]=useState(false);
  const [files,setFiles]=useState<File[]>([]);
  const [sharedPostId,setSharedPostId]=useState(() => sessionStorage.getItem("uorqui-message-post") || "");
  const [mediaUrls,setMediaUrls]=useState<Record<string,string>>({});
  const [userQuery,setUserQuery]=useState("");
  const [userResults,setUserResults]=useState<Array<{uid:string;displayName?:string;username?:string;avatarMediaId?:string;bio?:string}>>([]);
  const [userSearchBusy,setUserSearchBusy]=useState(false);
  const [recordingAudio,setRecordingAudio]=useState(false);
  const [recordedAudio,setRecordedAudio]=useState<File|null>(null);
  const [recordedAudioUrl,setRecordedAudioUrl]=useState("");
  const [audioDuration,setAudioDuration]=useState(0);
  const mediaRecorderRef=useRef<MediaRecorder|null>(null);
  const mediaStreamRef=useRef<MediaStream|null>(null);
  const audioChunksRef=useRef<Blob[]>([]);
  const audioStartedAtRef=useRef(0);
  const audioSendingRef=useRef(false);

  const loadConversations=async(offset=0)=>{
    try{
      const result=await api<{conversations:MessageConversation[];nextOffset:number|null}>(`/messages?offset=${offset}&limit=20`);
      setConversations(current=>offset?[...current,...result.conversations]:result.conversations);
      setNextOffset(result.nextOffset);
      if(!targetUid && result.conversations[0]?.targetUid) setTargetUid(result.conversations[0].targetUid);
    }catch(error){showToast(errorMessage(error));}
  };

  const loadMessages=async(uid=targetUid,before="")=>{
    if(!uid)return;
    try{
      const qs=before?`?before=${encodeURIComponent(before)}&limit=30`:"?limit=30";
      const result=await api<{conversation:any;messages:DirectMessage[];nextBefore:string}>(`/messages/${encodeURIComponent(uid)}${qs}`);
      setConversation(result.conversation);
      setMessages(current=>before?[...result.messages,...current]:result.messages);
      setNextBefore(result.nextBefore||"");
      sessionStorage.setItem("uorqui-message-target",uid);
    }catch(error){showToast(errorMessage(error));}
  };

  useEffect(()=>{void loadConversations();},[]);
  useEffect(()=>{if(targetUid)void loadMessages(targetUid);},[targetUid]);

  useEffect(()=>{
    const query=userQuery.trim();
    if(query.length<2){
      setUserResults([]);
      setUserSearchBusy(false);
      return;
    }
    let active=true;
    const timer=window.setTimeout(()=>{
      setUserSearchBusy(true);
      api<{people:Array<{uid:string;displayName?:string;username?:string;avatarMediaId?:string;bio?:string}>}>(`/social/people?q=${encodeURIComponent(query)}`)
        .then(result=>{if(active)setUserResults(result.people||[]);})
        .catch(()=>{if(active)setUserResults([]);})
        .finally(()=>{if(active)setUserSearchBusy(false);});
    },250);
    return()=>{active=false;window.clearTimeout(timer);};
  },[userQuery]);

  useEffect(()=>()=>{ if(recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl); },[recordedAudioUrl]);

  useEffect(()=>{
    const ids=[...new Set(messages.flatMap(m=>(m.attachments||[]).map(a=>a.id)))];
    ids.forEach(id=>{if(!mediaUrls[id])mediaBlobUrl(id).then(url=>setMediaUrls(c=>({...c,[id]:url}))).catch(()=>{});});
  },[messages]);

  const openDirectUser=(person:{uid:string;displayName?:string;username?:string;avatarMediaId?:string})=>{
    if(!person.uid)return;
    setConversations(current=>{
      if(current.some(item=>item.targetUid===person.uid))return current;
      return [{
        id:`new_${person.uid}`,
        targetUid:person.uid,
        displayName:person.displayName||"Usuário",
        username:person.username||"",
        avatarMediaId:person.avatarMediaId||"",
        status:"accepted",
        lastMessagePreview:"Nova conversa",
        unreadCount:0
      },...current];
    });
    setTargetUid(person.uid);
    setUserQuery("");
    setUserResults([]);
    sessionStorage.setItem("uorqui-message-target",person.uid);
  };

  const sendMessagePayload=async({text="",payloadFiles=[],postId=""}:{text?:string;payloadFiles?:File[];postId?:string})=>{
    if(!targetUid||busy||audioSendingRef.current)return null;
    const attachmentIds:string[]=[];
    for(const file of payloadFiles.slice(0,4)){
      if(file.size>20*1024*1024)throw new Error("Cada arquivo pode ter no máximo 20 MB.");
      const qs=new URLSearchParams({scope:"message",targetUid,name:file.name});
      const uploaded=await api<{media:{id:string}}>(`/media/upload?${qs}`,{
        method:"POST",
        headers:{"Content-Type":file.type||"application/octet-stream","X-File-Name":file.name},
        body:file
      });
      attachmentIds.push(uploaded.media.id);
    }
    return api<{message:DirectMessage;conversation:{id:string;status:string;requestedBy?:string}}>(
      `/messages/${encodeURIComponent(targetUid)}`,
      {method:"POST",body:JSON.stringify({text,attachmentIds,postId})}
    );
  };

  const appendSentMessage=async(result:{message:DirectMessage;conversation:{id:string;status:string;requestedBy?:string}})=>{
    setMessages(current=>current.some(item=>item.id===result.message.id)?current:[...current,result.message]);
    setConversation(result.conversation);
    await loadConversations();
  };

  const recordedAudioFile=(blob:Blob)=>{
    const type=blob.type||"audio/webm";
    const ext=type.includes("mp4")||type.includes("m4a")?"m4a":type.includes("ogg")?"ogg":"webm";
    return new File([blob],`audio-${Date.now()}.${ext}`,{type});
  };

  const stopAudioTracks=()=>{
    mediaStreamRef.current?.getTracks().forEach(track=>track.stop());
    mediaStreamRef.current=null;
  };

  const clearRecordedAudio=()=>{
    if(recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    setRecordedAudioUrl("");
    setRecordedAudio(null);
    setAudioDuration(0);
  };

  const stopAudioRecording=()=>{
    const recorder=mediaRecorderRef.current;
    if(recorder&&recorder.state!=="inactive") recorder.stop();
  };

  const startAudioRecording=async()=>{
    if(!targetUid||busy||audioSendingRef.current||recordingAudio)return;
    if(conversation?.status==="pending"&&conversation.requestedBy===me.uid)return;
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){
      showToast("Este navegador não oferece gravação de áudio.");
      return;
    }

    clearRecordedAudio();

    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      mediaStreamRef.current=stream;
      audioChunksRef.current=[];

      const preferred=[
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus"
      ];
      const mimeType=preferred.find(type=>MediaRecorder.isTypeSupported?.(type))||"";
      const recorder=mimeType?new MediaRecorder(stream,{mimeType}):new MediaRecorder(stream);
      mediaRecorderRef.current=recorder;

      recorder.ondataavailable=(chunk)=>{
        if(chunk.data&&chunk.data.size>0) audioChunksRef.current.push(chunk.data);
      };

      recorder.onerror=()=>{
        setRecordingAudio(false);
        stopAudioTracks();
        mediaRecorderRef.current=null;
        showToast("Não foi possível gravar o áudio.");
      };

      recorder.onstop=()=>{
        setRecordingAudio(false);
        stopAudioTracks();
        mediaRecorderRef.current=null;

        const chunks=audioChunksRef.current.splice(0);
        if(!chunks.length)return;

        const blob=new Blob(chunks,{type:recorder.mimeType||chunks[0]?.type||"audio/webm"});
        if(blob.size<500){
          showToast("A gravação ficou muito curta.");
          return;
        }
        if(blob.size>20*1024*1024){
          showToast("O áudio ultrapassou o limite de 20 MB.");
          return;
        }

        const file=recordedAudioFile(blob);
        const url=URL.createObjectURL(file);
        setRecordedAudio(file);
        setRecordedAudioUrl(url);
        setAudioDuration(Math.max(1,Math.round((Date.now()-audioStartedAtRef.current)/1000)));
      };

      audioStartedAtRef.current=Date.now();
      recorder.start(250);
      setRecordingAudio(true);
    }catch(error){
      stopAudioTracks();
      mediaRecorderRef.current=null;
      setRecordingAudio(false);
      const denied=error instanceof DOMException&&["NotAllowedError","SecurityError"].includes(error.name);
      showToast(denied
        ?"Autorize o acesso ao microfone para gravar mensagens de áudio."
        :"Não foi possível acessar o microfone.");
    }
  };

  const sendRecordedAudio=async()=>{
    if(!recordedAudio||audioSendingRef.current)return;
    audioSendingRef.current=true;
    try{
      const result=await sendMessagePayload({payloadFiles:[recordedAudio]});
      if(result){
        clearRecordedAudio();
        await appendSentMessage(result);
      }
    }catch(error){
      showToast(errorMessage(error));
    }finally{
      audioSendingRef.current=false;
    }
  };

  const sendMessage=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!targetUid||busy)return;
    const form=event.currentTarget;
    const fd=new FormData(form);
    const text=String(fd.get("message")||"").trim();
    setBusy(true);
    try{
      const result=await sendMessagePayload({text,payloadFiles:files,postId:sharedPostId});
      if(!result)return;
      setFiles([]);setSharedPostId("");sessionStorage.removeItem("uorqui-message-post");
      form.reset();
      await appendSentMessage(result);
    }catch(error){showToast(errorMessage(error));}finally{setBusy(false);}
  };

  const decideRequest=async(accept:boolean)=>{
    if(!targetUid)return;
    try{
      await api(`/messages/${encodeURIComponent(targetUid)}/${accept?"accept":"request"}`,{method:accept?"POST":"DELETE"});
      if(!accept){setTargetUid("");setMessages([]);setConversation(null);}
      await loadConversations();
      if(accept)await loadMessages(targetUid);
    }catch(error){showToast(errorMessage(error));}
  };

  const target=conversations.find(c=>c.targetUid===targetUid);
  return <section className="page-section messages-page">
    <div className="messages-layout">
      <aside className={`messages-list ${targetUid?"conversation-open":""}`}>
        <div className="messages-list-head">
          <div><h2>Mensagens</h2><p>Conversas privadas</p></div>
          <label className="message-user-search">
            <Search size={16}/>
            <input value={userQuery} onChange={e=>setUserQuery(e.target.value)} placeholder="Buscar usuário" aria-label="Buscar usuário para mensagem"/>
          </label>
          {userQuery.trim().length>=2&&(
            <div className="message-user-results">
              {userSearchBusy&&<div className="message-user-search-status">Buscando…</div>}
              {!userSearchBusy&&userResults.map(person=>(
                <button type="button" key={person.uid} className="message-user-result" onClick={()=>openDirectUser(person)}>
                  <Avatar name={person.displayName||person.username||"Usuário"} mediaId={person.avatarMediaId} size={36}/>
                  <span><strong>{person.displayName||"Usuário"}</strong>{person.username&&<small>@{person.username.replace(/^@/,"")}</small>}</span>
                  <MessageSquareText size={16}/>
                </button>
              ))}
              {!userSearchBusy&&!userResults.length&&<div className="message-user-search-status">Nenhum usuário encontrado.</div>}
            </div>
          )}
        </div>
        {conversations.map(item=><button key={item.id} className={`message-contact ${targetUid===item.targetUid?"active":""}`} onClick={()=>setTargetUid(item.targetUid)}>
          <Avatar name={item.displayName} mediaId={item.avatarMediaId} size={42}/>
          <span className="message-contact-copy"><strong>{item.displayName}</strong><small>{item.lastMessagePreview||"Inicie uma conversa"}</small></span>
          {!!item.unreadCount&&<b className="message-unread">{item.unreadCount>99?"99+":item.unreadCount}</b>}
        </button>)}
        {nextOffset!==null&&<button className="text-button messages-more" onClick={()=>void loadConversations(nextOffset)}>Carregar mais</button>}
        {!conversations.length&&<div className="messages-empty">Suas conversas aparecerão aqui. Você pode iniciar uma conversa pelo perfil de outra pessoa.</div>}
      </aside>

      <section className={`message-thread ${targetUid?"open":""}`}>
        {!targetUid?<div className="messages-empty thread-empty"><MessageSquareText size={30}/><strong>Escolha uma conversa</strong></div>:<>
          <header className="message-thread-head">
            <button className="icon-btn message-mobile-back" onClick={()=>setTargetUid("")}><ArrowLeft size={19}/></button>
            <Avatar name={target?.displayName||"Usuário"} mediaId={target?.avatarMediaId} size={38}/>
            <div><strong>{target?.displayName||"Conversa"}</strong>{target?.username&&<small>@{target.username.replace(/^@/,"")}</small>}</div>
          </header>
          {conversation?.status==="pending"&&conversation.requestedBy!==me.uid&&<div className="message-request-banner"><span>Solicitação de mensagem</span><div><button className="btn small" onClick={()=>void decideRequest(true)}>Aceitar</button><button className="btn small secondary" onClick={()=>void decideRequest(false)}>Ignorar</button></div></div>}
          <div className="message-scroll">
            {nextBefore&&<button className="text-button messages-more" onClick={()=>void loadMessages(targetUid,nextBefore)}>Mensagens anteriores</button>}
            {messages.map(message=><article key={message.id} className={`message-bubble-row ${message.senderUid===me.uid?"mine":""}`}>
              <div className="message-bubble">
                {message.text&&<p>{message.text}</p>}
                {message.sharedPost&&<button className="message-shared-post" onClick={()=>window.dispatchEvent(new CustomEvent("uorqui:open-post-thread",{detail:{postId:message.sharedPost?.id,companyId:message.sharedPost?.companyId||""}}))}><Share2 size={15}/><span><strong>Publicação de {message.sharedPost.authorName||"usuário"}</strong><small>{message.sharedPost.text||"Abrir publicação"}</small></span></button>}
                {(message.attachments||[]).map(att=>{
                  const url=mediaUrls[att.id]||"";
                  if(String(att.contentType||"").startsWith("image/"))return url?<img key={att.id} className="message-media-image" src={url} alt={att.name||"Foto"}/>:null;
                  if(String(att.contentType||"").startsWith("video/"))return url?<video key={att.id} className="message-media-video" src={url} controls playsInline/>:null;
                  if(String(att.contentType||"").startsWith("audio/"))return url?<audio key={att.id} src={url} controls/>:null;
                  return url?<a key={att.id} href={url} download={att.name||"arquivo"}>{att.name||"Arquivo"}</a>:null;
                })}
                <time>{message.createdAt?new Date(message.createdAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):""}</time>
              </div>
            </article>)}
          </div>
          <form className="message-composer" onSubmit={sendMessage}>
            {sharedPostId&&<div className="message-pending-share"><Share2 size={14}/><span>Publicação pronta para enviar</span><button type="button" onClick={()=>{setSharedPostId("");sessionStorage.removeItem("uorqui-message-post");}}><X size={14}/></button></div>}
            {!!files.length&&<div className="message-file-preview">{files.map(file=><span key={file.name} className={file.type.startsWith("video/")?"is-video":"is-photo"}>{file.type.startsWith("video/")?<Video size={13}/>:<Camera size={13}/>}<b>{file.type.startsWith("video/")?"Vídeo":"Foto"}</b>{file.name}</span>)}</div>}
            <div className="message-compose-line">
              <div className="message-media-actions" aria-label="Adicionar mídia">
                <label className="message-media-action message-photo-video-action" title="Enviar foto ou vídeo" aria-label="Enviar foto ou vídeo">
                  <Camera size={23}/>
                  <Video className="message-video-mark" size={11}/>
                  <input hidden type="file" accept="image/*,video/*" multiple onChange={e=>setFiles(Array.from(e.target.files||[]).slice(0,4))}/>
                </label>
                <button
                  type="button"
                  className={`message-media-action message-audio-record ${recordingAudio?"recording":""}`}
                  title={recordingAudio?"Gravando áudio":"Gravar áudio"}
                  aria-label={recordingAudio?"Gravando áudio":"Gravar áudio"}
                  onClick={()=>void startAudioRecording()}
                  disabled={recordingAudio||Boolean(recordedAudio)}
                >
                  <Mic size={23}/>
                  {recordingAudio&&<span className="message-recording-dot"/>}
                </button>
              </div>
              <div className="message-text-wrap">
                {recordedAudio ? (
                  <div className="message-audio-preview">
                    <audio src={recordedAudioUrl} controls preload="metadata"/>
                    <span>{audioDuration}s</span>
                    <button type="button" className="message-audio-cancel" onClick={clearRecordedAudio} aria-label="Cancelar áudio"><X size={17}/></button>
                  </div>
                ) : (
                  <>
                    <textarea name="message" rows={1} maxLength={4000} placeholder={recordingAudio?"Gravando áudio…":"Mensagem…"} disabled={recordingAudio||Boolean(conversation?.status==="pending"&&conversation.requestedBy===me.uid)}/>
                    {recordingAudio&&<span className="message-recording-label">Gravando áudio…</span>}
                  </>
                )}
              </div>
              {recordingAudio ? (
                <button type="button" className="icon-btn message-stop-recording" onClick={stopAudioRecording} aria-label="Parar gravação"><Square size={17}/></button>
              ) : recordedAudio ? (
                <button type="button" className="icon-btn message-send" onClick={()=>void sendRecordedAudio()} disabled={audioSendingRef.current} aria-label="Enviar áudio"><Send size={21}/></button>
              ) : (
                <button className="icon-btn message-send" disabled={busy||Boolean(conversation?.status==="pending"&&conversation.requestedBy===me.uid)} aria-label="Enviar mensagem"><Send size={21}/></button>
              )}
            </div>
          </form>
        </>}
      </section>
    </div>
  </section>;
}

function NotificationsPage({
  data, refresh, showToast, onOpenPost, onNotificationRead, onNotificationDeleted,
  onOpenAdmin, onOpenJobs, onOpenCommunity, onOpenMessages
}: {
  data: BootstrapData;
  refresh: () => Promise<void>;
  showToast: (m: string) => void;
  onOpenPost: (notification: NotificationItem) => Promise<void>;
  onNotificationRead: (notificationId: string) => void;
  onNotificationDeleted: (notificationId: string) => void;
  onOpenAdmin: (companyId: string) => Promise<void>;
  onOpenJobs: (companyId: string) => Promise<void>;
  onOpenCommunity: (companyId: string, communityId: string) => Promise<void>;
  onOpenMessages: (uid: string) => void;
}) {
  const [pushState, setPushState] = useState<PushState>(() => currentPushState());
  const [pushBusy, setPushBusy] = useState(false);
  const [acceptingInviteId, setAcceptingInviteId] = useState("");
  const [deletingNotificationId, setDeletingNotificationId] = useState("");
  const [joinRequestBusy, setJoinRequestBusy] = useState("");
  const [deletionApprovalBusy, setDeletionApprovalBusy] = useState("");

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

  const respondJoinRequest = async (notification: NotificationItem, decision: "accept" | "reject") => {
    const requestId = notification.data?.requestId || "";
    if (!requestId || joinRequestBusy) return;
    setJoinRequestBusy(requestId);
    try {
      await api(`/community-join-requests/${encodeURIComponent(requestId)}/respond`, {
        method: "POST",
        body: JSON.stringify({ decision })
      });
      showToast(decision === "accept" ? "Participação aprovada." : "Solicitação recusada.");
      await refresh();
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setJoinRequestBusy("");
    }
  };

  const approveDeletion = async (notification: NotificationItem) => {
    const requestId = notification.data?.deletionRequestId || "";
    if (!requestId || deletionApprovalBusy) return;
    if (!confirm("Aprovar esta exclusão? Quando todos os administradores aprovarem, todo o conteúdo vinculado será apagado automaticamente.")) return;

    setDeletionApprovalBusy(requestId);
    try {
      const result = await api<{ deleted?: boolean; approvals?: number; requiredApprovals?: number }>(
        `/deletion-requests/${encodeURIComponent(requestId)}/approve`,
        { method: "POST" }
      );
      showToast(result.deleted
        ? "Todas as aprovações foram concluídas. A exclusão foi executada."
        : `Aprovação registrada (${result.approvals || 0}/${result.requiredApprovals || 0}).`);
      await refresh();
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setDeletionApprovalBusy("");
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
        onNotificationRead(notification.id);
      } catch {}
    }

    if (notification.data?.postId) {
      await onOpenPost(notification);
      return;
    }

    if (notification.data?.targetView === "admin" && notification.data.companyId) {
      await onOpenAdmin(notification.data.companyId);
      return;
    }

    if (notification.data?.targetView === "jobs") {
      await onOpenJobs(notification.data.companyId || "");
      return;
    }

    if (notification.data?.targetView === "community" && notification.data.communityId) {
      await onOpenCommunity(notification.data.companyId || "", notification.data.communityId);
      return;
    }

    if (notification.data?.targetView === "messages") {
      onOpenMessages(notification.data.conversationUid || "");
      return;
    }

    if (notification.data?.targetView === "profile" && notification.data.profileUid) {
      const params = new URLSearchParams(location.search);
      params.set("profile", notification.data.profileUid);
      history.pushState({}, "", `${location.pathname}?${params.toString()}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }

  };

  const removeNotification = async (notification: NotificationItem) => {
    if (!notification.id || deletingNotificationId) return;
    if (!confirm("Excluir esta notificação da central?")) return;
    setDeletingNotificationId(notification.id);
    try {
      await api(`/notifications/${encodeURIComponent(notification.id)}`, { method: "DELETE" });
      onNotificationDeleted(notification.id);
      showToast("Notificação excluída.");
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      setDeletingNotificationId("");
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
        {data.notifications.map((item, index) => {
          const pendingInvite = item.status === "pending" && ["company_invite", "community_invite"].includes(item.type);
          const pendingJoinRequest = item.status === "pending" && item.type === "community_join_request";
          const pendingDeletionApproval = item.status === "pending" && item.type === "deletion_approval_required";
          const canDelete = !(item.persistent && !item.read) && !pendingInvite && !pendingJoinRequest && !pendingDeletionApproval;
          return (
          <article
            className={`notification-page-item ${item.read ? "" : "unread"} ${item.persistent && !item.read ? "persistent" : ""}`}
            key={item.id || index}
            onClick={() => openNotification(item)}
          >
            <div className="notification-icon">
              {item.type === "deletion_approval_required" || item.type === "deletion_completed"
                ? <Trash2 size={19} />
                : item.type.includes("community") || item.type.includes("invite") || ["company_member_joined", "company_member_removed"].includes(item.type)
                ? <Users size={19} />
                : item.type === "job_posted"
                  ? <BriefcaseBusiness size={19} />
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

              {pendingJoinRequest && (
                <div className="notification-request-actions">
                  <button
                    className="btn small"
                    disabled={!!joinRequestBusy}
                    onClick={(event) => { event.stopPropagation(); void respondJoinRequest(item, "accept"); }}
                  >
                    <Check size={16} />
                    {joinRequestBusy === item.data?.requestId ? "Respondendo…" : "Aceitar"}
                  </button>
                  <button
                    className="btn secondary small"
                    disabled={!!joinRequestBusy}
                    onClick={(event) => { event.stopPropagation(); void respondJoinRequest(item, "reject"); }}
                  >
                    <X size={16} /> Recusar
                  </button>
                </div>
              )}

              {pendingDeletionApproval && (
                <div className="notification-request-actions deletion-approval-actions">
                  <button
                    className="btn danger small"
                    disabled={!!deletionApprovalBusy}
                    onClick={(event) => { event.stopPropagation(); void approveDeletion(item); }}
                  >
                    <Check size={16} />
                    {deletionApprovalBusy === item.data?.deletionRequestId ? "Aprovando…" : "Aprovar exclusão"}
                  </button>
                </div>
              )}

              {!!item.data?.postId && (
                <button
                  className="text-button notification-open-post"
                  onClick={(event) => {
                    event.stopPropagation();
                    void openNotification(item);
                  }}
                >
                  {item.data?.commentId ? "Abrir resposta" : "Abrir publicação"}
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

              {item.data?.targetView === "jobs" && (
                <button
                  className="text-button notification-open-post"
                  onClick={(event) => {
                    event.stopPropagation();
                    void openNotification(item);
                  }}
                >
                  Abrir vagas
                </button>
              )}
            </div>

            <div className="notification-page-actions">
              {canDelete && item.id && (
                <button
                  className="icon-btn notification-delete-button"
                  disabled={!!deletingNotificationId}
                  onClick={(event) => {
                    event.stopPropagation();
                    void removeNotification(item);
                  }}
                  aria-label="Excluir notificação"
                  title="Excluir notificação"
                >
                  <Trash2 size={15} />
                </button>
              )}
              {!item.read && <span className="unread-dot" aria-label="Não lida" />}
            </div>
          </article>
        );})}

        {!data.notifications.length && (
          <Empty title="Tudo em dia" text="Publicações relevantes, respostas, curtidas, convites e confirmações aparecerão aqui." />
        )}
      </div>
    </section>
  );
}

function Composer({ data, initialScope, initialCommunityId, initialTopicId, onClose, onDone, showToast }: {
  data: BootstrapData;
  initialScope?: "company" | "community" | "world";
  initialCommunityId?: string;
  initialTopicId?: string;
  onClose: () => void;
  onDone: (post: Post) => Promise<void> | void;
  showToast: (m: string) => void;
}) {
  const hasCompanyAccess = data.companies.length > 0;
  const hasCommunityAccess = data.communities.length > 0;
  const defaultScope: "company" | "community" | "world" =
    initialScope === "company" && hasCompanyAccess
      ? "company"
      : initialScope === "community" && hasCommunityAccess
        ? "community"
        : "world";
  const [scope, setScope] = useState<"company" | "community" | "world">(defaultScope);
  const [type, setType] = useState<"post" | "question" | "announcement" | "poll" | "event">("post");
  const [communityId, setCommunityId] = useState(initialCommunityId || data.communities[0]?.id || "");
  const [topicId, setTopicId] = useState(initialTopicId || "");
  const [composerTopics, setComposerTopics] = useState<CommunityTopic[]>([]);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [pollOptions, setPollOptions] = useState(["", ""]);

  useEffect(() => {
    if (type === "announcement" && hasCompanyAccess) setScope("company");
    if (type === "announcement" && !hasCompanyAccess) setType("post");
  }, [type, hasCompanyAccess]);

  useEffect(() => {
    if (scope !== "community" || !communityId) {
      setComposerTopics([]);
      setTopicId("");
      return;
    }
    api<{ topics: CommunityTopic[] }>(`/communities/${encodeURIComponent(communityId)}/topics`)
      .then((result) => {
        setComposerTopics(result.topics || []);
        if (initialTopicId && result.topics?.some(topic => topic.id === initialTopicId)) setTopicId(initialTopicId);
      })
      .catch(() => setComposerTopics([]));
  }, [scope, communityId, initialTopicId]);

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
        if (scope === "company" && data.selectedCompanyId) qs.set("companyId", data.selectedCompanyId);
        if (scope === "community") {
          const targetCompanyId = data.communityMap[communityId]?.companyId || "";
          if (targetCompanyId) qs.set("companyId", targetCompanyId);
          qs.set("communityId", communityId);
        }
        const uploaded = await api<{ media: { id: string } }>(`/media/upload?${qs}`, {
          method: "POST", headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": file.name }, body: file
        });
        attachmentIds.push(uploaded.media.id);
      }

      const result = await api<{ post: Post }>("/posts", {
        method: "POST",
        body: JSON.stringify({
          scope, type, text, title,
          companyId: scope === "company"
            ? data.selectedCompanyId
            : scope === "community"
              ? (data.communityMap[communityId]?.companyId || "")
              : "",
          communityId: scope === "community" ? communityId : "",
          topicId: scope === "community" ? topicId : "",
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
          <button type="button" className={scope === "world" ? "selected" : ""} onClick={() => setScope("world")} disabled={type === "announcement"}><Globe2 size={17} /> Mundo</button>
          {hasCommunityAccess && (
            <button type="button" className={scope === "community" ? "selected" : ""} onClick={() => setScope("community")} disabled={type === "announcement"}><Users size={17} /> Comunidade</button>
          )}
          {hasCompanyAccess && (
            <button type="button" className={scope === "company" ? "selected" : ""} onClick={() => setScope("company")} disabled={type === "announcement"}><Building2 size={17} /> Empresa</button>
          )}
        </div>

        {scope === "community" && <>
          <label><span>Comunidade</span><select value={communityId} onChange={(e) => { setCommunityId(e.target.value); setTopicId(""); }}>{data.communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          {!!composerTopics.length && <label><span>{data.communityMap[communityId]?.companyId ? "Setor" : "Assunto"} (opcional)</span><select value={topicId} onChange={(e) => setTopicId(e.target.value)}><option value="">Geral</option>{composerTopics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label>}
        </>}

        <div className="type-row">
          <button type="button" className={type === "post" ? "selected" : ""} onClick={() => setType("post")}><MessageSquareText size={16} /> Post</button>
          <button type="button" className={type === "question" ? "selected" : ""} onClick={() => setType("question")}><FileQuestion size={16} /> Pergunta</button>
          <button type="button" className={type === "poll" ? "selected" : ""} onClick={() => setType("poll")}><BarChart3 size={16} /> Enquete</button>
          <button type="button" className={type === "event" ? "selected" : ""} onClick={() => setType("event")}><CalendarDays size={16} /> Evento</button>
          {data.canAdmin && hasCompanyAccess && <button type="button" className={type === "announcement" ? "selected" : ""} onClick={() => setType("announcement")}><Megaphone size={16} /> Comunicado</button>}
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
