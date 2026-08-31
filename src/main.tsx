import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { SocialLayer } from "./social";
import "./comment-replies.css";
import "./product-v121.css";
import "./product-v121-enhancements.css";
import "./product-v121-media.css";
import "./mobile-surface-v121.css";
import "./pull-refresh-v123.css";
import "./reply-to-reply-v123.css";
import "./login-mobile-v123.css";
import "./product-v121";
import "./product-v121-enhancements";
import "./company-lookup";
import "./product-v121-media";
import "./mention-label-v121";
import "./notification-router-v121";
import "./pull-refresh-v123";
import "./reply-to-reply-v123";
import "./login-logo-v123";

const PRODUCT_VERSION = "1.3.4-runtime-diagnostics";

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
        <div style={{ maxWidth: 720, margin: "48px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h1 style={{ fontSize: 22, marginBottom: 10 }}>Erro ao abrir o Uorqui</h1>
          <p style={{ marginBottom: 12 }}>A aplicação encontrou um erro de execução após o login.</p>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 12, background: "#f5f5f5", borderRadius: 8 }}>
            {this.state.error.name}: {this.state.error.message}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: "10px 14px" }}>
            Recarregar
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

createRoot(document.getElementById("root")!).render(
  <RuntimeErrorBoundary>
    <StrictMode>
      <App />
      <SocialLayer />
    </StrictMode>
  </RuntimeErrorBoundary>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {});

    let reloadingForServiceWorker = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadingForServiceWorker) return;
      reloadingForServiceWorker = true;
      window.location.reload();
    });
  });
}

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
