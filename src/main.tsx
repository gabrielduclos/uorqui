import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import DemoApp from "./DemoApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));


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
