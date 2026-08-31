import core, { RealtimeHub } from './mentions.js';

export { RealtimeHub };

const FREE_MEMBER_LIMIT = null;
const PREMIUM_MEMBER_LIMIT = null;
const PREMIUM_MONTHLY_PRICE = 99.90;
const ENTERPRISE_EXTRA_USER_PRICE = 19.90;
const PRODUCT_VERSION = '1.3.0-social';

let googleTokenCache = { expires: 0, token: '' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    try {
      if (method === 'GET' && /^\/api\/companies\/[^/]+\/billing\/tier$/.test(url.pathname)) {
        const companyId = decodeURIComponent(url.pathname.split('/')[3] || '');
        return await getPlanTierResponse(request, env, ctx, companyId);
      }

      if (method === 'POST' && /^\/api\/companies\/[^/]+\/billing\/enterprise$/.test(url.pathname)) {
        const companyId = decodeURIComponent(url.pathname.split('/')[3] || '');
        return await activateEnterprise(request, env, ctx, companyId);
      }

      if (method === 'POST' && /^\/api\/companies\/[^/]+\/billing\/enterprise\/cancel$/.test(url.pathname)) {
        const companyId = decodeURIComponent(url.pathname.split('/')[3] || '');
        return await deactivateEnterprise(request, env, ctx, companyId);
      }


      const response = await core.fetch(request, env, ctx);
      if (!response.ok) return response;

      if (method === 'GET' && url.pathname === '/api/bootstrap') {
        return await rewriteJsonResponse(response, async payload => {
          payload.productVersion = PRODUCT_VERSION;
          if (payload.selectedCompanyId) {
            const plan = await planSnapshot(env, payload.selectedCompanyId);
            decorateCompany(payload.company, plan);
            for (const company of payload.companies || []) {
              if (company.id === payload.selectedCompanyId) decorateCompany(company, plan);
            }
          }
          return payload;
        });
      }

      if (method === 'GET' && url.pathname === '/api/companies/summary') {
        return await rewriteJsonResponse(response, async payload => {
          for (const company of payload.companies || []) {
            const plan = await planSnapshot(env, company.id, Number(company.memberCount || 0));
            decorateCompany(company, plan);
          }
          payload.productVersion = PRODUCT_VERSION;
          return payload;
        });
      }

      if (method === 'GET' && /^\/api\/companies\/[^/]+\/billing$/.test(url.pathname)) {
        return await rewriteJsonResponse(response, async payload => {
          const companyId = decodeURIComponent(url.pathname.split('/')[3] || '');
          const plan = await planSnapshot(env, companyId, Number(payload?.company?.memberCount || 0));
          decorateCompany(payload.company, plan);
          payload.productVersion = PRODUCT_VERSION;
          return payload;
        });
      }

      if (method === 'GET' && url.pathname === '/api/jobs') {
        return await rewriteJsonResponse(response, async payload => {
          if (Array.isArray(payload.jobs)) payload.jobs = payload.jobs.filter(job => job.audience !== 'world');
          return payload;
        });
      }

      if (method === 'GET' && url.pathname === '/api/search') {
        return await rewriteJsonResponse(response, async payload => {
          for (const key of ['posts', 'results', 'items']) {
            if (Array.isArray(payload[key])) payload[key] = payload[key].filter(item => item?.scope !== 'world');
          }
          return payload;
        });
      }

      if (method === 'GET' && /^\/api\/posts\/[^/]+$/.test(url.pathname)) {
        const clone = response.clone();
        const payload = await clone.json().catch(() => null);
        if (payload?.post?.scope === 'world') {
          return json({ error: 'Esta publicação do Mundo está temporariamente indisponível.' }, 404);
        }
      }

      if (method === 'POST' && url.pathname === '/api/invites/accept') {
        const clone = response.clone();
        const payload = await clone.json().catch(() => ({}));
        if (payload?.companyId) defer(ctx, syncEnterpriseBilling(env, payload.companyId));
      }

      const memberDeleteMatch = method === 'DELETE'
        ? url.pathname.match(/^\/api\/companies\/([^/]+)\/members\/[^/]+$/)
        : null;
      if (memberDeleteMatch) {
        defer(ctx, syncEnterpriseBilling(env, decodeURIComponent(memberDeleteMatch[1])));
      }

      const leaveMatch = method === 'POST'
        ? url.pathname.match(/^\/api\/companies\/([^/]+)\/leave$/)
        : null;
      if (leaveMatch) {
        defer(ctx, syncEnterpriseBilling(env, decodeURIComponent(leaveMatch[1])));
      }

      return response;
    } catch (error) {
      console.error('Uorqui v1.2.21 gate:', error);
      return json({ error: error?.message || 'Não foi possível concluir esta ação.' }, error?.status || 500);
    }
  },

  async scheduled(controller, env, ctx) {
    if (typeof core.scheduled === 'function') await core.scheduled(controller, env, ctx);
    defer(ctx, syncAllEnterpriseBilling(env));
  }
};

async function getPlanTierResponse(request, env, ctx, companyId) {
  const bootstrapResponse = await coreBootstrap(request, env, ctx, companyId);
  if (!bootstrapResponse.ok) return bootstrapResponse;
  const bootstrap = await bootstrapResponse.json();
  if (bootstrap.selectedCompanyId !== companyId || !bootstrap.company) {
    return json({ error: 'Empresa não encontrada para sua conta.' }, 404);
  }

  const plan = await planSnapshot(env, companyId, Array.isArray(bootstrap.members) ? bootstrap.members.length : undefined);
  return json({
    ...plan,
    role: bootstrap.role || '',
    owner: bootstrap.role === 'owner',
    billingReady: Boolean(env.ASAAS_API_KEY && env.ASAAS_WEBHOOK_TOKEN),
    productVersion: PRODUCT_VERSION
  });
}

async function activateEnterprise(request, env, ctx, companyId) {
  const bootstrapResponse = await coreBootstrap(request, env, ctx, companyId);
  if (!bootstrapResponse.ok) return bootstrapResponse;
  const bootstrap = await bootstrapResponse.json();
  if (bootstrap.selectedCompanyId !== companyId || !bootstrap.company) {
    return json({ error: 'Empresa não encontrada para sua conta.' }, 404);
  }
  if (bootstrap.role !== 'owner') {
    return json({ error: 'Somente o proprietário pode ativar o Enterprise.' }, 403);
  }

  const company = await fsGet(env, 'companies', companyId);
  if (!company) return json({ error: 'Empresa não encontrada.' }, 404);
  if (!hasPremiumAccess(company) || company.billingStatus !== 'active') {
    return json({ error: 'Ative uma assinatura Premium paga antes de migrar para o Enterprise.' }, 409);
  }
  if (!company.billingSubscriptionId) {
    return json({ error: 'A assinatura ainda não foi vinculada ao Asaas. Aguarde a confirmação do pagamento.' }, 409);
  }

  const activeUsers = await activeMemberCount(env, companyId);
  const monthlyPrice = enterprisePrice(activeUsers);
  await updateAsaasSubscriptionValue(env, company.billingSubscriptionId, monthlyPrice);

  const now = new Date().toISOString();
  await fsPut(env, 'companies', companyId, {
    ...company,
    billingTier: 'enterprise',
    enterpriseActivatedAt: company.enterpriseActivatedAt || now,
    enterpriseActivatedBy: company.enterpriseActivatedBy || bootstrap.me?.uid || '',
    enterpriseActiveUsers: activeUsers,
    enterpriseMonthlyPrice: monthlyPrice,
    enterpriseSyncedAt: now,
    updatedAt: now
  });

  return json({
    ok: true,
    tier: 'enterprise',
    activeUsers,
    monthlyPrice,
    basePrice: PREMIUM_MONTHLY_PRICE,
    includedUsers: null,
    extraUserPrice: ENTERPRISE_EXTRA_USER_PRICE
  });
}

async function deactivateEnterprise(request, env, ctx, companyId) {
  const bootstrapResponse = await coreBootstrap(request, env, ctx, companyId);
  if (!bootstrapResponse.ok) return bootstrapResponse;
  const bootstrap = await bootstrapResponse.json();
  if (bootstrap.selectedCompanyId !== companyId || !bootstrap.company) {
    return json({ error: 'Empresa não encontrada para sua conta.' }, 404);
  }
  if (bootstrap.role !== 'owner') {
    return json({ error: 'Somente o proprietário pode alterar o plano.' }, 403);
  }

  const company = await fsGet(env, 'companies', companyId);
  if (!company) return json({ error: 'Empresa não encontrada.' }, 404);
  const activeUsers = await activeMemberCount(env, companyId);
  if (activeUsers > PREMIUM_MEMBER_LIMIT) {
    return json({ error: `Remova usuários até ficar com no máximo ${PREMIUM_MEMBER_LIMIT} ativos antes de voltar ao Premium.` }, 409);
  }

  if (company.billingSubscriptionId && company.billingStatus === 'active') {
    await updateAsaasSubscriptionValue(env, company.billingSubscriptionId, PREMIUM_MONTHLY_PRICE);
  }

  const now = new Date().toISOString();
  await fsPut(env, 'companies', companyId, {
    ...company,
    billingTier: 'premium',
    enterpriseActiveUsers: 0,
    enterpriseMonthlyPrice: 0,
    enterpriseSyncedAt: now,
    updatedAt: now
  });

  return json({ ok: true, tier: 'premium', monthlyPrice: PREMIUM_MONTHLY_PRICE });
}

async function canManageCompany(request, env, ctx, companyId) {
  const response = await coreBootstrap(request, env, ctx, companyId);
  if (!response.ok) return false;
  const data = await response.json().catch(() => ({}));
  return data.selectedCompanyId === companyId && Boolean(data.canAdmin);
}

async function coreBootstrap(request, env, ctx, companyId) {
  const url = new URL(request.url);
  url.pathname = '/api/bootstrap';
  url.search = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  return core.fetch(new Request(url.toString(), {
    method: 'GET',
    headers: request.headers
  }), env, ctx);
}

async function enforceMemberCapacity() {
  // Comunidades e empresas não têm limite artificial de membros.
  return;
}

async function planSnapshot(env, companyId, knownMemberCount) {
  const company = await fsGet(env, 'companies', companyId);
  const activeUsers = Number.isFinite(knownMemberCount)
    ? Number(knownMemberCount)
    : await activeMemberCount(env, companyId);
  const tier = company ? tierForCompany(company) : 'free';
  const monthlyPrice = tier === 'enterprise'
    ? enterprisePrice(activeUsers)
    : tier === 'premium'
      ? PREMIUM_MONTHLY_PRICE
      : 0;

  return {
    tier,
    activeUsers,
    memberLimit: null,
    basePrice: PREMIUM_MONTHLY_PRICE,
    premiumPrice: PREMIUM_MONTHLY_PRICE,
    includedUsers: PREMIUM_MEMBER_LIMIT,
    extraUserPrice: ENTERPRISE_EXTRA_USER_PRICE,
    monthlyPrice,
    billingStatus: company?.billingStatus || 'inactive',
    billingSubscriptionId: company?.billingSubscriptionId || ''
  };
}

function decorateCompany(company, plan) {
  if (!company || !plan) return company;
  company.limits = { ...(company.limits || {}), members: plan.memberLimit };
  company.premiumMonthlyPrice = PREMIUM_MONTHLY_PRICE;
  company.billingTier = plan.tier;
  company.enterpriseExtraUserPrice = ENTERPRISE_EXTRA_USER_PRICE;
  company.enterpriseIncludedUsers = null;
  company.enterpriseMonthlyPrice = plan.tier === 'enterprise' ? plan.monthlyPrice : 0;
  company.memberCount = Number.isFinite(company.memberCount) ? company.memberCount : plan.activeUsers;
  return company;
}

function tierForCompany(company) {
  if (!hasPremiumAccess(company)) return 'free';
  return company.billingTier === 'enterprise' ? 'enterprise' : 'premium';
}

function hasPremiumAccess(company) {
  if (!company) return false;
  const manualUntil = new Date(company.manualPremiumUntil || 0).getTime();
  if (Number.isFinite(manualUntil) && manualUntil > Date.now()) return true;
  if (company.plan !== 'premium') return false;
  const premiumUntil = new Date(company.premiumUntil || 0).getTime();
  if (Number.isFinite(premiumUntil) && premiumUntil > Date.now()) return true;
  return company.billingStatus === 'active' && !company.premiumUntil;
}

function enterprisePrice(activeUsers) {
  const extras = Math.max(0, Number(activeUsers || 0) - PREMIUM_MEMBER_LIMIT);
  return Number((PREMIUM_MONTHLY_PRICE + extras * ENTERPRISE_EXTRA_USER_PRICE).toFixed(2));
}

async function syncEnterpriseBilling(env, companyId) {
  const company = await fsGet(env, 'companies', companyId);
  if (!company || company.billingTier !== 'enterprise' || !hasPremiumAccess(company)) return;

  const activeUsers = await activeMemberCount(env, companyId);
  const monthlyPrice = enterprisePrice(activeUsers);
  const sameSnapshot = Number(company.enterpriseActiveUsers || 0) === activeUsers &&
    Number(company.enterpriseMonthlyPrice || 0) === monthlyPrice;

  if (!sameSnapshot && company.billingSubscriptionId && company.billingStatus === 'active' && env.ASAAS_API_KEY) {
    await updateAsaasSubscriptionValue(env, company.billingSubscriptionId, monthlyPrice);
  }

  if (!sameSnapshot || !company.enterpriseSyncedAt) {
    const now = new Date().toISOString();
    await fsPut(env, 'companies', companyId, {
      ...company,
      enterpriseActiveUsers: activeUsers,
      enterpriseMonthlyPrice: monthlyPrice,
      enterpriseSyncedAt: now,
      updatedAt: now
    });
  }
}

async function syncAllEnterpriseBilling(env) {
  const companies = await fsWhere(env, 'companies', 'billingTier', 'enterprise', 500).catch(() => []);
  for (const company of companies) {
    try {
      await syncEnterpriseBilling(env, company.id);
    } catch (error) {
      console.warn('Enterprise billing sync:', company.id, error?.message || error);
    }
  }
}

async function activeMemberCount(env, companyId) {
  const members = await fsWhere(env, 'companyMembers', 'companyId', companyId, 500);
  return members.filter(member => member.status === 'active').length;
}

async function updateAsaasSubscriptionValue(env, subscriptionId, value) {
  if (!env.ASAAS_API_KEY) throw httpError(503, 'A cobrança Asaas ainda não está configurada.');
  if (!subscriptionId) throw httpError(409, 'Assinatura Asaas não vinculada.');

  await asaasRequest(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'PUT',
    body: JSON.stringify({ value: Number(value.toFixed(2)) })
  });
}

function asaasApiBase(env) {
  return String(env.ASAAS_ENV || 'sandbox').toLowerCase() === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3';
}

async function asaasRequest(env, path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('access_token', env.ASAAS_API_KEY);
  headers.set('accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${asaasApiBase(env)}${path}`, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = data?.errors?.[0]?.description || data?.error || data?.message || `Asaas: ${response.status}`;
    throw httpError(response.status === 401 ? 503 : 400, message);
  }
  return data;
}

async function rewriteJsonResponse(response, mutator) {
  const payload = await response.clone().json().catch(() => null);
  if (!payload || typeof payload !== 'object') return response;
  const next = await mutator(payload);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(next), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function defer(ctx, promise) {
  const task = Promise.resolve(promise).catch(error => console.warn('Deferred v1.2.21 task:', error?.message || error));
  if (ctx?.waitUntil) ctx.waitUntil(task);
  return task;
}

function isExpired(value) {
  return !value || new Date(value).getTime() < Date.now();
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function fsBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)`;
}

async function getGoogleAccessToken(env) {
  if (googleTokenCache.token && googleTokenCache.expires > Date.now() + 60000) return googleTokenCache.token;
  if (!env.FIREBASE_SERVICE_ACCOUNT_EMAIL || !env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw httpError(503, 'Service Account do Firebase ainda não foi configurada no Worker.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64urlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = b64urlJson({
    iss: env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  const input = `${header}.${claims}`;
  const key = await importPrivateKey(env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY);
  const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(input));
  const assertion = `${input}.${b64url(new Uint8Array(signature))}`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json();
  if (!response.ok) {
    throw httpError(503, `Não foi possível autenticar a API do Firebase: ${data.error_description || data.error || 'erro'}`);
  }

  googleTokenCache = {
    token: data.access_token,
    expires: Date.now() + Number(data.expires_in || 3600) * 1000
  };
  return data.access_token;
}

async function importPrivateKey(pem) {
  const clean = String(pem)
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const bytes = Uint8Array.from(atob(clean), char => char.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function fsRequest(env, path, options = {}) {
  const token = await getGoogleAccessToken(env);
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${fsBase(env)}${path}`, { ...options, headers });
  if (response.status === 404) return null;
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw httpError(500, `Firestore: ${data?.error?.message || response.statusText}`);
  return data;
}

async function fsGet(env, collection, docId) {
  const document = await fsRequest(env, `/documents/${encPath(collection)}/${encodeURIComponent(docId)}`);
  return document ? fromDoc(document) : null;
}

async function fsPut(env, collection, docId, object) {
  const document = await fsRequest(env, `/documents/${encPath(collection)}/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: toFields({ ...object, id: object.id || docId }) })
  });
  return fromDoc(document);
}

async function fsWhere(env, collection, field, value, limit = 100) {
  const body = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: 'EQUAL',
          value: toValue(value)
        }
      },
      limit
    }
  };
  const rows = await fsRequest(env, '/documents:runQuery', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return (Array.isArray(rows) ? rows : []).filter(row => row.document).map(row => fromDoc(row.document));
}

function fromDoc(document) {
  const object = fromFields(document.fields || {});
  object.id = object.id || decodeURIComponent(document.name.split('/').pop());
  return object;
}

function toFields(object) {
  return Object.fromEntries(
    Object.entries(object)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toValue(value)])
  );
}

function toValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFields(value) } };
  return { stringValue: String(value) };
}

function fromFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromValue(value)]));
}

function fromValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromValue);
  if ('mapValue' in value) return fromFields(value.mapValue.fields || {});
  return null;
}

function b64urlJson(object) {
  return b64url(new TextEncoder().encode(JSON.stringify(object)));
}

function b64url(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}
