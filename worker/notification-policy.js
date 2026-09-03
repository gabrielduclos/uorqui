const upstreamFetch = globalThis.fetch.bind(globalThis);

// Política padrão do Uorqui: publicações comuns alimentam o feed, mas não
// geram sino/push. Mantemos notificações que exigem ação ou têm relação direta
// com o usuário (respostas, menções, convites, mensagens, reações e comunicados).
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input || '');
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  let nextInit = init;

  try {
    if (
      method === 'POST' &&
      /firestore\.googleapis\.com\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents:commit(?:\?|$)/i.test(url) &&
      typeof init?.body === 'string'
    ) {
      const payload = JSON.parse(init.body);
      if (Array.isArray(payload?.writes) && payload.writes.length) {
        const originalCount = payload.writes.length;
        const writes = payload.writes.filter(write => !isNewPostNotificationWrite(write));
        const suppressed = originalCount - writes.length;

        if (suppressed > 0) {
          console.info('Uorqui new-post notifications suppressed', { suppressed });

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

    if (
      method === 'POST' &&
      /fcm\.googleapis\.com\/v1\/projects\/[^/]+\/messages:send(?:\?|$)/i.test(url) &&
      typeof init?.body === 'string'
    ) {
      const payload = JSON.parse(init.body);
      if (String(payload?.message?.data?.type || '') === 'new_post') {
        console.info('Uorqui new-post push suppressed');
        return new Response(JSON.stringify({ name: 'uorqui/suppressed/new_post' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }
  } catch (error) {
    console.warn('Uorqui notification policy inspection failed:', error?.message || error);
  }

  return upstreamFetch(input, nextInit);
};

function isNewPostNotificationWrite(write) {
  const update = write?.update;
  if (!update || typeof update !== 'object') return false;

  const name = String(update.name || '');
  if (!/\/documents\/notifications\//i.test(name)) return false;

  const type = String(update?.fields?.type?.stringValue || '');
  return type === 'new_post';
}
