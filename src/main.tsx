import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./comment-replies.css";
import "./product-v121.css";
import "./product-v121-enhancements.css";
import "./product-v121-media.css";
import "./mobile-surface-v121.css";
import "./product-v121";
import "./product-v121-enhancements";
import "./company-lookup";
import "./product-v121-media";
import "./mention-label-v121";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

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
