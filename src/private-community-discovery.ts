export {};

import { api } from "./lib/api";

type DiscoverCommunity = {
  id: string;
  name?: string;
  visibility?: "public" | "private";
  alreadyMember?: boolean;
  requestToJoin?: boolean;
};
type DiscoverPayload = { communities?: DiscoverCommunity[] };

const upstreamFetch = globalThis.fetch.bind(globalThis);
let latestCommunities: DiscoverCommunity[] = [];
let syncQueued = false;
let joinBusy = "";

const style = document.createElement("style");
style.dataset.uorquiPrivateCommunityDiscovery = "1";
style.textContent = `
.discover-community-card[data-uorqui-private="1"]::after{
  content:attr(data-uorqui-private-label);
  display:block;
  width:max-content;
  max-width:100%;
  margin-top:6px;
  padding:3px 7px;
  border-radius:999px;
  background:#f1f2f4;
  color:#666a72;
  font-size:8px;
  font-weight:750;
  line-height:1.2;
}
.discover-community-card[data-uorqui-join-busy="1"]{opacity:.65;pointer-events:none}
.uorqui-private-community-toast{
  position:fixed;z-index:240;left:50%;bottom:calc(78px + env(safe-area-inset-bottom));transform:translateX(-50%);
  width:max-content;max-width:calc(100vw - 28px);border-radius:999px;background:#17181b;color:#fff;padding:9px 13px;font-size:10px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.2)
}
@media(min-width:851px){.uorqui-private-community-toast{bottom:24px}}
`;
document.head.appendChild(style);

function requestInfo(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const request = input instanceof Request ? input : null;
    const method = String(init?.method || request?.method || "GET").toUpperCase();
    const raw = request?.url || String(input || "");
    return { method, url: new URL(raw, location.origin) };
  } catch { return null; }
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const info = requestInfo(input, init);
  const response = await upstreamFetch(input, init);
  if (!info || !response.ok || info.method !== "GET") return response;
  if (info.url.pathname !== "/api/discover" && info.url.pathname !== "/api/social/feed") return response;

  void response.clone().json().then((payload: DiscoverPayload) => {
    if (!Array.isArray(payload?.communities)) return;
    latestCommunities = payload.communities;
    scheduleSync();
  }).catch(() => {});
  return response;
};

function syncCards() {
  syncQueued = false;
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".discover-community-card"));
  cards.forEach((card, index) => {
    const community = latestCommunities[index];
    if (!community?.id || community.visibility !== "private") {
      delete card.dataset.uorquiPrivate;
      delete card.dataset.uorquiCommunityId;
      delete card.dataset.uorquiPrivateLabel;
      return;
    }
    card.dataset.uorquiPrivate = "1";
    card.dataset.uorquiCommunityId = community.id;
    card.dataset.uorquiAlreadyMember = community.alreadyMember ? "1" : "0";
    card.dataset.uorquiPrivateLabel = community.alreadyMember
      ? "Privada · Você participa"
      : "Privada · Solicitar entrada";
  });
}

function scheduleSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(syncCards);
}

function toast(text: string) {
  document.querySelector(".uorqui-private-community-toast")?.remove();
  const element = document.createElement("div");
  element.className = "uorqui-private-community-toast";
  element.textContent = text;
  document.body.appendChild(element);
  window.setTimeout(() => element.remove(), 3000);
}

document.addEventListener("click", (event) => {
  const target = event.target as Element | null;
  const card = target?.closest<HTMLElement>('.discover-community-card[data-uorqui-private="1"]');
  if (!card || card.dataset.uorquiAlreadyMember === "1") return;

  const communityId = String(card.dataset.uorquiCommunityId || "");
  if (!communityId || joinBusy) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  joinBusy = communityId;
  card.dataset.uorquiJoinBusy = "1";
  void api<{ status?: string }>(`/communities/${encodeURIComponent(communityId)}/join`, { method: "POST" })
    .then(result => {
      if (result.status === "joined") {
        card.dataset.uorquiAlreadyMember = "1";
        card.dataset.uorquiPrivateLabel = "Privada · Você participa";
        toast("Você entrou na comunidade.");
      } else {
        card.dataset.uorquiPrivateLabel = "Privada · Solicitação enviada";
        toast("Solicitação de entrada enviada.");
      }
    })
    .catch(() => toast("Não foi possível concluir agora. Tente novamente."))
    .finally(() => {
      joinBusy = "";
      delete card.dataset.uorquiJoinBusy;
    });
}, true);

const observer = new MutationObserver(scheduleSync);
observer.observe(document.documentElement, { childList: true, subtree: true });
scheduleSync();
