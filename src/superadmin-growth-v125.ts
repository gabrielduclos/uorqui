export {};

type CreatorMetric = {
  uid?: string;
  displayName?: string;
  email?: string;
  activeSubscribers?: number;
  grossRevenue?: number;
  platformRevenue?: number;
  communityCount?: number;
  createdAt?: string;
};

type GrowthMetrics = {
  totalCreators?: number;
  activeCreatorCommunities?: number;
  activeCreatorSubscriptions?: number;
  creatorGrossRevenue?: number;
  creatorPlatformRevenue?: number;
  creatorNetRevenue?: number;
  creatorPaidOut?: number;
  creatorPendingPayout?: number;
  creatorPlatformFeePercent?: number;
  paidPremiumCompanies?: number;
};

type OverviewPayload = {
  metrics?: GrowthMetrics;
  creators?: CreatorMetric[];
};

let latestOverview: OverviewPayload | null = null;
let renderingGrowthPanel = false;
const originalSuperadminFetch = window.fetch.bind(window);

window.fetch = async (...args) => {
  const response = await originalSuperadminFetch(...args);
  try {
    const input = args[0];
    const rawUrl = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.origin);
    if (response.ok && url.pathname.endsWith("/api/superadmin/overview")) {
      const payload = await response.clone().json().catch(() => null) as OverviewPayload | null;
      if (payload) {
        latestOverview = payload;
        queueMicrotask(renderGrowthPanel);
      }
    }
  } catch {}
  return response;
};

function money(value = 0) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

function metricCard(label: string, value: string, detail: string) {
  const article = document.createElement("article");
  article.className = "superadmin-growth-metric";

  const span = document.createElement("span");
  span.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  const small = document.createElement("small");
  small.textContent = detail;

  article.append(span, strong, small);
  return article;
}

function creatorRow(creator: CreatorMetric) {
  const row = document.createElement("article");
  row.className = "superadmin-creator-row-v125";

  const identity = document.createElement("div");
  identity.className = "superadmin-creator-identity-v125";
  const name = document.createElement("strong");
  name.textContent = creator.displayName || "Criador";
  const email = document.createElement("small");
  email.textContent = creator.email || "Conta de criador";
  identity.append(name, email);

  const subscriptions = document.createElement("div");
  subscriptions.className = "superadmin-creator-stat-v125";
  const subscriptionValue = document.createElement("strong");
  subscriptionValue.textContent = String(Number(creator.activeSubscribers || 0));
  const subscriptionLabel = document.createElement("span");
  subscriptionLabel.textContent = "assinantes ativos";
  subscriptions.append(subscriptionValue, subscriptionLabel);

  const communities = document.createElement("div");
  communities.className = "superadmin-creator-stat-v125";
  const communityValue = document.createElement("strong");
  communityValue.textContent = String(Number(creator.communityCount || 0));
  const communityLabel = document.createElement("span");
  communityLabel.textContent = "comunidades";
  communities.append(communityValue, communityLabel);

  const gross = document.createElement("div");
  gross.className = "superadmin-creator-stat-v125 money";
  const grossStrong = document.createElement("strong");
  grossStrong.textContent = money(creator.grossRevenue || 0);
  const grossLabel = document.createElement("span");
  grossLabel.textContent = "receita bruta";
  gross.append(grossStrong, grossLabel);

  const platform = document.createElement("div");
  platform.className = "superadmin-creator-stat-v125 money";
  const platformStrong = document.createElement("strong");
  platformStrong.textContent = money(creator.platformRevenue || 0);
  const platformLabel = document.createElement("span");
  platformLabel.textContent = "receita Uorqui";
  platform.append(platformStrong, platformLabel);

  row.append(identity, subscriptions, communities, gross, platform);
  return row;
}

function overviewSignature(payload: OverviewPayload) {
  const metrics = payload.metrics || {};
  const creators = Array.isArray(payload.creators) ? payload.creators : [];
  return JSON.stringify({
    metrics,
    creators: creators.map(item => [
      item.uid,
      item.activeSubscribers,
      item.grossRevenue,
      item.platformRevenue,
      item.communityCount
    ])
  });
}

function renderGrowthPanel() {
  if (renderingGrowthPanel) return;
  const page = document.querySelector<HTMLElement>(".superadmin-page");
  if (!page || !latestOverview?.metrics) return;

  const signature = overviewSignature(latestOverview);
  const current = page.querySelector<HTMLElement>(".superadmin-growth-v125");
  if (current?.dataset.signature === signature) return;

  renderingGrowthPanel = true;
  try {
    current?.remove();

    const metrics = latestOverview.metrics;
    const creators = Array.isArray(latestOverview.creators) ? [...latestOverview.creators] : [];
    creators.sort((a, b) => Number(b.grossRevenue || 0) - Number(a.grossRevenue || 0));
    const creatorsWithSubscribers = creators.filter(item => Number(item.activeSubscribers || 0) > 0).length;

    const section = document.createElement("section");
    section.className = "panel-card superadmin-growth-v125";
    section.dataset.signature = signature;

    const head = document.createElement("div");
    head.className = "superadmin-growth-head-v125";
    const copy = document.createElement("div");
    const kicker = document.createElement("span");
    kicker.className = "superadmin-kicker";
    kicker.textContent = "Monetização social";
    const title = document.createElement("h3");
    title.textContent = "Assinaturas e criadores";
    const description = document.createElement("p");
    description.className = "muted";
    description.textContent = "Acompanhe a base de criadores, assinantes e a receita gerada pelas comunidades monetizadas.";
    copy.append(kicker, title, description);
    head.appendChild(copy);

    const grid = document.createElement("div");
    grid.className = "superadmin-growth-grid-v125";
    grid.append(
      metricCard("Criadores ativos", String(Number(metrics.totalCreators || 0)), `${creatorsWithSubscribers} com assinantes`),
      metricCard("Assinaturas ativas", String(Number(metrics.activeCreatorSubscriptions || 0)), "assinaturas de comunidades de criadores"),
      metricCard("Comunidades monetizadas", String(Number(metrics.activeCreatorCommunities || 0)), "com monetização ativa"),
      metricCard("Receita bruta", money(metrics.creatorGrossRevenue || 0), "volume pago aos criadores"),
      metricCard("Receita Uorqui", money(metrics.creatorPlatformRevenue || 0), `${Number(metrics.creatorPlatformFeePercent || 0).toLocaleString("pt-BR")}% de taxa da plataforma`),
      metricCard("Saldo a repassar", money(metrics.creatorPendingPayout || 0), `${money(metrics.creatorPaidOut || 0)} já repassados`)
    );

    const list = document.createElement("div");
    list.className = "superadmin-creators-list-v125";
    const listHead = document.createElement("div");
    listHead.className = "superadmin-creators-list-head-v125";
    const listTitle = document.createElement("strong");
    listTitle.textContent = "Criadores";
    const count = document.createElement("small");
    count.textContent = `${creators.length} contas`;
    listHead.append(listTitle, count);
    list.appendChild(listHead);

    if (creators.length) {
      creators.forEach(creator => list.appendChild(creatorRow(creator)));
    } else {
      const empty = document.createElement("p");
      empty.className = "muted superadmin-growth-empty-v125";
      empty.textContent = "Nenhum criador ativado ainda.";
      list.appendChild(empty);
    }

    section.append(head, grid, list);
    const companiesPanel = page.querySelector(".superadmin-companies-panel");
    if (companiesPanel) page.insertBefore(section, companiesPanel);
    else page.appendChild(section);
  } finally {
    renderingGrowthPanel = false;
  }
}

const superadminGrowthObserver = new MutationObserver(renderGrowthPanel);
superadminGrowthObserver.observe(document.documentElement, { childList: true, subtree: true });
renderGrowthPanel();
