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
.${ROOT_CLASS}{display:flex;align-items:center;gap:9px;margin-right:auto;padding:7px 10px;border:1px solid var(--border,#e2e5e9);border-radius:999px;background:var(--surface,#fff);color:inherit;font:inherit}
.${ROOT_CLASS} .uorqui-community-notify-copy{display:flex;flex-direction:column;gap:1px;text-align:left;min-width:0}
.${ROOT_CLASS} .uorqui-community-notify-copy strong{font-size:12px;line-height:1.2;font-weight:700;white-space:nowrap}
.${ROOT_CLASS} .uorqui-community-notify-copy small{font-size:10px;line-height:1.15;color:var(--muted,#707781);white-space:nowrap}
.${ROOT_CLASS} .uorqui-community-notify-switch{position:relative;width:34px;height:20px;min-width:34px;border:0;border-radius:999px;background:#c8cdd3;padding:0;cursor:pointer;transition:background .16s ease}
.${ROOT_CLASS} .uorqui-community-notify-switch::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .16s ease}
.${ROOT_CLASS} .uorqui-community-notify-switch[aria-checked="true"]{background:#16191d}
.${ROOT_CLASS} .uorqui-community-notify-switch[aria-checked="true"]::after{transform:translateX(14px)}
.${ROOT_CLASS} .uorqui-community-notify-switch:disabled{opacity:.55;cursor:wait}
@media(max-width:700px){
  .${ROOT_CLASS}{width:100%;justify-content:space-between;border-radius:12px;padding:10px 12px;order:20}
  .${ROOT_CLASS} .uorqui-community-notify-copy strong,.${ROOT_CLASS} .uorqui-community-notify-copy small{white-space:normal}
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
    // Se a pessoa deixou a comunidade ou o endpoint ainda não estiver disponível,
    // não exibimos erro global. O padrão continua desligado.
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
  copy.innerHTML = '<strong>Notificar novas publicações</strong><small>Desligado por padrão · somente desta comunidade</small>';

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

function syncToggle() {
  const actions = document.querySelector<HTMLElement>('.community-detail-actions');
  const participating = actions?.querySelector<HTMLElement>('.community-participating-button');
  const communityId = selectedCommunityId();

  document.querySelectorAll<HTMLElement>(`.${ROOT_CLASS}`).forEach(element => {
    if (!actions || !participating || !communityId || element.dataset.communityId !== communityId) element.remove();
  });

  if (!actions || !participating || !communityId) return;

  let wrapper = actions.querySelector<HTMLElement>(`.${ROOT_CLASS}`);
  if (!wrapper) {
    wrapper = buildToggle(communityId);
    actions.prepend(wrapper);
  }

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
scheduleSync();
