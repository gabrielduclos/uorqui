import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload
} from "firebase/messaging";
import { signOut } from "firebase/auth";
import { auth, firebaseApp } from "./firebase";
import { api } from "./api";

declare global {
  interface Window {
    UORQUI_PUSH_CONFIG?: {
      vapidKey?: string;
    };
  }
}

export type PushState =
  | "unsupported"
  | "not_configured"
  | "default"
  | "denied"
  | "granted";

function vapidKey() {
  return String(window.UORQUI_PUSH_CONFIG?.vapidKey || "").trim();
}

export function pushConfigurationReady() {
  const key = vapidKey();
  return Boolean(key && !key.includes("COLE_AQUI"));
}

export function currentPushState(): PushState {
  if (
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return "unsupported";
  }

  if (!pushConfigurationReady()) return "not_configured";
  return Notification.permission;
}

async function messagingSupported() {
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

async function serviceWorkerRegistration() {
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return registration;
}

async function obtainAndRegisterToken() {
  if (!(await messagingSupported())) {
    throw new Error("Este navegador não oferece suporte ao Firebase Cloud Messaging.");
  }

  const registration = await serviceWorkerRegistration();
  const messaging = getMessaging(firebaseApp);
  const token = await getToken(messaging, {
    vapidKey: vapidKey(),
    serviceWorkerRegistration: registration
  });

  if (!token) throw new Error("O navegador não retornou um token de notificações.");

  await api("/push/register", {
    method: "POST",
    body: JSON.stringify({
      token,
      platform: "web",
      userAgent: navigator.userAgent
    })
  });

  localStorage.setItem("uorqui-push-token", token);
  return token;
}

export async function enablePushNotifications(): Promise<PushState> {
  const state = currentPushState();

  if (state === "unsupported" || state === "not_configured" || state === "denied") {
    return state;
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

  if (permission !== "granted") return permission;

  await obtainAndRegisterToken();
  return "granted";
}

export async function syncPushRegistration() {
  if (currentPushState() !== "granted") return false;
  await obtainAndRegisterToken();
  return true;
}

async function showForegroundNotification(payload: MessagePayload) {
  const data = payload.data || {};
  const title = payload.notification?.title || data.title || "Uorqui";
  const body = payload.notification?.body || data.body || "Você tem uma nova atualização.";
  const notificationId = data.notificationId || `${Date.now()}`;
  const type = data.type || "";
  const registration = await navigator.serviceWorker.ready;

  await registration.showNotification(title, {
    body,
    icon: "/assets/uorqui-icon-192-v1215.png",
    badge: "/assets/uorqui-favicon.png",
    tag: `uorqui-${notificationId}`,
    renotify: type === "read_required",
    requireInteraction: type === "read_required",
    data: {
      url: data.url || "/",
      notificationId,
      type
    }
  });
}

export async function setupForegroundPush(
  handler: (payload: MessagePayload) => void
): Promise<() => void> {
  if (currentPushState() !== "granted" || !(await messagingSupported())) {
    return () => {};
  }

  const messaging = getMessaging(firebaseApp);
  return onMessage(messaging, (payload) => {
    // Com o Uorqui aberto, não chama o callback antigo que executava um
    // refresh global com tela de carregamento. A interface já recebe as
    // mudanças pelo realtime; o clique no push é roteado internamente pelo SW.
    void showForegroundNotification(payload).catch(() => handler(payload));
  });
}

export async function unregisterPushBeforeLogout() {
  const savedToken = localStorage.getItem("uorqui-push-token") || "";

  try {
    if (savedToken && auth.currentUser) {
      await api("/push/register", {
        method: "DELETE",
        body: JSON.stringify({ token: savedToken })
      });
    }
  } catch {}

  try {
    if (await messagingSupported()) {
      await deleteToken(getMessaging(firebaseApp));
    }
  } catch {}

  localStorage.removeItem("uorqui-push-token");
  await signOut(auth);
}
