const upstreamFetch = globalThis.fetch.bind(globalThis);
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CORRECT_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

globalThis.fetch = async (input, init) => {
  try {
    const url = input instanceof Request ? input.url : String(input || '');
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (url === GOOGLE_TOKEN_URL && method === 'POST' && init?.body) {
      const raw = init.body instanceof URLSearchParams ? init.body.toString() : String(init.body || '');
      const params = new URLSearchParams(raw);
      const grant = params.get('grant_type') || '';
      if (grant && grant !== CORRECT_GRANT && grant.includes('oauth')) {
        params.set('grant_type', CORRECT_GRANT);
        init = { ...init, body: params };
        console.warn('Uorqui normalized malformed OAuth grant_type before Google token request');
      }
    }
  } catch (error) {
    console.warn('Uorqui OAuth grant safety failed:', error?.message || error);
  }
  return upstreamFetch(input, init);
};
