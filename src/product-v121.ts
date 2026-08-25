import { api } from "./lib/api";

const PRODUCT_VERSION = "1.2.21";
const PREMIUM_PRICE = 99.9;
const ENTERPRISE_EXTRA = 19.9;
const PREMIUM_INCLUDED_USERS = 10;

type TierSnapshot = {
  tier: "free" | "premium" | "enterprise";
  activeUsers: number;
  memberLimit: number | null;
  basePrice: number;
  premiumPrice: number;
  includedUsers: number;
  extraUserPrice: number;
  monthlyPrice: number;
  billingStatus?: string;
  owner?: boolean;
};

let scheduled = false;
let tierCache: { companyId: string; at: number; value: TierSnapshot | null } = {
  companyId: "",
  at: 0,
  value: null,
};

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

function setTextIfChanged(element: Element | null, value: string) {
  if (element && element.textContent !== value) element.textContent = value;
}

function replaceOwnText(element: Element | null, value: string) {
  if (!element) return;
  const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  const next = ` ${value}`;
  if (textNode) {
    if (textNode.textContent !== next) textNode.textContent = next;
  } else {
    element.appendChild(document.createTextNode(next));
  }
}

function companyId() {
  return localStorage.getItem("uorqui-company") || "";
}

function hideWorldControls() {
  document
    .querySelectorAll<HTMLElement>(
      ".composer-form .audience-row button, .jobs-tabs button, .job-audience-fieldset button, .topbar .tabs button",
    )
    .forEach((button) => {
      const label = (button.textContent || "").trim().toLowerCase();
      if (label.includes("mundo") || label.includes("para o mundo")) {
        button.style.display = "none";
        button.setAttribute("aria-hidden", "true");
      }
    });
}

function updatePlanCopy() {
  const grid = document.querySelector<HTMLElement>(".plans-grid");
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll<HTMLElement>(".plan-card"));
  const freeCard = cards.find((card) => card.querySelector("h3")?.textContent?.trim() === "Free");
  const premiumCard = cards.find((card) => card.querySelector("h3")?.textContent?.trim() === "Premium");

  if (freeCard) {
    freeCard.querySelectorAll(".plan-features li").forEach((item) => {
      const value = item.textContent || "";
      if (/Até 5 pessoas/i.test(value)) replaceOwnText(item, "Até 4 pessoas na empresa");
      if (/Busca, notificações push e Mundo/i.test(value)) replaceOwnText(item, "Busca e notificações push");
    });
  }

  if (premiumCard) {
    const price = premiumCard.querySelector<HTMLElement>(".plan-price");
    if (price) {
      replaceOwnText(price, money(PREMIUM_PRICE));
      setTextIfChanged(price.querySelector("small"), "/mês por empresa");
    }

    setTextIfChanged(
      premiumCard.querySelector(".plan-description"),
      "Tudo do Free, com mais capacidade para equipes e comunidades.",
    );

    premiumCard.querySelectorAll(".plan-features li").forEach((item) => {
      const value = item.textContent || "";
      if (/Mais de 5 pessoas/i.test(value)) replaceOwnText(item, "Até 10 pessoas na empresa");
    });
  }

  document.querySelectorAll<HTMLElement>(".upgrade-box small").forEach((item) => {
    if (/Mais de 5 membros/i.test(item.textContent || "")) {
      setTextIfChanged(
        item,
        "Premium libera até 10 usuários. Para equipes maiores, use o Enterprise.",
      );
    }
  });
}

function enterpriseCard() {
  const grid = document.querySelector<HTMLElement>(".plans-grid");
  if (!grid) return null;

  let card = grid.querySelector<HTMLElement>("[data-uorqui-enterprise-card]");
  if (card) return card;

  card = document.createElement("article");
  card.className = "plan-card uorqui-enterprise-card";
  card.dataset.uorquiEnterpriseCard = "1";
  card.innerHTML = `
    <div class="plan-card-head">
      <div>
        <span class="plan-eyebrow">Escala</span>
        <h3>Enterprise</h3>
      </div>
      <strong class="plan-price" data-enterprise-price>${money(PREMIUM_PRICE)}<small>/mês</small></strong>
    </div>
    <p class="plan-description">Para empresas com mais de 10 usuários ativos.</p>
    <ul class="plan-features">
      <li>✓ Tudo do Premium</li>
      <li>✓ 10 usuários incluídos na base</li>
      <li>✓ ${money(ENTERPRISE_EXTRA)} por usuário ativo adicional</li>
      <li>✓ Sem limite fixo de usuários</li>
      <li>✓ Cobrança acompanha os acessos ativos da empresa</li>
    </ul>
    <small class="plan-enterprise-note">Usuário ativo é o colaborador que permanece com acesso habilitado à empresa. Usuários removidos deixam de entrar na próxima atualização da cobrança.</small>
    <div class="plan-enterprise-actions">
      <button type="button" class="btn" data-enterprise-action>Carregando…</button>
    </div>
    <small class="plan-enterprise-status" data-enterprise-status></small>
  `;
  grid.appendChild(card);
  return card;
}

async function loadTier(force = false) {
  const id = companyId();
  if (!id) return null;
  if (
    !force &&
    tierCache.companyId === id &&
    tierCache.value &&
    Date.now() - tierCache.at < 5000
  ) {
    return tierCache.value;
  }

  const value = await api<TierSnapshot>(`/companies/${encodeURIComponent(id)}/billing/tier`);
  tierCache = { companyId: id, at: Date.now(), value };
  return value;
}

function status(card: HTMLElement, message: string, error = false) {
  const target = card.querySelector<HTMLElement>("[data-enterprise-status]");
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("error", error);
}

function applyTier(card: HTMLElement, snapshot: TierSnapshot) {
  const price = card.querySelector<HTMLElement>("[data-enterprise-price]");
  if (price) {
    price.innerHTML = `${money(snapshot.monthlyPrice || PREMIUM_PRICE)}<small>/mês hoje</small>`;
  }

  const action = card.querySelector<HTMLButtonElement>("[data-enterprise-action]");
  if (!action) return;

  card.classList.toggle("current", snapshot.tier === "enterprise");

  const premiumCard = Array.from(document.querySelectorAll<HTMLElement>(".plans-grid .plan-card"))
    .find((item) => item.querySelector("h3")?.textContent?.trim() === "Premium");
  if (premiumCard && snapshot.tier === "enterprise") premiumCard.classList.remove("current");

  const pill = document.querySelector<HTMLElement>(".plans-company-summary .plan-pill");
  if (pill && snapshot.tier === "enterprise") replaceOwnText(pill, "Enterprise");

  if (!snapshot.owner) {
    action.disabled = true;
    action.textContent = snapshot.tier === "enterprise" ? "Enterprise ativo" : "Somente o proprietário pode ativar";
    return;
  }

  if (snapshot.tier === "free") {
    action.disabled = true;
    action.textContent = "Ative o Premium primeiro";
    return;
  }

  if (snapshot.tier === "enterprise") {
    action.disabled = true;
    action.textContent = "Plano atual";

    if (snapshot.activeUsers <= PREMIUM_INCLUDED_USERS) {
      let back = card.querySelector<HTMLButtonElement>("[data-enterprise-back]");
      if (!back) {
        back = document.createElement("button");
        back.type = "button";
        back.className = "btn secondary";
        back.dataset.enterpriseBack = "1";
        back.textContent = "Voltar ao Premium";
        card.querySelector(".plan-enterprise-actions")?.appendChild(back);
      }
      back.onclick = async () => {
        if (!confirm("Voltar ao Premium? O plano ficará limitado a 10 usuários ativos e a assinatura volta para R$ 99,90/mês.")) return;
        back!.disabled = true;
        status(card, "Atualizando plano…");
        try {
          await api(`/companies/${encodeURIComponent(companyId())}/billing/enterprise/cancel`, { method: "POST" });
          tierCache.value = null;
          location.reload();
        } catch (error) {
          back!.disabled = false;
          status(card, error instanceof Error ? error.message : "Não foi possível alterar o plano.", true);
        }
      };
    }
    return;
  }

  card.querySelector("[data-enterprise-back]")?.remove();
  action.disabled = false;
  action.textContent = "Ativar Enterprise";
  action.onclick = async () => {
    if (!confirm(`Ativar o Enterprise? A base continua em ${money(PREMIUM_PRICE)}/mês e cada usuário ativo acima de 10 acrescenta ${money(ENTERPRISE_EXTRA)}/mês.`)) return;
    action.disabled = true;
    status(card, "Atualizando assinatura…");
    try {
      await api(`/companies/${encodeURIComponent(companyId())}/billing/enterprise`, { method: "POST" });
      tierCache.value = null;
      location.reload();
    } catch (error) {
      action.disabled = false;
      status(card, error instanceof Error ? error.message : "Não foi possível ativar o Enterprise.", true);
    }
  };
}

async function updateEnterprisePlan() {
  const card = enterpriseCard();
  if (!card) return;
  try {
    const snapshot = await loadTier();
    if (snapshot) applyTier(card, snapshot);
  } catch (error) {
    status(card, error instanceof Error ? error.message : "Não foi possível carregar o Enterprise.", true);
  }
}

function enhance() {
  scheduled = false;
  document.documentElement.dataset.uorquiVersion = PRODUCT_VERSION;
  hideWorldControls();
  updatePlanCopy();
  void updateEnterprisePlan();
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(enhance);
}

const observer = new MutationObserver(scheduleEnhance);
observer.observe(document.documentElement, { childList: true, subtree: true });
scheduleEnhance();
