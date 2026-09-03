import { api } from './lib/api';

type MessageConversation = {
  id: string;
  targetUid: string;
  displayName: string;
  username?: string;
  status?: string;
  lastMessagePreview?: string;
};

type ConversationResponse = {
  conversations: MessageConversation[];
  nextOffset: number | null;
};

let activeModal: HTMLElement | null = null;
let activePostId = '';

const style = document.createElement('style');
style.dataset.uorquiPostMessageShare = '1';
style.textContent = `
.uorqui-share-modal-backdrop{position:fixed;inset:0;z-index:140;background:rgba(15,18,22,.42);display:flex;align-items:flex-end;justify-content:center;padding:14px;backdrop-filter:blur(3px)}
.uorqui-share-modal{width:min(520px,100%);max-height:min(78dvh,720px);background:#fff;border-radius:22px;box-shadow:0 24px 80px rgba(0,0,0,.24);display:flex;flex-direction:column;overflow:hidden}
.uorqui-share-modal-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 12px;border-bottom:1px solid #eceef0}
.uorqui-share-modal-head strong{font-size:15px}.uorqui-share-close{border:0;background:transparent;font-size:25px;line-height:1;padding:2px 4px;color:#656a72}
.uorqui-share-search{margin:12px 16px 8px;border:1px solid #e1e3e6;background:#f7f8f9;border-radius:12px;padding:10px 12px;width:calc(100% - 32px);outline:none}
.uorqui-share-list{overflow:auto;padding:4px 10px 12px;min-height:150px}
.uorqui-share-person{width:100%;border:0;background:transparent;display:flex;align-items:center;gap:11px;padding:10px 8px;border-radius:13px;text-align:left}
.uorqui-share-person:hover{background:#f5f6f7}.uorqui-share-person-copy{flex:1;min-width:0}.uorqui-share-person-copy strong,.uorqui-share-person-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.uorqui-share-person-copy strong{font-size:13px}.uorqui-share-person-copy small{font-size:10px;color:#858991;margin-top:2px}
.uorqui-share-avatar{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#17191d;color:#fff;font-size:12px;font-weight:800;flex:none}
.uorqui-share-check{width:24px;height:24px;border:1.5px solid #c8ccd1;border-radius:50%;display:grid;place-items:center;color:transparent;font-size:14px;font-weight:900;flex:none}.uorqui-share-person.selected .uorqui-share-check{background:#16191d;border-color:#16191d;color:#fff}
.uorqui-share-footer{padding:12px 16px 16px;border-top:1px solid #eceef0}.uorqui-share-send{width:100%;border:0;border-radius:13px;background:#121417;color:#fff;padding:12px 14px;font-weight:800}.uorqui-share-send:disabled{opacity:.45;cursor:not-allowed}
.uorqui-share-loading,.uorqui-share-empty{min-height:190px;display:grid;place-items:center;text-align:center;color:#777c84;font-size:12px;padding:24px}.uorqui-share-spinner{width:28px;height:28px;border:3px solid #e1e3e6;border-top-color:#17191d;border-radius:50%;animation:uorquiShareSpin .75s linear infinite}@keyframes uorquiShareSpin{to{transform:rotate(360deg)}}
.uorqui-share-success{min-height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px}.uorqui-share-success-mark{width:58px;height:58px;border-radius:50%;background:#17191d;color:#fff;display:grid;place-items:center;font-size:30px;margin-bottom:14px}.uorqui-share-success strong{font-size:17px}.uorqui-share-success span{font-size:11px;color:#777c84;margin-top:5px}
@media(min-width:700px){.uorqui-share-modal-backdrop{align-items:center}.uorqui-share-modal{border-radius:20px}}
`;
document.head.appendChild(style);

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'U';
}

function closeModal() {
  activeModal?.remove();
  activeModal = null;
  activePostId = '';
}

function modalShell(postId: string) {
  closeModal();
  activePostId = postId;
  const backdrop = document.createElement('div');
  backdrop.className = 'uorqui-share-modal-backdrop';
  backdrop.innerHTML = `
    <section class="uorqui-share-modal" role="dialog" aria-modal="true" aria-label="Enviar publicação por mensagem">
      <header class="uorqui-share-modal-head"><strong>Enviar por mensagem</strong><button class="uorqui-share-close" type="button" aria-label="Fechar">×</button></header>
      <div class="uorqui-share-loading"><div class="uorqui-share-spinner" aria-label="Carregando conversas"></div></div>
    </section>`;
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });
  backdrop.querySelector('.uorqui-share-close')?.addEventListener('click', closeModal);
  document.body.appendChild(backdrop);
  activeModal = backdrop;
  return backdrop.querySelector<HTMLElement>('.uorqui-share-modal')!;
}

async function openModal(postId: string) {
  const modal = modalShell(postId);
  let result: ConversationResponse;
  try {
    result = await api<ConversationResponse>('/messages?offset=0&limit=50');
  } catch (error) {
    modal.innerHTML = `<header class="uorqui-share-modal-head"><strong>Enviar por mensagem</strong><button class="uorqui-share-close" type="button">×</button></header><div class="uorqui-share-empty">Não foi possível carregar suas conversas.</div>`;
    modal.querySelector('.uorqui-share-close')?.addEventListener('click', closeModal);
    return;
  }
  if (activePostId !== postId || !activeModal) return;

  const conversations = Array.isArray(result.conversations) ? result.conversations : [];
  if (!conversations.length) {
    modal.innerHTML = `<header class="uorqui-share-modal-head"><strong>Enviar por mensagem</strong><button class="uorqui-share-close" type="button">×</button></header><div class="uorqui-share-empty">Você ainda não tem conversas para enviar esta publicação.</div>`;
    modal.querySelector('.uorqui-share-close')?.addEventListener('click', closeModal);
    return;
  }

  modal.innerHTML = `
    <header class="uorqui-share-modal-head"><strong>Enviar por mensagem</strong><button class="uorqui-share-close" type="button" aria-label="Fechar">×</button></header>
    <input class="uorqui-share-search" type="search" placeholder="Pesquisar conversa" aria-label="Pesquisar conversa">
    <div class="uorqui-share-list"></div>
    <footer class="uorqui-share-footer"><button class="uorqui-share-send" type="button" disabled>Enviar</button></footer>`;
  modal.querySelector('.uorqui-share-close')?.addEventListener('click', closeModal);
  const list = modal.querySelector<HTMLElement>('.uorqui-share-list')!;
  const search = modal.querySelector<HTMLInputElement>('.uorqui-share-search')!;
  const send = modal.querySelector<HTMLButtonElement>('.uorqui-share-send')!;
  const selected = new Set<string>();

  const render = () => {
    const query = search.value.trim().toLocaleLowerCase('pt-BR');
    const visible = conversations.filter(item => !query || `${item.displayName || ''} ${item.username || ''}`.toLocaleLowerCase('pt-BR').includes(query));
    list.replaceChildren();
    for (const item of visible) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `uorqui-share-person${selected.has(item.targetUid) ? ' selected' : ''}`;
      button.innerHTML = `<span class="uorqui-share-avatar">${initials(item.displayName)}</span><span class="uorqui-share-person-copy"><strong></strong><small></small></span><span class="uorqui-share-check">✓</span>`;
      const strong = button.querySelector('strong')!;
      const small = button.querySelector('small')!;
      strong.textContent = item.displayName || 'Usuário';
      small.textContent = item.username ? `@${item.username}` : (item.lastMessagePreview || 'Conversa');
      button.addEventListener('click', () => {
        if (selected.has(item.targetUid)) selected.delete(item.targetUid);
        else if (selected.size < 10) selected.add(item.targetUid);
        send.disabled = selected.size === 0;
        render();
      });
      list.appendChild(button);
    }
  };
  search.addEventListener('input', render);
  render();

  send.addEventListener('click', async () => {
    if (!selected.size || send.disabled) return;
    send.disabled = true;
    send.textContent = 'Enviando…';
    const recipients = Array.from(selected);
    const results = await Promise.allSettled(recipients.map(targetUid => api(`/messages/${encodeURIComponent(targetUid)}`, {
      method: 'POST',
      body: JSON.stringify({ text: '', attachmentIds: [], postId })
    })));
    const sent = results.filter(item => item.status === 'fulfilled').length;
    if (!sent) {
      send.disabled = false;
      send.textContent = 'Tentar novamente';
      return;
    }
    modal.innerHTML = `<div class="uorqui-share-success"><div class="uorqui-share-success-mark">✓</div><strong>Enviado com sucesso</strong><span>${sent === 1 ? 'A publicação foi enviada.' : `A publicação foi enviada para ${sent} conversas.`}</span></div>`;
    window.setTimeout(closeModal, 1200);
  });
}

window.addEventListener('uorqui:open-messages', event => {
  const detail = (event as CustomEvent<{ postId?: string }>).detail;
  const postId = String(detail?.postId || '').trim();
  if (!postId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openModal(postId);
});
