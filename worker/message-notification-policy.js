const upstreamFetch = globalThis.fetch.bind(globalThis);

const pendingConversationNotifications = new Map();
const suppressedPushNotifications = new Map();
const notificationAliases = new Map();
const PENDING_TTL = 4000;
const SUPPRESSED_PUSH_TTL = 60000;
const ALIAS_TTL = 60000;
const GENERIC_MESSAGE_BODY = 'Enviou uma mensagem';

// Mensagens privadas usam o ícone Mensagens como contador principal. O sino
// mantém apenas uma notificação não lida por remetente/conversa e nunca expõe
// o conteúdo da mensagem em Firestore ou no push.
//
// A deduplicação é feita por um documento determinístico por conversa. Assim,
// cada nova mensagem custa no máximo uma leitura direta desse documento, em vez
// de consultar até centenas de notificações do usuário.
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input || '');
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  let nextInput = input;
  let nextInit = init;

  cleanupCaches();

  try {
    if (isNotificationPatch(url, method, init)) {
      const payload = JSON.parse(String(init.body || '{}'));
      const fields = payload?.fields || {};
      const type = String(fields?.type?.stringValue || '');
      const unread = fields?.read?.booleanValue !== true;

      if (isDirectMessageType(type)) {
        const originalNotificationId = notificationIdFromUrl(url);
        const recipientUid = String(fields?.recipientUid?.stringValue || '');
        const conversationUid = String(fields?.data?.mapValue?.fields?.conversationUid?.stringValue || '');

        // Nunca persiste o texto da mensagem dentro da notificação. O conteúdo
        // continua disponível somente no chat.
        fields.body = { stringValue: GENERIC_MESSAGE_BODY };
        nextInit = { ...init, body: JSON.stringify({ ...payload, fields }) };

        if (recipientUid && conversationUid && originalNotificationId) {
          const canonicalId = await canonicalConversationNotificationId(recipientUid, conversationUid);
          const key = `${recipientUid}:${conversationUid}`;
          notificationAliases.set(originalNotificationId, {
            id: canonicalId,
            expires: Date.now() + ALIAS_TTL
          });

          if (unread) {
            const pending = Number(pendingConversationNotifications.get(key) || 0) > Date.now();
            let duplicate = pending;

            if (!duplicate) {
              const authorization = headerValue(init?.headers || (input instanceof Request ? input.headers : null), 'authorization');
              const projectId = firestoreProjectId(url);
              duplicate = await hasUnreadCanonicalNotification(
                projectId,
                authorization,
                canonicalId
              );
            }

            if (duplicate) {
              suppressedPushNotifications.set(originalNotificationId, Date.now() + SUPPRESSED_PUSH_TTL);
              console.info('Uorqui duplicate direct-message notification suppressed', {
                recipientUid,
                conversationUid
              });
              return fakeFirestoreDocument(url, { ...payload, fields }, canonicalId);
            }

            pendingConversationNotifications.set(key, Date.now() + PENDING_TTL);
          }

          // O documento do sino é sempre o mesmo para esta conversa. Depois que
          // o usuário o marca como lido, a próxima mensagem reutiliza o mesmo ID.
          nextInput = replaceNotificationId(input, canonicalId);
        }
      }
    }

    if (isFcmSend(url, method, nextInit)) {
      const payload = JSON.parse(String(nextInit?.body || '{}'));
      const data = payload?.message?.data || {};
      const type = String(data.type || '');

      if (isDirectMessageType(type)) {
        const originalNotificationId = String(data.notificationId || '');
        const suppressedUntil = Number(suppressedPushNotifications.get(originalNotificationId) || 0);
        if (originalNotificationId && suppressedUntil > Date.now()) {
          suppressedPushNotifications.delete(originalNotificationId);
          notificationAliases.delete(originalNotificationId);
          console.info('Uorqui duplicate direct-message push suppressed', { notificationId: originalNotificationId });
          return new Response(JSON.stringify({ name: 'uorqui/suppressed/direct_message_duplicate' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
        }

        const alias = notificationAliases.get(originalNotificationId);
        if (alias?.id) notificationAliases.delete(originalNotificationId);

        // FCM recebe uma cópia sanitizada mesmo que o runtime original contenha
        // um preview textual. O ID aponta para o documento canônico do sino.
        const message = { ...(payload.message || {}) };
        message.notification = {
          ...(message.notification || {}),
          body: GENERIC_MESSAGE_BODY
        };
        message.data = {
          ...(message.data || {}),
          ...(alias?.id ? { notificationId: alias.id } : {}),
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

  return upstreamFetch(nextInput, nextInit);
};

async function hasUnreadCanonicalNotification(projectId, authorization, notificationId) {
  if (!projectId || !authorization || !notificationId) return false;
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/notifications/${encodeURIComponent(notificationId)}`;
  const response = await upstreamFetch(endpoint, {
    method: 'GET',
    headers: { Authorization: authorization }
  });

  if (response.status === 404) return false;
  if (!response.ok) return false;

  const document = await response.json().catch(() => null);
  const fields = document?.fields || {};
  const type = String(fields?.type?.stringValue || '');
  if (!isDirectMessageType(type)) return false;
  return fields?.read?.booleanValue !== true;
}

async function canonicalConversationNotificationId(recipientUid, conversationUid) {
  const bytes = new TextEncoder().encode(`${recipientUid}\u0000${conversationUid}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, value => value.toString(16).padStart(2, '0')).join('').slice(0, 40);
  return `message_conversation_${hash}`;
}

function replaceNotificationId(input, notificationId) {
  const raw = input instanceof Request ? input.url : String(input || '');
  try {
    const parsed = new URL(raw);
    parsed.pathname = parsed.pathname.replace(
      /\/documents\/notifications\/[^/]+$/i,
      `/documents/notifications/${encodeURIComponent(notificationId)}`
    );
    if (input instanceof Request) return new Request(parsed.toString(), input);
    return parsed.toString();
  } catch {
    return input;
  }
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

function fakeFirestoreDocument(url, payload, notificationId = '') {
  let name = String(url || '').match(/\/v1\/(projects\/[^?]+)/i)?.[1] || '';
  if (notificationId) {
    name = name.replace(/\/documents\/notifications\/[^/]+$/i, `/documents/notifications/${notificationId}`);
  }
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
  for (const [key, alias] of notificationAliases) {
    if (Number(alias?.expires || 0) <= now) notificationAliases.delete(key);
  }
}
