const upstreamFetch = globalThis.fetch.bind(globalThis);

const pendingConversationNotifications = new Map();
const suppressedPushNotifications = new Map();
const PENDING_TTL = 4000;
const SUPPRESSED_PUSH_TTL = 60000;
const GENERIC_MESSAGE_BODY = 'Enviou uma mensagem';

// Mensagens privadas usam o ícone Mensagens como contador principal. O sino
// mantém apenas uma notificação não lida por remetente/conversa e nunca expõe
// o conteúdo da mensagem em Firestore ou no push.
//
// Importante: esta política não intercepta mais runQuery de notificações. O
// bootstrap precisa receber a resposta do Firestore sem reconstrução de body;
// a deduplicação acontece na gravação da notificação, antes de ela existir.
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input || '');
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  let nextInit = init;

  cleanupCaches();

  try {
    if (isNotificationPatch(url, method, init)) {
      const payload = JSON.parse(String(init.body || '{}'));
      const fields = payload?.fields || {};
      const type = String(fields?.type?.stringValue || '');
      const unread = fields?.read?.booleanValue !== true;

      if (isDirectMessageType(type)) {
        const notificationId = notificationIdFromUrl(url);
        const recipientUid = String(fields?.recipientUid?.stringValue || '');
        const conversationUid = String(fields?.data?.mapValue?.fields?.conversationUid?.stringValue || '');

        // Nunca persiste o texto da mensagem dentro da notificação. O conteúdo
        // continua disponível somente no chat.
        fields.body = { stringValue: GENERIC_MESSAGE_BODY };
        nextInit = { ...init, body: JSON.stringify({ ...payload, fields }) };

        if (unread && recipientUid && conversationUid && notificationId) {
          const key = `${recipientUid}:${conversationUid}`;
          const pending = Number(pendingConversationNotifications.get(key) || 0) > Date.now();
          const authorization = headerValue(init?.headers || (input instanceof Request ? input.headers : null), 'authorization');
          const projectId = firestoreProjectId(url);
          const duplicate = pending || await hasUnreadConversationNotification(
            projectId,
            authorization,
            recipientUid,
            conversationUid,
            notificationId
          );

          if (duplicate) {
            suppressedPushNotifications.set(notificationId, Date.now() + SUPPRESSED_PUSH_TTL);
            console.info('Uorqui duplicate direct-message notification suppressed', {
              recipientUid,
              conversationUid
            });
            return fakeFirestoreDocument(url, { ...payload, fields });
          }

          pendingConversationNotifications.set(key, Date.now() + PENDING_TTL);
        }
      }
    }

    if (isFcmSend(url, method, nextInit)) {
      const payload = JSON.parse(String(nextInit?.body || '{}'));
      const data = payload?.message?.data || {};
      const type = String(data.type || '');

      if (isDirectMessageType(type)) {
        const notificationId = String(data.notificationId || '');
        const suppressedUntil = Number(suppressedPushNotifications.get(notificationId) || 0);
        if (notificationId && suppressedUntil > Date.now()) {
          suppressedPushNotifications.delete(notificationId);
          console.info('Uorqui duplicate direct-message push suppressed', { notificationId });
          return new Response(JSON.stringify({ name: 'uorqui/suppressed/direct_message_duplicate' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
        }

        // FCM recebe uma cópia sanitizada mesmo que o objeto original criado
        // pelo runtime contenha um preview textual.
        const message = { ...(payload.message || {}) };
        message.notification = {
          ...(message.notification || {}),
          body: GENERIC_MESSAGE_BODY
        };
        message.data = {
          ...(message.data || {}),
          body: GENERIC_MESSAGE_BODY
        };
        nextInit = {
          ...nextInit,
          body: JSON.stringify({ ...payload, message })
        };
      }
    }
  } catch (error) {
    // Uma falha no filtro não pode impedir o envio da mensagem.
    console.warn('Uorqui direct-message notification policy failed:', error?.message || error);
  }

  return upstreamFetch(input, nextInit);
};

async function hasUnreadConversationNotification(projectId, authorization, recipientUid, conversationUid, currentNotificationId) {
  if (!projectId || !authorization || !recipientUid || !conversationUid) return false;
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`;
  const response = await upstreamFetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'notifications' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'recipientUid' },
            op: 'EQUAL',
            value: { stringValue: recipientUid }
          }
        },
        limit: 200
      }
    })
  });
  if (!response.ok) return false;

  const rows = await response.json().catch(() => []);
  for (const row of Array.isArray(rows) ? rows : []) {
    const document = row?.document;
    const fields = document?.fields || {};
    const id = String(document?.name || '').split('/').pop() || '';
    if (!id || id === currentNotificationId) continue;
    if (!isDirectMessageType(String(fields?.type?.stringValue || ''))) continue;
    if (fields?.read?.booleanValue === true) continue;
    const sender = String(fields?.data?.mapValue?.fields?.conversationUid?.stringValue || '');
    if (sender === conversationUid) return true;
  }
  return false;
}

function isNotificationPatch(url, method, init) {
  return method === 'PATCH' &&
    /firestore\.googleapis\.com\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents\/notifications\/[^/?]+/i.test(url) &&
    typeof init?.body === 'string';
}

function isFcmSend(url, method, init) {
  return method === 'POST' &&
    /fcm\.googleapis\.com\/v1\/projects\/[^/]+\/messages:send(?:\?|$)/i.test(url) &&
    typeof init?.body === 'string';
}

function isDirectMessageType(type) {
  return type === 'direct_message' || type === 'message_request';
}

function notificationIdFromUrl(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/documents\/notifications\/([^/]+)$/i);
    return match?.[1] ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

function firestoreProjectId(url) {
  const match = String(url || '').match(/\/v1\/projects\/([^/]+)\/databases\//i);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function fakeFirestoreDocument(url, payload) {
  const name = String(url || '').match(/\/v1\/(projects\/[^?]+)/i)?.[1] || '';
  return new Response(JSON.stringify({
    name,
    fields: payload?.fields || {},
    createTime: new Date().toISOString(),
    updateTime: new Date().toISOString()
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function headerValue(headers, key) {
  if (!headers) return '';
  const target = String(key || '').toLowerCase();
  if (headers instanceof Headers) return headers.get(key) || '';
  if (Array.isArray(headers)) {
    const found = headers.find(item => Array.isArray(item) && String(item[0] || '').toLowerCase() === target);
    return String(found?.[1] || '');
  }
  for (const [name, value] of Object.entries(headers || {})) {
    if (String(name).toLowerCase() === target) return String(value || '');
  }
  return '';
}

function cleanupCaches() {
  const now = Date.now();
  for (const [key, expires] of pendingConversationNotifications) {
    if (Number(expires || 0) <= now) pendingConversationNotifications.delete(key);
  }
  for (const [key, expires] of suppressedPushNotifications) {
    if (Number(expires || 0) <= now) suppressedPushNotifications.delete(key);
  }
}
