const upstreamFetch = globalThis.fetch.bind(globalThis);
const ROOT_CLASS = 'uorqui-conversations-loading';
let pendingConversationLoads = 0;
let syncQueued = false;

const style = document.createElement('style');
style.dataset.uorquiMessagesListLoading = '1';
style.textContent = `
.${ROOT_CLASS}{display:flex;align-items:center;justify-content:center;min-height:76px;padding:18px 10px;color:var(--muted,#747780)}
.${ROOT_CLASS} span{width:24px;height:24px;border:2px solid #d9dadd;border-top-color:#111318;border-radius:50%;animation:uorqui-conversations-spin .7s linear infinite}
@keyframes uorqui-conversations-spin{to{transform:rotate(360deg)}}
`;
document.head.appendChild(style);

function isConversationListRequest(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const request = input instanceof Request ? input : null;
    const method = String(init?.method || request?.method || 'GET').toUpperCase();
    if (method !== 'GET') return false;
    const raw = request?.url || String(input || '');
    const url = new URL(raw, location.origin);
    return url.pathname === '/api/messages';
  } catch {
    return false;
  }
}

function syncSpinner() {
  const list = document.querySelector<HTMLElement>('.messages-list');
  const existing = document.querySelector<HTMLElement>(`.${ROOT_CLASS}`);

  if (!list || pendingConversationLoads <= 0) {
    existing?.remove();
    return;
  }

  if (existing && existing.parentElement === list) return;
  existing?.remove();

  const spinner = document.createElement('div');
  spinner.className = ROOT_CLASS;
  spinner.setAttribute('role', 'status');
  spinner.setAttribute('aria-label', 'Carregando conversas');
  spinner.innerHTML = '<span aria-hidden="true"></span>';

  const head = list.querySelector('.messages-list-head');
  if (head?.nextSibling) list.insertBefore(spinner, head.nextSibling);
  else list.append(spinner);
}

function scheduleSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    syncSpinner();
  });
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const conversations = isConversationListRequest(input, init);
  if (conversations) {
    pendingConversationLoads += 1;
    scheduleSync();
  }

  try {
    return await upstreamFetch(input, init);
  } finally {
    if (conversations) {
      pendingConversationLoads = Math.max(0, pendingConversationLoads - 1);
      scheduleSync();
    }
  }
};

const observer = new MutationObserver(scheduleSync);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('load', scheduleSync, { once: true });
scheduleSync();
