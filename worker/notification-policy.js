const upstreamFetch = globalThis.fetch.bind(globalThis);
const preferenceCache = new Map();
const PREFERENCE_CACHE_TTL = 15000;

// Política padrão do Uorqui: publicação comum não notifica. A única exceção é
// quando o usuário optou explicitamente por receber novas publicações daquela
// comunidade. Comunicados/read_required e interações diretas não passam por
// esta regra e continuam funcionando normalmente.
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input || '');
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  let nextInit = init;

  try {
    // Alterar a preferência precisa ter efeito imediato. Como esse PATCH passa
    // pelo mesmo fetch global, descartamos qualquer cache antes das próximas
    // gravações/leitura do sino.
    if (
      method === 'PATCH' &&
      /firestore\.googleapis\.com\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents\/communityMembers\//i.test(url) &&
      typeof init?.body === 'string'
    ) {
      const payload = JSON.parse(init.body);
      if (payload?.fields?.notifyNewPosts) preferenceCache.clear();
    }

    // Impede que new_post seja persistida para quem não optou pela comunidade.
    if (
      method === 'POST' &&
      /firestore\.googleapis\.com\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents:commit(?:\?|$)/i.test(url) &&
      typeof init?.body === 'string'
    ) {
      const payload = JSON.parse(init.body);
      if (Array.isArray(payload?.writes) && payload.writes.length) {
        const notificationWrites = payload.writes.filter(isNewPostNotificationWrite);
        if (notificationWrites.length) {
          const authorization = headerValue(init?.headers || (input instanceof Request ? input.headers : null), 'authorization');
          const projectId = firestoreProjectId(url);
          const communityIds = Array.from(new Set(
            notificationWrites.map(write => notificationWriteData(write).communityId).filter(Boolean)
          ));
          const optedByCommunity = new Map();

          for (const communityId of communityIds) {
            optedByCommunity.set(
              communityId,
              await optedInCommunityMembers(projectId, authorization, communityId)
            );
          }

          const writes = payload.writes.filter(write => {
            if (!isNewPostNotificationWrite(write)) return true;
            const { recipientUid, communityId } = notificationWriteData(write);
            if (!recipientUid || !communityId) return false;
            const allowed = optedByCommunity.get(communityId)?.has(recipientUid) === true;
            cachePreference(communityId, recipientUid, allowed);
            return allowed;
          });
          const suppressed = payload.writes.length - writes.length;

          if (suppressed > 0) {
            console.info('Uorqui new-post notifications filtered by community preference', {
              suppressed,
              allowed: notificationWrites.length - suppressed
            });
          }

          if (!writes.length) {
            return new Response(JSON.stringify({
              writeResults: [],
              commitTime: new Date().toISOString()
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json; charset=utf-8' }
            });
          }

          nextInit = {
            ...init,
            body: JSON.stringify({ ...payload, writes })
          };
        }
      }
    }

    // Também filtra a LEITURA do sino. Isso remove imediatamente da interface
    // notificações new_post antigas que foram gravadas antes da política de
    // opt-in, sem apagar comunicados, respostas, menções, convites etc.
    if (
      method === 'POST' &&
      /firestore\.googleapis\.com\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents:runQuery(?:\?|$)/i.test(url) &&
      typeof nextInit?.body === 'string'
    ) {
      const payload = JSON.parse(nextInit.body);
      const recipientUid = notificationQueryRecipientUid(payload);
      if (recipientUid) {
        const authorization = headerValue(nextInit?.headers || (input instanceof Request ? input.headers : null), 'authorization');
        const projectId = firestoreProjectId(url);
        const optedCommunities = await optedInCommunitiesForUser(projectId, authorization, recipientUid);
        const response = await upstreamFetch(input, nextInit);
        if (!response.ok) return response;

        const rows = await response.json().catch(() => null);
        if (!Array.isArray(rows)) return responseFromJson(rows, response);

        let suppressed = 0;
        const filtered = rows.filter(row => {
          const fields = row?.document?.fields || null;
          if (!fields) return true;
          if (String(fields?.type?.stringValue || '') !== 'new_post') return true;
          const communityId = String(fields?.data?.mapValue?.fields?.communityId?.stringValue || '');
          const allowed = communityId && optedCommunities.has(communityId);
          if (!allowed) suppressed += 1;
          return Boolean(allowed);
        });

        if (suppressed > 0) {
          console.info('Uorqui stale new-post notifications hidden from bell', {
            uid: recipientUid,
            suppressed
          });
        }
        return responseFromJson(filtered, response);
      }
    }

    if (
      method === 'POST' &&
      /fcm\.googleapis\.com\/v1\/projects\/[^/]+\/messages:send(?:\?|$)/i.test(url) &&
      typeof init?.body === 'string'
    ) {
      const payload = JSON.parse(init.body);
      if (String(payload?.message?.data?.type || '') === 'new_post') {
        const data = payload?.message?.data || {};
        const communityId = String(data.communityId || '');
        const postId = String(data.postId || '');
        const notificationId = String(data.notificationId || '');
        const prefix = postId ? `post_${postId}_` : '';
        const recipientUid = prefix && notificationId.startsWith(prefix)
          ? notificationId.slice(prefix.length)
          : '';
        const allowed = communityId && recipientUid
          ? cachedPreference(communityId, recipientUid) === true
          : false;

        if (!allowed) {
          console.info('Uorqui new-post push suppressed by community preference');
          return new Response(JSON.stringify({ name: 'uorqui/suppressed/new_post' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
        }
      }
    }
  } catch (error) {
    // Em caso de falha na inspeção, mantemos o padrão seguro sem spam.
    console.warn('Uorqui notification policy inspection failed:', error?.message || error);
    if (isNewPostFcm(url, method, init)) {
      return new Response(JSON.stringify({ name: 'uorqui/suppressed/new_post_policy_error' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }

  return upstreamFetch(input, nextInit);
};

async function optedInCommunityMembers(projectId, authorization, communityId) {
  const cacheKey = `community:${communityId}`;
  const cached = preferenceCache.get(cacheKey);
  if (cached && cached.expires > Date.now() && cached.value instanceof Set) return cached.value;
  if (!projectId || !authorization || !communityId) return new Set();

  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`;
  const response = await upstreamFetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'communityMembers' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'communityId' },
            op: 'EQUAL',
            value: { stringValue: communityId }
          }
        },
        limit: 500
      }
    })
  });
  if (!response.ok) return new Set();

  const rows = await response.json().catch(() => []);
  const opted = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const fields = row?.document?.fields || {};
    const uid = String(fields?.uid?.stringValue || '');
    if (uid && fields?.notifyNewPosts?.booleanValue === true) {
      opted.add(uid);
      cachePreference(communityId, uid, true);
    }
  }

  preferenceCache.set(cacheKey, { value: opted, expires: Date.now() + PREFERENCE_CACHE_TTL });
  return opted;
}

async function optedInCommunitiesForUser(projectId, authorization, uid) {
  const cacheKey = `user:${uid}`;
  const cached = preferenceCache.get(cacheKey);
  if (cached && cached.expires > Date.now() && cached.value instanceof Set) return cached.value;
  if (!projectId || !authorization || !uid) return new Set();

  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`;
  const response = await upstreamFetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'communityMembers' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'uid' },
            op: 'EQUAL',
            value: { stringValue: uid }
          }
        },
        limit: 500
      }
    })
  });
  if (!response.ok) return new Set();

  const rows = await response.json().catch(() => []);
  const opted = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const fields = row?.document?.fields || {};
    const communityId = String(fields?.communityId?.stringValue || '');
    if (communityId && fields?.notifyNewPosts?.booleanValue === true) opted.add(communityId);
  }
  preferenceCache.set(cacheKey, { value: opted, expires: Date.now() + PREFERENCE_CACHE_TTL });
  return opted;
}

function notificationQueryRecipientUid(payload) {
  const query = payload?.structuredQuery;
  const from = Array.isArray(query?.from) ? query.from : [];
  if (!from.some(item => String(item?.collectionId || '') === 'notifications')) return '';
  return findRecipientFilterValue(query?.where);
}

function findRecipientFilterValue(where) {
  if (!where || typeof where !== 'object') return '';
  const filter = where.fieldFilter;
  if (
    String(filter?.field?.fieldPath || '') === 'recipientUid' &&
    String(filter?.op || '') === 'EQUAL'
  ) return String(filter?.value?.stringValue || '');

  const filters = where.compositeFilter?.filters;
  if (Array.isArray(filters)) {
    for (const item of filters) {
      const value = findRecipientFilterValue(item);
      if (value) return value;
    }
  }
  return '';
}

function responseFromJson(value, original) {
  const headers = new Headers(original.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.delete('Content-Length');
  return new Response(JSON.stringify(value), {
    status: original.status,
    statusText: original.statusText,
    headers
  });
}

function isNewPostNotificationWrite(write) {
  const update = write?.update;
  if (!update || typeof update !== 'object') return false;
  const name = String(update.name || '');
  if (!/\/documents\/notifications\//i.test(name)) return false;
  return String(update?.fields?.type?.stringValue || '') === 'new_post';
}

function notificationWriteData(write) {
  const fields = write?.update?.fields || {};
  return {
    recipientUid: String(fields?.recipientUid?.stringValue || ''),
    communityId: String(fields?.data?.mapValue?.fields?.communityId?.stringValue || '')
  };
}

function firestoreProjectId(url) {
  const match = String(url || '').match(/\/v1\/projects\/([^/]+)\/databases\//i);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function cachePreference(communityId, uid, value) {
  preferenceCache.set(`${communityId}:${uid}`, { value: value === true, expires: Date.now() + PREFERENCE_CACHE_TTL });
}

function cachedPreference(communityId, uid) {
  const item = preferenceCache.get(`${communityId}:${uid}`);
  if (!item || item.expires <= Date.now()) return undefined;
  return item.value === true;
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

function isNewPostFcm(url, method, init) {
  if (method !== 'POST' || !/fcm\.googleapis\.com\/v1\/projects\/[^/]+\/messages:send/i.test(String(url || ''))) return false;
  if (typeof init?.body !== 'string') return false;
  try {
    return String(JSON.parse(init.body)?.message?.data?.type || '') === 'new_post';
  } catch {
    return false;
  }
}
