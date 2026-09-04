export {};

const GENERIC = "Não foi possível concluir agora. Tente novamente.";
const TECHNICAL = /(firebase|firestore|cloudflare|\bworker\b|service account|\bbackend\b|\bapi\b|http\s*\d{3}|resource[_ -]?exhausted|permission[_ -]?denied|quota|subrequests?|wrangler|\bbinding\b|bootstrap|social\/feed|referenceerror|typeerror|notfounderror|stack trace|index\.js:\d+|\bvapid\b|workers ai|service credentials|oauth)/i;
const USER_ERROR_SELECTORS = [
  ".toast",
  ".form-error",
  ".auth-error",
  ".error-message",
  "[role='alert']",
  ".uorqui-message-local-toast"
].join(",");

function safeText(value: string) {
  const text = String(value || "").trim();
  return TECHNICAL.test(text) ? GENERIC : text;
}

function sanitizeElement(element: Element) {
  if (!(element instanceof HTMLElement)) return;
  if (!element.matches(USER_ERROR_SELECTORS)) return;
  const text = element.textContent || "";
  if (!TECHNICAL.test(text)) return;
  element.textContent = GENERIC;
}

function sanitizeTree(root: Node) {
  if (root instanceof Element) {
    sanitizeElement(root);
    root.querySelectorAll(USER_ERROR_SELECTORS).forEach(sanitizeElement);
  }
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === "characterData") {
      const parent = mutation.target.parentElement;
      if (parent) sanitizeElement(parent);
    }
    for (const node of mutation.addedNodes) sanitizeTree(node);
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

const nativeAlert = window.alert.bind(window);
window.alert = (message?: any) => nativeAlert(safeText(String(message ?? "")));

sanitizeTree(document.documentElement);
