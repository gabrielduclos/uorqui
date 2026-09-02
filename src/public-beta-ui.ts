export {};

const COMING_SOON_CLASS = "uorqui-public-beta-coming-soon";
const BADGE_CLASS = "uorqui-public-beta-badge";

const style = document.createElement("style");
style.dataset.uorquiPublicBeta = "1";
style.textContent = `
.${COMING_SOON_CLASS}{opacity:.5!important;cursor:not-allowed!important;filter:saturate(.55)}
.${COMING_SOON_CLASS}:hover{transform:none!important;background:inherit}
.${BADGE_CLASS}{display:inline-flex;align-items:center;margin-left:7px;padding:2px 6px;border-radius:999px;font-size:9px!important;font-weight:800;line-height:1.2;letter-spacing:.02em;text-transform:uppercase;background:#eef0f3;color:#686d75;white-space:nowrap}
.mobile-plan-button.${COMING_SOON_CLASS}{position:relative;overflow:visible}
.mobile-plan-button.${COMING_SOON_CLASS}::after{content:"Em breve";position:absolute;right:-3px;top:-9px;z-index:2;padding:2px 4px;border-radius:999px;background:#eef0f3;color:#686d75;font:700 7px/1.1 system-ui,sans-serif;white-space:nowrap;border:1px solid rgba(0,0,0,.06)}
.uorqui-public-beta-banner{display:flex;gap:10px;align-items:flex-start;margin:0 0 16px;padding:12px 14px;border:1px solid #e2e5e9;border-radius:12px;background:#f7f8fa;color:#555d66}
.uorqui-public-beta-banner strong{display:block;color:#24282d;margin-bottom:2px}
.uorqui-public-beta-banner p{margin:0;font-size:13px;line-height:1.45}
`;
document.head.appendChild(style);

function badge() {
  const item = document.createElement("span");
  item.className = BADGE_CLASS;
  item.textContent = "Em breve";
  item.setAttribute("aria-hidden", "true");
  return item;
}

function disableButton(button: HTMLButtonElement, label: string) {
  button.disabled = true;
  button.classList.add(COMING_SOON_CLASS);
  button.setAttribute("aria-disabled", "true");
  button.title = `${label} — Em breve`;
}

function syncCreatorNavigation() {
  document.querySelectorAll<HTMLButtonElement>(".side-nav button").forEach((button) => {
    const text = button.querySelector("span")?.textContent?.trim() || "";
    if (text !== "Criadores") return;
    disableButton(button, "Criadores");
    if (!button.querySelector(`.${BADGE_CLASS}`)) button.appendChild(badge());
  });

  const mobile = document.querySelector<HTMLButtonElement>(".mobile-plan-button");
  if (mobile) {
    disableButton(mobile, "Criadores");
    mobile.setAttribute("aria-label", "Criadores — Em breve");
  }
}

function syncPaymentEntryPoints() {
  document.querySelectorAll<HTMLButtonElement>(".admin-plan-button").forEach((button) => {
    disableButton(button, "Planos e pagamentos");
    if (!button.querySelector(`.${BADGE_CLASS}`)) button.appendChild(badge());
  });

  document.querySelectorAll<HTMLButtonElement>(".upgrade-box button, .creator-focus-page button").forEach((button) => {
    // Nesta fase não existe ação de assinatura, ativação ou checkout. Mantemos
    // a apresentação do recurso, mas nenhuma mutação financeira fica clicável.
    disableButton(button, "Monetização");
    if (!button.querySelector(`.${BADGE_CLASS}`)) button.appendChild(badge());
  });
}

function syncCreatorPage() {
  const page = document.querySelector<HTMLElement>(".creator-focus-page");
  if (!page) return;

  const heading = page.querySelector<HTMLElement>(".plans-heading");
  if (heading && !page.querySelector(".uorqui-public-beta-banner")) {
    const banner = document.createElement("div");
    banner.className = "uorqui-public-beta-banner";
    banner.innerHTML = `<div><strong>Criadores — Em breve</strong><p>Estamos testando o Uorqui de forma aberta. Assinaturas, monetização e pagamentos ficam desativados durante o beta público.</p></div>`;
    heading.insertAdjacentElement("afterend", banner);
  }
}

function syncPublicBetaUi() {
  syncCreatorNavigation();
  syncPaymentEntryPoints();
  syncCreatorPage();
}

let queued = false;
function scheduleSync() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    syncPublicBetaUi();
  });
}

const observer = new MutationObserver(scheduleSync);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("load", scheduleSync, { once: true });
syncPublicBetaUi();
