import { Component, StrictMode, useState, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { SocialLayer } from "./social";
import { InstagramMessagesOverlay } from "./messages-instagram";
import "./comment-replies.css";
import "./product-v121.css";
import "./product-v121-enhancements.css";
import "./product-v121-media.css";
import "./mobile-surface-v121.css";
import "./pull-refresh-v123.css";
import "./reply-to-reply-v123.css";
import "./login-mobile-v123.css";
import "./comment-time-v124.css";
import "./product-v125.css";
import "./messages-instagram.css";
import "./messages-instagram-mobile-header.css";
import "./product-v121";
import "./product-v121-enhancements";
import "./company-lookup";
import "./product-v121-media";
import "./mention-label-v121";
import "./notification-router-v121";
import "./pull-refresh-v123";
import "./reply-to-reply-v123";
import "./login-logo-v123";
import "./comment-time-v124";
import "./composer-media-preview-v125";
import "./post-topic-v125";
import "./superadmin-growth-v125";
import "./public-beta-ui";
import "./superadmin-official-community-access";
import "./community-notification-toggle";
import "./public-post-view";
import "./message-unread-badge";
import "./message-realtime";
import "./private-community-discovery";
import "./generic-error-ui";
import "./post-message-share-modal";
import "./external-share-preview";
import "./feed-membership-only";
import "./feed-only-header-scroll";
import "./news-read-more";

const PRODUCT_VERSION = "1.3.25-message-header-stable";

class RuntimeErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uorqui runtime error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ maxWidth: 720, margin: "48px auto", padding: 24, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
          <h1 style={{ fontSize: 22, marginBottom: 10 }}>Não foi possível abrir o Uorqui</h1>
          <p style={{ marginBottom: 12 }}>Não foi possível concluir agora. Tente novamente.</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: "10px 14px" }}>
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

window.addEventListener("error", (event) => {
  console.error("Uorqui window error", event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("Uorqui unhandled rejection", event.reason);
});

const COOKIE_CONSENT_KEY = "uorqui-cookie-consent-v1";

type CookieConsentChoice = "all" | "necessary";

function CookieConsentBanner() {
  const [choice, setChoice] = useState<CookieConsentChoice | null>(() => {
    try {
      const saved = localStorage.getItem(COOKIE_CONSENT_KEY);
      return saved === "all" || saved === "necessary" ? saved : null;
    } catch {
      return null;
    }
  });

  if (choice) return null;

  const save = (next: CookieConsentChoice) => {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, next);
      localStorage.setItem("uorqui-cookie-consent-at", new Date().toISOString());
    } catch {}
    window.dispatchEvent(new CustomEvent("uorqui:cookie-consent", { detail: { choice: next } }));
    setChoice(next);
  };

  return (
    <aside className="cookie-consent" role="dialog" aria-live="polite" aria-label="Preferências de privacidade">
      <div className="cookie-consent-copy">
        <strong>Privacidade no Uorqui</strong>
        <p>
          Usamos cookies e tecnologias semelhantes necessárias para login, segurança e funcionamento da rede.
          Com sua autorização, também poderemos usar recursos opcionais para melhorar a experiência.
        </p>
      </div>
      <div className="cookie-consent-actions">
        <button className="btn secondary" onClick={() => save("necessary")}>Somente necessários</button>
        <button className="btn" onClick={() => save("all")}>Aceitar todos</button>
      </div>
    </aside>
  );
}

createRoot(document.getElementById("root")!).render(
  <RuntimeErrorBoundary>
    <StrictMode>
      <App />
      <SocialLayer />
      <InstagramMessagesOverlay />
      <CookieConsentBanner />
    </StrictMode>
  </RuntimeErrorBoundary>
);

function syncVisibleVersion() {
  document.querySelectorAll<HTMLElement>(".side-card.compact strong").forEach((element) => {
    const next = `Uorqui ${PRODUCT_VERSION}`;
    if ((element.textContent || "").trim().startsWith("Uorqui ") && element.textContent !== next) {
      element.textContent = next;
    }
  });
}

const versionObserver = new MutationObserver(syncVisibleVersion);
versionObserver.observe(document.documentElement, { childList: true, subtree: true });
syncVisibleVersion();

// Mention guidance without adding another data fetch to the composer.
document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  if (target.closest(".inline-comment-form")) {
    target.placeholder = "Escreva uma resposta… Use @nome para mencionar";
    return;
  }
  if (target.closest(".uorqui-edit-form")) {
    target.placeholder = "Edite a publicação… Use @nome para mencionar";
    return;
  }
  if (target.closest(".composer-form") && !target.placeholder.includes("@")) {
    target.placeholder = target.placeholder
      ? `${target.placeholder} · use @nome para mencionar`
      : "Escreva sua publicação… use @nome para mencionar";
  }
});

// Prevent accidental rapid double-clicks on write/action buttons. Navigation
// remains instant; API-level mutation deduplication is the second line of defense.
document.addEventListener("click", (event) => {
  const target = event.target as Element | null;
  const button = target?.closest("button") as HTMLButtonElement | null;
  if (!button) return;

  const shouldLock =
    button.classList.contains("btn") ||
    button.classList.contains("post-delete") ||
    Boolean(button.closest(".post-actions")) ||
    button.dataset.lockAction === "true";

  if (!shouldLock || button.disabled) return;

  if (button.dataset.uorquiLocked === "1") {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  button.dataset.uorquiLocked = "1";
  button.setAttribute("aria-busy", "true");

  window.setTimeout(() => {
    if (!button.isConnected) return;
    button.removeAttribute("aria-busy");
    delete button.dataset.uorquiLocked;
  }, 900);
}, true);
