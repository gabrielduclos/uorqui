import { api } from './lib/api';

type PreferenceResponse = {
  communityId: string;
  notifyNewPosts: boolean;
};

const LAST_COMMUNITY_KEY = 'uorqui-last-community-v1';
const ROOT_CLASS = 'uorqui-community-notify-toggle';
const preferenceByCommunity = new Map<string, boolean>();
const loadingCommunities = new Set<string>();
let queued = false;

const style = document.createElement('style');
style.dataset.uorquiCommunityNotifyToggle = '1';
style.textContent = `
/* Ver/Gerenciar membros permanece no topo direito, na linha de Comunidades. */
.community-detail-head{position:relative}
.community-manage-members-tag{top:14px!important;right:14px!important}
.community-detail-head>.back-button{padding-right:190px!important;min-height:28px!important}

/* Não altera a estrutura/tamanho do avatar nem move elementos controlados pelo React. */
.${ROOT_CLASS}{position:absolute;right:16px;z-index:2;display:inline-flex;align-items:center;justify-content:flex-end;gap:8px;width:auto;min-height:24px;margin:0;padding:1px 0;border:0;background:transparent;color:inherit;font:inherit}
.${ROOT_CLASS} .uorqui-community-notify-copy{display:flex;align-items:center;min-width:0;text-align:right}
.${ROOT_CLASS} .uorqui-community-notify-copy strong{font-size:10px;line-height:1.2;font-weight:700;white-space:nowrap;color:var(--muted,#707781)}
.${ROOT_CLASS} .uorqui-community-notify-switch{position:relative;width:32px;height:18px;min-width:32px;border:0;border-radius:999px;background:#c8cdd3;padding:0;cursor:pointer;transition:background .16s ease}
.${ROOT_CLASS} .uorqui-community-notify-switch::after{content:"";position:absolute;top:3px;left:3px;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .16s ease}
.${ROOT_CLASS} .uorqui-community-notify-switch[aria-checked="true"]{background:#16191d}
.${ROOT_CLASS} .uorqui-community-notify-switch[aria-checked="true"]::after{transform:translateX(14px)}
.${ROOT_CLASS} .uorqui-community-notify-switch:disabled{opacity:.55;cursor:wait}

@media(max-width:850px){
  .community-manage-members-tag{top:14px!important;right:14px!important}
  .community-detail-head>.back-button{padding-right:180px!important}
  .${ROOT_CLASS}{right:14px}
}
@media(max-width:700px){
  .community-detail-head>.back-button{padding-right:170px!important}
  .${ROOT_CLASS}{right:14px;min-height:22px;gap:6px;padding:1px 0}
  .${ROOT_CLASS} .uorqui-community-notify-copy strong{font-size:9px;white-space:nowrap}
  .${ROOT_CLASS} .uorqui-community-notify-switch{width:30px;height:18px;min-width:30px}
  .${ROOT_CLASS} .uorqui-community-notify-switch[aria-checked="true"]::after{transform:translateX(12px)}
}
@media(max-width:480px){
  .${ROOT_CLASS} .uorqui-community-notify-copy strong{font-size:8.5px}
}
`;
document.head.appendChild(style);

function selectedCommunityId() {
  try { return sessionStorage.getItem(LAST_COMMUNITY_KEY) || ''; }
  catch { return ''; }
}

async function loadPreference(communityId: string) {
  if (!communityId || loadingCommunities.has(communityId) || preferenceByCommunity.has(communityId)) return;
  loadingCommunities.add(communityId);
  try {
    const result = await api<PreferenceResponse>(`/communities/${encodeURIComponent(communityId)}/notification-preference`);
    preferenceByCommunity.set(communityId, result.notifyNewPosts === true);
  } catch {
    preferenceByCommunity.set(communityId, false);
  } finally {
    loadingCommunities.delete(communityId);
    scheduleSync();
  }
}

function buildToggle(communityId: string) {
  const wrapper = document.createElement('div');
  wrapper.className = ROOT_CLASS;
  wrapper.dataset.communityId = communityId;

  const copy = document.createElement('div');
  copy.className = 'uorqui-community-notify-copy';
  copy.innerHTML = '<strong>Notificar novas publicações</strong>';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'uorqui-community-notify-switch';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', 'Notificar novas publicações desta comunidade');
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    const next = preferenceByCommunity.get(communityId) !== true;
    button.disabled = true;
    button.setAttribute('aria-checked', String(next));
    try {
      const result = await api<PreferenceResponse>(`/communities/${encodeURIComponent(communityId)}/notification-preference`, {
        method: 'PUT',
        body: JSON.stringify({ notifyNewPosts: next })
      });
      preferenceByCommunity.set(communityId, result.notifyNewPosts === true);
    } catch {
      button.setAttribute('aria-checked', String(preferenceByCommunity.get(communityId) === true));
    } finally {
      button.disabled = false;
      scheduleSync();
    }
  });

  wrapper.append(copy, button);
  return wrapper;
}

function alignWithVisibilityBadge(head: HTMLElement, badge: HTMLElement, wrapper: HTMLElement) {
  const headRect = head.getBoundingClientRect();
  const badgeRect = badge.getBoundingClientRect();
  const wrapperHeight = wrapper.getBoundingClientRect().height || 24;
  const top = Math.max(0, badgeRect.top - headRect.top + ((badgeRect.height - wrapperHeight) / 2));
  wrapper.style.top = `${Math.round(top)}px`;
}

function syncToggle() {
  const head = document.querySelector<HTMLElement>('.community-detail-head');
  const actions = head?.querySelector<HTMLElement>('.community-detail-actions');
  const participating = actions?.querySelector<HTMLElement>('.community-participating-button');
  const visibilityBadge = head?.querySelector<HTMLElement>('.community-detail-title .community-visibility-badge');
  const communityId = selectedCommunityId();

  document.querySelectorAll<HTMLElement>(`.${ROOT_CLASS}`).forEach(element => {
    if (!head || !participating || !visibilityBadge || !communityId || element.dataset.communityId !== communityId) element.remove();
  });

  if (!head || !participating || !visibilityBadge || !communityId) return;

  let wrapper = head.querySelector<HTMLElement>(`.${ROOT_CLASS}`);
  if (!wrapper || wrapper.dataset.communityId !== communityId) {
    wrapper?.remove();
    wrapper = buildToggle(communityId);
    head.append(wrapper);
  }

  alignWithVisibilityBadge(head, visibilityBadge, wrapper);

  const button = wrapper.querySelector<HTMLButtonElement>('.uorqui-community-notify-switch');
  if (button) {
    const loaded = preferenceByCommunity.has(communityId);
    button.disabled = !loaded || loadingCommunities.has(communityId);
    button.setAttribute('aria-checked', String(preferenceByCommunity.get(communityId) === true));
  }

  void loadPreference(communityId);
}

function scheduleSync() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    syncToggle();
  });
}

const observer = new MutationObserver(scheduleSync);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('popstate', scheduleSync);
window.addEventListener('load', scheduleSync, { once: true });
window.addEventListener('resize', scheduleSync, { passive: true });
scheduleSync();
