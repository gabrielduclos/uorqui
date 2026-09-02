const upstreamFetch = globalThis.fetch.bind(globalThis);
let firestoreAuth = '';
let firestoreProject = '';

// Captura apenas a credencial efêmera que o próprio Worker já usa para falar
// com o Firestore. Ela fica somente na memória da instância e serve para a
// limpeza imediata de referências órfãs, sem criar outro fluxo de autenticação.
globalThis.fetch = async (input, init) => {
  try {
    const url = input instanceof Request ? input.url : String(input || '');
    if (/^https:\/\/firestore\.googleapis\.com\/v1\/projects\//i.test(url)) {
      const auth = headerValue(init?.headers || (input instanceof Request ? input.headers : null), 'authorization');
      if (auth) firestoreAuth = auth;
      const match = url.match(/\/v1\/projects\/([^/]+)\/databases\//i);
      if (match?.[1]) firestoreProject = decodeURIComponent(match[1]);
    }
  } catch {}
  return upstreamFetch(input, init);
};

// 404 de publicação apagada é uma situação esperada para links antigos.
// Não deve poluir Observability como falha interna do Worker.
const originalConsoleError = console.error.bind(console);
console.error = (...args) => {
  const error = args[0];
  if (
    Number(error?.status || 0) === 404 &&
    /publica[cç][aã]o n[aã]o encontrada/i.test(String(error?.message || ''))
  ) {
    console.info('Uorqui stale post link handled', { status: 404 });
    return;
  }
  originalConsoleError(...args);
};

export async function cleanupDeletedPostNotifications(env, postId) {
  const id = String(postId || '').trim();
  if (!id) return { deleted: 0 };

  const projectId = String(env?.FIREBASE_PROJECT_ID || firestoreProject || '').trim();
  if (!projectId || !firestoreAuth) {
    console.warn('Uorqui orphan notification cleanup skipped: Firestore session unavailable', { postId: id });
    return { deleted: 0, skipped: true };
  }

  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`;
  const response = await upstreamFetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: firestoreAuth,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'notifications' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'data.postId' },
            op: 'EQUAL',
            value: { stringValue: id }
          }
        },
        limit: 250
      }
    })
  });

  if (!response.ok) {
    console.warn('Uorqui orphan notification lookup failed', { postId: id, status: response.status });
    return { deleted: 0, failed: true };
  }

  const rows = await response.json().catch(() => []);
  const names = (Array.isArray(rows) ? rows : [])
    .map(row => String(row?.document?.name || ''))
    .filter(Boolean);

  let deleted = 0;
  for (const name of names) {
    const deleteResponse = await upstreamFetch(`https://firestore.googleapis.com/v1/${name}`, {
      method: 'DELETE',
      headers: { Authorization: firestoreAuth }
    }).catch(() => null);
    if (deleteResponse?.ok || deleteResponse?.status === 404) deleted += 1;
  }

  if (deleted) {
    console.info('Uorqui orphan post notifications cleaned', { postId: id, deleted });
  }
  return { deleted };
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
