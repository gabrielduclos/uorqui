export function scheduleMessageNotificationReadOnThreadOpen(request, response, ctx, next) {
  if (!response?.ok || request.method.toUpperCase() !== 'GET') return;
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (!match) return;

  const currentUid = authUidFromRequest(request);
  const conversationUid = decodeURIComponent(match[1]);
  if (!currentUid || !conversationUid) return;

  const task = (async () => {
    try {
      const notificationId = await canonicalConversationNotificationId(currentUid, conversationUid);
      const target = new URL(`/api/notifications/${encodeURIComponent(notificationId)}/read`, url.origin);
      const readRequest = new Request(target, {
        method: 'POST',
        headers: request.headers
      });
      const readResponse = await next(readRequest);
      if (!readResponse.ok && readResponse.status !== 404) {
        console.warn('Message bell notification read sync failed', { status: readResponse.status });
      }
    } catch (error) {
      console.warn('Message bell notification read sync failed:', error?.message || error);
    }
  })();

  if (ctx?.waitUntil) ctx.waitUntil(task);
}

async function canonicalConversationNotificationId(recipientUid, conversationUid) {
  const bytes = new TextEncoder().encode(`${recipientUid}\u0000${conversationUid}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, value => value.toString(16).padStart(2, '0')).join('').slice(0, 40);
  return `message_conversation_${hash}`;
}

function authUidFromRequest(request) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return '';
  const parts = header.slice(7).split('.');
  if (parts.length !== 3) return '';
  try {
    const payload = JSON.parse(base64urlText(parts[1]));
    return String(payload?.sub || '').trim().slice(0, 180);
  } catch {
    return '';
  }
}

function base64urlText(value) {
  let text = String(value).replace(/-/g, '+').replace(/_/g, '/');
  while (text.length % 4) text += '=';
  const bytes = Uint8Array.from(atob(text), char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
