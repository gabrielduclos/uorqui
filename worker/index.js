import { DurableObject } from 'cloudflare:workers';

const FIREBASE_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache = { expires: 0, keys: [] };
let googleTokenCache = { expires: 0, token: '' };

export class RealtimeHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async createTicket(uid) {
    const ticket = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = Date.now() + 90000;
    await this.ctx.storage.put(`ticket:${ticket}`, { uid: String(uid || ''), expiresAt });
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (!currentAlarm || currentAlarm > expiresAt) await this.ctx.storage.setAlarm(expiresAt);
    return { ticket, expiresAt: new Date(expiresAt).toISOString() };
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/connect' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket obrigatório.', { status: 426 });
    }

    const ticket = url.searchParams.get('ticket') || '';
    const record = ticket ? await this.ctx.storage.get(`ticket:${ticket}`) : null;
    if (!record || Number(record.expiresAt || 0) < Date.now()) {
      if (ticket) await this.ctx.storage.delete(`ticket:${ticket}`);
      return new Response('Ticket de tempo real inválido ou expirado.', { status: 401 });
    }
    await this.ctx.storage.delete(`ticket:${ticket}`);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ uid: record.uid || '' });
    return new Response(null, { status: 101, webSocket: client });
  }

  async broadcast(message) {
    const payload = JSON.stringify({ ...message, sentAt: new Date().toISOString() });
    let delivered = 0;
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
        delivered += 1;
      } catch {}
    }
    return delivered;
  }

  async alarm() {
    const now = Date.now();
    const tickets = await this.ctx.storage.list({ prefix: 'ticket:' });
    let nextExpiration = 0;
    for (const [key, record] of tickets) {
      const expiresAt = Number(record?.expiresAt || 0);
      if (!expiresAt || expiresAt <= now) await this.ctx.storage.delete(key);
      else if (!nextExpiration || expiresAt < nextExpiration) nextExpiration = expiresAt;
    }
    if (nextExpiration) await this.ctx.storage.setAlarm(nextExpiration);
  }

  webSocketMessage() {
    // ping/pong é respondido sem acordar o objeto pelo auto-response acima.
  }

  webSocketClose(socket, code, reason) {
    try { socket.close(code, reason); } catch {}
  }

  webSocketError(socket) {
    try { socket.close(1011, 'realtime error'); } catch {}
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const sameOrigin = !origin || origin === url.origin;

    if (request.method === 'OPTIONS') {
      return corsPreflight(request, env, url.origin);
    }
    // Produção passa a usar frontend e API no mesmo Worker/origem.
    // ALLOWED_ORIGINS continua útil apenas para previews/ambientes externos.
    if (!sameOrigin && origin && !isAllowedOrigin(origin, env)) {
      return jsonWithCors({ error: 'Origem não autorizada.' }, 403, request, env);
    }
    if (!url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 });
    }

    if (request.method === 'GET' && url.pathname === '/api/realtime') {
      try {
        return await connectRealtimeSocket(request, env, url);
      } catch (error) {
        return json({ error: error?.message || 'Não foi possível abrir o tempo real.' }, error?.status || 500);
      }
    }

    // O webhook financeiro é público para o Asaas, mas protegido por token próprio.
    if (request.method === 'POST' && url.pathname === '/api/webhooks/asaas') {
      try {
        return await handleAsaasWebhook(request, env);
      } catch (error) {
        console.error('Asaas webhook:', error);
        return json({ error: error?.message || 'Webhook inválido.' }, error?.status || 500);
      }
    }

    try {
      const identity = await requireAuth(request, env);
      const response = await routeApi(request, env, identity, url, ctx);
      if (response.ok && !['GET', 'HEAD'].includes(request.method.toUpperCase())) {
        const task = broadcastSelectedCompanyMutation(env, identity, request, url);
        if (ctx?.waitUntil) ctx.waitUntil(task);
      }
      return sameOrigin ? response : withCors(response, request, env);
    } catch (error) {
      console.error(error);
      const status = error?.status || 500;
      const payload = { error: status === 500 ? 'Erro interno do Uorqui.' : error.message };
      return sameOrigin ? json(payload, status) : jsonWithCors(payload, status, request, env);
    }
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduled(env));
  }
};

async function routeApi(request, env, identity, url, ctx) {
  const path = url.pathname.slice(4); // remove /api
  const method = request.method.toUpperCase();

  if (method === 'GET' && path === '/bootstrap') return json(await bootstrap(env, identity, url.searchParams.get('companyId'), ctx));
  if (method === 'POST' && path === '/realtime/ticket') {
    return json(await createRealtimeTicket(env, identity, await readJson(request)));
  }
  if (method === 'GET' && path === '/superadmin/overview') {
    return json(await getSuperadminOverview(env, identity));
  }
  if (method === 'GET' && path === '/creator/dashboard') {
    return json(await getCreatorDashboard(env, identity));
  }
  if (method === 'POST' && path === '/creator/activate') {
    return json(await activateCreator(env, identity));
  }
  if (method === 'POST' && /^\/creator\/communities\/[^/]+\/activate$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[3]);
    return json(await activateCreatorCommunity(env, identity, communityId, await readJson(request)));
  }
  if (method === 'PATCH' && /^\/superadmin\/companies\/[^/]+\/premium$/.test(path)) {
    const companyId = decodeURIComponent(path.split('/')[3]);
    return json(await updateSuperadminPremium(env, identity, companyId, await readJson(request)));
  }
  if (method === 'GET' && path === '/companies/summary') return json(await getCompaniesSummary(env, identity));
  if (method === 'PATCH' && path === '/me') return json(await updateMe(env, identity, await readJson(request)));
  if (method === 'DELETE' && path === '/me') return json(await deleteUserAccount(env, identity, await readJson(request)));
  if (method === 'POST' && path === '/push/register') {
    return json(await registerPushToken(env, identity, await readJson(request), ctx), 201);
  }
  if (method === 'DELETE' && path === '/push/register') {
    return json(await unregisterPushToken(env, identity, await readJson(request)));
  }
  if (method === 'POST' && path === '/companies') return json(await createCompany(env, identity, await readJson(request)), 201);
  if (method === 'PATCH' && /^\/companies\/[^/]+$/.test(path)) {
    const companyId = decodeURIComponent(path.split('/')[2]);
    return json(await updateCompany(env, identity, companyId, await readJson(request), ctx));
  }
  if (method === 'DELETE' && /^\/companies\/[^/]+$/.test(path)) {
    const companyId = decodeURIComponent(path.split('/')[2]);
    return json(await requestCompanyDeletion(env, identity, companyId, await readJson(request), ctx));
  }
  if (method === 'GET' && /^\/companies\/[^/]+\/billing$/.test(path)) {
    const companyId = decodeURIComponent(path.split('/')[2]);
    return json(await getBillingStatus(env, identity, companyId));
  }
  if (method === 'POST' && /^\/companies\/[^/]+\/billing\/checkout$/.test(path)) {
    const companyId = decodeURIComponent(path.split('/')[2]);
    return json(await createPremiumCheckout(env, identity, companyId, url.origin));
  }
  if (method === 'POST' && /^\/companies\/[^/]+\/billing\/cancel$/.test(path)) {
    const companyId = decodeURIComponent(path.split('/')[2]);
    return json(await cancelPremiumSubscription(env, identity, companyId));
  }
  if (method === 'GET' && /^\/companies\/[^/]+\/invites$/.test(path)) {
    const companyId = decodeURIComponent(path.split('/')[2]);
    return json(await getCompanyInvites(env, identity, companyId));
  }
  if (method === 'POST' && /^\/companies\/[^/]+\/invites$/.test(path)) {
    const companyId = decodeURIComponent(path.split('/')[2]);
    return json(await createCompanyInvite(env, identity, companyId, await readJson(request), env.APP_ORIGIN || url.origin, ctx), 201);
  }
  if (method === 'DELETE' && /^\/companies\/[^/]+\/invites\/[^/]+$/.test(path)) {
    const parts = path.split('/');
    const companyId = decodeURIComponent(parts[2]);
    const inviteId = decodeURIComponent(parts[4]);
    return json(await cancelCompanyInvite(env, identity, companyId, inviteId));
  }
  if (method === 'POST' && /^\/companies\/[^/]+\/invites\/[^/]+\/resend$/.test(path)) {
    const parts = path.split('/');
    const companyId = decodeURIComponent(parts[2]);
    const inviteId = decodeURIComponent(parts[4]);
    return json(await resendCompanyInvite(env, identity, companyId, inviteId, env.APP_ORIGIN || url.origin, ctx));
  }
  if (method === 'POST' && /^\/companies\/[^/]+\/leave$/.test(path)) {
    const companyId = decodeURIComponent(path.split('/')[2]);
    return json(await leaveCompany(env, identity, companyId, await readJson(request), ctx));
  }
  if (method === 'PATCH' && /^\/companies\/[^/]+\/members\/[^/]+$/.test(path)) {
    const parts = path.split('/');
    const companyId = decodeURIComponent(parts[2]);
    const targetUid = decodeURIComponent(parts[4]);
    return json(await updateCompanyMemberRole(env, identity, companyId, targetUid, await readJson(request)));
  }
  if (method === 'DELETE' && /^\/companies\/[^/]+\/members\/[^/]+$/.test(path)) {
    const parts = path.split('/');
    const companyId = decodeURIComponent(parts[2]);
    const targetUid = decodeURIComponent(parts[4]);
    return json(await removeCompanyMember(env, identity, companyId, targetUid, ctx));
  }
  if (method === 'POST' && /^\/companies\/[^/]+\/communities$/.test(path)) {
    const companyId = decodeURIComponent(path.split('/')[2]);
    return json(await createCommunity(env, identity, companyId, await readJson(request)), 201);
  }
  if (method === 'POST' && path === '/communities') {
    return json(await createSocialCommunity(env, identity, await readJson(request)), 201);
  }
  if (method === 'POST' && /^\/communities\/[^/]+\/invites$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await createCommunityInvite(env, identity, communityId, await readJson(request), ctx), 201);
  }
  if (method === 'GET' && /^\/communities\/[^/]+\/members$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await getCommunityMembers(env, identity, communityId));
  }
  if (method === 'POST' && /^\/communities\/[^/]+\/members$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await addCommunityMember(env, identity, communityId, await readJson(request), ctx), 201);
  }
  if (method === 'DELETE' && /^\/communities\/[^/]+\/members\/[^/]+$/.test(path)) {
    const parts = path.split('/');
    const communityId = decodeURIComponent(parts[2]);
    const targetUid = decodeURIComponent(parts[4]);
    return json(await removeCommunityMember(env, identity, communityId, targetUid, ctx));
  }
  if (method === 'POST' && /^\/communities\/[^/]+\/join$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await requestOrJoinCommunity(env, identity, communityId, ctx));
  }
  if (method === 'GET' && /^\/communities\/[^/]+\/join-status$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await getCommunityJoinStatus(env, identity, communityId));
  }
  if (method === 'POST' && /^\/community-join-requests\/[^/]+\/respond$/.test(path)) {
    const requestId = decodeURIComponent(path.split('/')[2]);
    return json(await respondCommunityJoinRequest(env, identity, requestId, await readJson(request), ctx));
  }
  if (method === 'GET' && /^\/communities\/[^/]+\/topics$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await getCommunityTopics(env, identity, communityId));
  }
  if (method === 'POST' && /^\/communities\/[^/]+\/topics$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await createCommunityTopic(env, identity, communityId, await readJson(request)), 201);
  }
  if (method === 'GET' && /^\/communities\/[^/]+\/posts$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await getCommunityPosts(env, identity, communityId, url.searchParams.get('topicId') || ''));
  }
  if (method === 'PATCH' && /^\/communities\/[^/]+$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await updateCommunityVisibility(env, identity, communityId, await readJson(request)));
  }
  if (method === 'DELETE' && /^\/communities\/[^/]+$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await requestCommunityDeletion(env, identity, communityId, ctx));
  }
  if (method === 'POST' && /^\/deletion-requests\/[^/]+\/approve$/.test(path)) {
    const requestId = decodeURIComponent(path.split('/')[2]);
    return json(await approveDeletionRequest(env, identity, requestId, ctx));
  }
  if (method === 'POST' && path === '/invites/accept') return json(await acceptInvite(env, identity, await readJson(request), ctx));
  if (method === 'GET' && path === '/jobs') {
    return json(await getJobs(env, identity, url.searchParams.get('companyId') || ''));
  }
  if (method === 'POST' && path === '/jobs') {
    return json(await createJob(env, identity, await readJson(request), ctx), 201);
  }
  if (method === 'DELETE' && /^\/jobs\/[^/]+$/.test(path)) {
    const jobId = decodeURIComponent(path.split('/')[2]);
    return json(await deleteJob(env, identity, jobId, ctx));
  }
  if (method === 'POST' && path === '/posts') return json(await createPost(env, identity, await readJson(request), ctx), 201);
  if (method === 'GET' && /^\/posts\/[^/]+$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await getPostDetail(env, identity, postId));
  }
  if (method === 'DELETE' && /^\/posts\/[^/]+$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await deletePost(env, identity, postId, ctx));
  }
  if (method === 'GET' && /^\/posts\/[^/]+\/comments$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await getComments(env, identity, postId, url.searchParams.get('commentId') || ''));
  }
  if (method === 'POST' && /^\/posts\/[^/]+\/comments$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await addComment(env, identity, postId, await readJson(request), ctx), 201);
  }
  if (method === 'POST' && /^\/posts\/[^/]+\/reaction$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await toggleReaction(env, identity, postId, ctx));
  }
  if (method === 'POST' && /^\/comments\/[^/]+\/reaction$/.test(path)) {
    const commentId = decodeURIComponent(path.split('/')[2]);
    return json(await toggleCommentReaction(env, identity, commentId, ctx));
  }
  if (method === 'DELETE' && /^\/comments\/[^/]+$/.test(path)) {
    const commentId = decodeURIComponent(path.split('/')[2]);
    return json(await deleteComment(env, identity, commentId, ctx));
  }
  if (method === 'POST' && /^\/posts\/[^/]+\/read$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await confirmRead(env, identity, postId));
  }
  if (method === 'POST' && /^\/posts\/[^/]+\/solution$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await acceptSolution(env, identity, postId, await readJson(request), ctx));
  }
  if (method === 'POST' && /^\/posts\/[^/]+\/resolve$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await setPostResolved(env, identity, postId, await readJson(request), ctx));
  }
  if (method === 'POST' && /^\/posts\/[^/]+\/poll-vote$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await votePoll(env, identity, postId, await readJson(request), ctx));
  }
  if (method === 'GET' && path === '/search') return json(await searchPosts(env, identity, url.searchParams));
  if (method === 'GET' && path === '/discover') return json(await discoverContent(env, identity));
  if (method === 'GET' && path === '/messages') return json(await listMessageConversations(env, identity, url.searchParams));
  if (method === 'GET' && /^\/messages\/[^/]+$/.test(path)) {
    const targetUid = decodeURIComponent(path.split('/')[2]);
    return json(await getDirectMessages(env, identity, targetUid, url.searchParams));
  }
  if (method === 'POST' && /^\/messages\/[^/]+$/.test(path)) {
    const targetUid = decodeURIComponent(path.split('/')[2]);
    return json(await sendDirectMessage(env, identity, targetUid, await readJson(request), ctx), 201);
  }
  if (method === 'POST' && /^\/messages\/[^/]+\/accept$/.test(path)) {
    const targetUid = decodeURIComponent(path.split('/')[2]);
    return json(await acceptMessageRequest(env, identity, targetUid));
  }
  if (method === 'DELETE' && /^\/messages\/[^/]+\/request$/.test(path)) {
    const targetUid = decodeURIComponent(path.split('/')[2]);
    return json(await rejectMessageRequest(env, identity, targetUid));
  }
  if (method === 'POST' && path === '/media/upload') return json(await uploadMedia(request, env, identity, url.searchParams), 201);
  if (method === 'GET' && /^\/media\/[^/]+$/.test(path)) {
    const mediaId = decodeURIComponent(path.split('/')[2]);
    return await getMedia(env, identity, mediaId);
  }
  if (method === 'POST' && /^\/notifications\/[^/]+\/read$/.test(path)) {
    const notificationId = decodeURIComponent(path.split('/')[2]);
    return json(await markNotificationRead(env, identity, notificationId));
  }
  if (method === 'DELETE' && /^\/notifications\/[^/]+$/.test(path)) {
    const notificationId = decodeURIComponent(path.split('/')[2]);
    return json(await deleteNotification(env, identity, notificationId));
  }
  throw httpError(404, 'Rota não encontrada.');
}

function realtimeStub(env, scope, companyId = '') {
  if (!env.REALTIME) throw httpError(503, 'O tempo real ainda não está disponível neste ambiente.');
  const name = scope === 'world' ? 'world:public' : `company:${companyId}`;
  return env.REALTIME.get(env.REALTIME.idFromName(name));
}

async function createRealtimeTicket(env, identity, body) {
  const scope = body.scope === 'world' ? 'world' : body.scope === 'company' ? 'company' : '';
  if (!scope) throw httpError(400, 'Escopo de tempo real inválido.');

  const companyId = scope === 'company' ? clean(body.companyId, 150) : '';
  if (scope === 'company') await requireCompanyMember(env, identity.uid, companyId);
  const ticket = await realtimeStub(env, scope, companyId).createTicket(identity.uid);
  return { ...ticket, scope, companyId };
}

async function connectRealtimeSocket(request, env, url) {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    throw httpError(426, 'WebSocket obrigatório.');
  }
  const scope = url.searchParams.get('scope') === 'world'
    ? 'world'
    : url.searchParams.get('scope') === 'company'
      ? 'company'
      : '';
  if (!scope) throw httpError(400, 'Escopo de tempo real inválido.');
  const companyId = scope === 'company' ? clean(url.searchParams.get('companyId'), 150) : '';
  if (scope === 'company' && !companyId) throw httpError(400, 'Empresa inválida.');

  const target = new URL(url);
  target.pathname = '/connect';
  target.searchParams.delete('scope');
  target.searchParams.delete('companyId');
  return realtimeStub(env, scope, companyId).fetch(new Request(target.toString(), request));
}

async function broadcastRealtime(env, scope, companyId, event = 'mutation') {
  if (!env.REALTIME) return;
  try {
    await realtimeStub(env, scope, companyId).broadcast({ type: 'refresh', event });
  } catch (error) {
    console.warn('Realtime broadcast:', error?.message || error);
  }
}

async function broadcastRealtimeForPost(env, post, event) {
  if (post.scope === 'world') return broadcastRealtime(env, 'world', '', event);
  if (post.companyId) return broadcastRealtime(env, 'company', post.companyId, event);
}

function deferRealtime(ctx, promise) {
  const task = Promise.resolve(promise).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(task);
  else return task;
}

async function broadcastSelectedCompanyMutation(env, identity, request, url) {
  if (!env.REALTIME) return;
  if (
    url.pathname === '/api/realtime/ticket' ||
    url.pathname === '/api/push/register' ||
    url.pathname === '/api/media/upload' ||
    /^\/api\/jobs(?:\/[^/]+)?$/.test(url.pathname) ||
    /^\/api\/notifications\/[^/]+(?:\/read)?$/.test(url.pathname)
  ) return;

  const companyId = clean(request.headers.get('X-Uorqui-Company') || '', 150);
  if (!companyId) return;
  try {
    await requireCompanyMember(env, identity.uid, companyId);
    await broadcastRealtime(env, 'company', companyId, 'mutation');
  } catch {
    // Cabeçalhos desatualizados ou forjados nunca criam canais de atualização.
  }
}

const FREE_PLAN_LIMITS = Object.freeze({ members: null, communities: null, jobs: null });

function superadminUids(env) {
  return new Set(
    String(env.SUPERADMIN_UIDS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  );
}

function isSuperadmin(env, identity) {
  return Boolean(identity?.uid && superadminUids(env).has(identity.uid));
}

function requireSuperadmin(env, identity) {
  if (!isSuperadmin(env, identity)) {
    throw httpError(403, 'Acesso restrito ao Superadmin do Uorqui.');
  }
}

function activeManualPremiumUntil(company) {
  const value = company?.manualPremiumUntil || '';
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now() ? value : '';
}

function premiumMonthlyPrice(env) {
  const value = Number(env.PREMIUM_MONTHLY_PRICE_BRL || 49.90);
  return Number.isFinite(value) && value > 0 ? value : 49.90;
}

function creatorPlatformFeePercent(env) {
  const value = Number(env.CREATOR_PLATFORM_FEE_PERCENT || 25);
  if (!Number.isFinite(value)) return 25;
  return Math.max(0, Math.min(100, value));
}

function moneyNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function paidCreatorTransaction(item) {
  return ['paid', 'received', 'settled', 'confirmed'].includes(String(item?.status || '').toLowerCase());
}

function completedCreatorPayout(item) {
  return ['paid', 'completed', 'settled', 'transferred'].includes(String(item?.status || '').toLowerCase());
}


function hasPremiumAccess(company) {
  if (!company) return false;

  if (activeManualPremiumUntil(company)) return true;

  if (company.plan !== 'premium') return false;
  const until = company.premiumUntil ? new Date(company.premiumUntil).getTime() : 0;
  if (until > Date.now()) return true;
  return company.billingStatus === 'active' && !company.premiumUntil;
}

function planLimits(company) {
  return hasPremiumAccess(company)
    ? { members: null, communities: null }
    : { ...FREE_PLAN_LIMITS };
}

function companyPlanView(company, env, extras = {}) {
  const manualPremiumUntil = activeManualPremiumUntil(company);
  const paidPremium = Boolean(
    company?.plan === 'premium' &&
    (
      (company?.premiumUntil && new Date(company.premiumUntil).getTime() > Date.now()) ||
      (company?.billingStatus === 'active' && !company?.premiumUntil)
    )
  );
  const effectivePlan = hasPremiumAccess(company) ? 'premium' : 'free';
  return {
    ...company,
    plan: company?.plan === 'premium' ? 'premium' : 'free',
    effectivePlan,
    billingStatus: company?.billingStatus || 'inactive',
    premiumUntil: company?.premiumUntil || '',
    manualPremiumUntil,
    premiumSource: manualPremiumUntil ? 'manual' : paidPremium ? 'asaas' : '',
    limits: planLimits(company),
    billingReady: Boolean(env.ASAAS_API_KEY && env.ASAAS_WEBHOOK_TOKEN),
    premiumMonthlyPrice: premiumMonthlyPrice(env),
    billingSubscriptionId: company?.billingSubscriptionId || '',
    ...extras
  };
}

async function companyUsage(env, companyId) {
  const memberDocs = (await fsWhere(env, 'companyMembers', 'companyId', companyId, 250))
    .filter(member => member.status === 'active');
  const communities = await fsWhere(env, 'communities', 'companyId', companyId, 250);
  return {
    memberCount: memberDocs.length,
    communityCount: communities.length,
    communities,
    members: memberDocs
  };
}

async function assertCommunityCapacity() {
  return;
}

async function assertMemberCapacity() {
  return;
}

async function assertJobCapacity(env, company) {
  if (hasPremiumAccess(company)) return;
  const jobs = await fsWhere(env, 'jobs', 'companyId', company.id, FREE_PLAN_LIMITS.jobs + 2);
  const activeJobs = jobs.filter(job => job.status !== 'closed');
  if (activeJobs.length >= FREE_PLAN_LIMITS.jobs) {
    throw httpError(402, 'O plano Free permite até 3 vagas ativas por empresa. Ative o Uorqui Premium para publicar mais vagas.');
  }
}

async function getCompaniesSummary(env, identity) {
  const memberships = (await fsWhere(env, 'companyMembers', 'uid', identity.uid, 120))
    .filter(m => m.status === 'active');

  const ownCommunityMemberships = await fsWhere(env, 'communityMembers', 'uid', identity.uid, 400);
  const ownCommunityIds = new Set(ownCommunityMemberships.map(m => m.communityId));

  const companies = [];
  for (const membership of memberships) {
    const company = await fsGet(env, 'companies', membership.companyId);
    if (!company) continue;

    const usage = await companyUsage(env, company.id);
    const visibleCommunities = (membership.role === 'owner' || membership.role === 'admin')
      ? usage.communities
      : usage.communities.filter(c => ownCommunityIds.has(c.id));

    const companyCommunityMemberships = await fsWhere(env, 'communityMembers', 'companyId', company.id, 500);
    const counts = {};
    for (const item of companyCommunityMemberships) {
      counts[item.communityId] = Number(counts[item.communityId] || 0) + 1;
    }

    companies.push(companyPlanView(company, env, {
      role: membership.role || 'member',
      memberCount: usage.memberCount,
      communityCount: usage.communityCount,
      administrators: membership.role === 'owner'
        ? usage.members
          .filter(member => member.role === 'admin')
          .map(member => ({
            uid: member.uid,
            displayName: member.displayName || '',
            email: member.email || ''
          }))
          .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email, 'pt-BR'))
        : [],
      communities: visibleCommunities
        .map(c => ({
          id: c.id,
          name: c.name,
          description: c.description || '',
          visibility: normalizedCommunityVisibility(c.visibility),
          memberCount: Number(counts[c.id] || 0)
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    }));
  }

  companies.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return { companies };
}

async function activateCreator(env, identity) {
  const user = await ensureUser(env, identity);
  const now = nowIso();
  const profile = await fsGet(env, 'creatorProfiles', identity.uid);
  const updatedProfile = {
    ...(profile || {}),
    id: identity.uid,
    uid: identity.uid,
    enabled: true,
    platformFeePercent: creatorPlatformFeePercent(env),
    createdAt: profile?.createdAt || now,
    updatedAt: now
  };
  await fsPut(env, 'creatorProfiles', identity.uid, updatedProfile);
  await fsPut(env, 'users', identity.uid, {
    ...user,
    creatorEnabled: true,
    creatorActivatedAt: user.creatorActivatedAt || now,
    updatedAt: now
  });
  return { ok: true, creator: updatedProfile };
}

async function creatorOwnedCommunities(env, uid) {
  const communities = await fsListCollection(env, 'communities', 5000);
  return communities
    .filter(community => !community.companyId && community.createdBy === uid && community.archived !== true)
    .sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
}

async function activateCreatorCommunity(env, identity, communityId, body) {
  await activateCreator(env, identity);
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
  if (community.companyId) throw httpError(400, 'Uma comunidade de empresa não pode ser convertida em comunidade de Criador.');
  if (community.createdBy !== identity.uid) throw httpError(403, 'Somente o dono da comunidade pode ativar o modo Criador.');

  const monthlyPrice = Number(body.monthlyPrice);
  if (!Number.isFinite(monthlyPrice) || monthlyPrice < 4.90 || monthlyPrice > 999.90) {
    throw httpError(400, 'Defina um valor mensal entre R$ 4,90 e R$ 999,90.');
  }

  const now = nowIso();
  const creatorCommunity = {
    id: communityId,
    communityId,
    creatorUid: identity.uid,
    monthlyPrice: Number(monthlyPrice.toFixed(2)),
    platformFeePercent: creatorPlatformFeePercent(env),
    status: 'active',
    createdAt: community.creatorActivatedAt || now,
    updatedAt: now
  };
  await fsPut(env, 'creatorCommunities', communityId, creatorCommunity);
  await fsPut(env, 'communities', communityId, {
    ...community,
    creatorMode: true,
    creatorUid: identity.uid,
    creatorMonthlyPrice: creatorCommunity.monthlyPrice,
    creatorPlatformFeePercent: creatorCommunity.platformFeePercent,
    creatorActivatedAt: community.creatorActivatedAt || now,
    updatedAt: now
  });

  return { ok: true, community: creatorCommunity };
}

async function getCreatorDashboard(env, identity) {
  const [user, profile, ownedCommunities, subscriptions, transactions, payouts, creatorCommunities] = await Promise.all([
    fsGetRequired(env, 'users', identity.uid, 'Usuário não encontrado.'),
    fsGet(env, 'creatorProfiles', identity.uid),
    creatorOwnedCommunities(env, identity.uid),
    fsWhere(env, 'creatorSubscriptions', 'creatorUid', identity.uid, 5000).catch(() => []),
    fsWhere(env, 'creatorTransactions', 'creatorUid', identity.uid, 10000).catch(() => []),
    fsWhere(env, 'creatorPayouts', 'creatorUid', identity.uid, 1000).catch(() => []),
    fsWhere(env, 'creatorCommunities', 'creatorUid', identity.uid, 500).catch(() => [])
  ]);

  const enabled = Boolean(profile?.enabled || user.creatorEnabled);
  const activeSubscriptions = subscriptions.filter(item => String(item.status || '').toLowerCase() === 'active');
  const paidTransactions = transactions.filter(paidCreatorTransaction);

  let grossRevenue = 0;
  let platformFees = 0;
  let creatorNetRevenue = 0;

  for (const item of paidTransactions) {
    const gross = moneyNumber(item.grossAmount ?? item.amount ?? item.value);
    const fee = item.platformFeeAmount !== undefined
      ? moneyNumber(item.platformFeeAmount)
      : gross * (moneyNumber(item.platformFeePercent || creatorPlatformFeePercent(env)) / 100);
    const net = item.creatorNetAmount !== undefined
      ? moneyNumber(item.creatorNetAmount)
      : Math.max(0, gross - fee);

    grossRevenue += gross;
    platformFees += fee;
    creatorNetRevenue += net;
  }

  const completedPayouts = payouts.filter(completedCreatorPayout);
  const totalPaidOut = completedPayouts.reduce((sum, item) =>
    sum + moneyNumber(item.amount ?? item.netAmount ?? item.value), 0);
  const pendingBalance = Math.max(0, creatorNetRevenue - totalPaidOut);

  const creatorCommunityMap = new Map(creatorCommunities.map(item => [item.communityId || item.id, item]));
  const communities = ownedCommunities.map(community => {
    const creator = creatorCommunityMap.get(community.id);
    const activeCount = activeSubscriptions.filter(item => item.communityId === community.id).length;
    return {
      id: community.id,
      name: community.name || 'Comunidade',
      description: community.description || '',
      visibility: normalizedCommunityVisibility(community.visibility),
      creatorEnabled: Boolean(creator?.status === 'active' || community.creatorMode),
      monthlyPrice: moneyNumber(creator?.monthlyPrice ?? community.creatorMonthlyPrice),
      activeSubscribers: activeCount
    };
  });

  const recentSubscriptions = subscriptions
    .sort(byCreatedDesc)
    .slice(0, 50)
    .map(item => ({
      id: item.id,
      communityId: item.communityId || '',
      subscriberUid: item.subscriberUid || '',
      subscriberName: item.subscriberName || '',
      status: item.status || '',
      monthlyPrice: moneyNumber(item.monthlyPrice ?? item.amount),
      createdAt: item.createdAt || '',
      currentPeriodEnd: item.currentPeriodEnd || item.renewalAt || ''
    }));

  const payoutRows = payouts
    .sort(byCreatedDesc)
    .slice(0, 50)
    .map(item => ({
      id: item.id,
      amount: moneyNumber(item.amount ?? item.netAmount ?? item.value),
      status: item.status || '',
      requestedAt: item.requestedAt || item.createdAt || '',
      paidAt: item.paidAt || item.completedAt || ''
    }));

  return {
    creator: {
      enabled,
      platformFeePercent: moneyNumber(profile?.platformFeePercent || creatorPlatformFeePercent(env)),
      createdAt: profile?.createdAt || user.creatorActivatedAt || ''
    },
    metrics: {
      activeSubscribers: activeSubscriptions.length,
      totalSubscriptions: subscriptions.length,
      grossRevenue: Number(grossRevenue.toFixed(2)),
      platformFees: Number(platformFees.toFixed(2)),
      netRevenue: Number(creatorNetRevenue.toFixed(2)),
      pendingBalance: Number(pendingBalance.toFixed(2)),
      totalPaidOut: Number(totalPaidOut.toFixed(2)),
      activeCommunities: communities.filter(item => item.creatorEnabled).length
    },
    communities,
    subscriptions: recentSubscriptions,
    payouts: payoutRows
  };
}

async function getSuperadminOverview(env, identity) {
  requireSuperadmin(env, identity);

  const [users, companies, memberships, communities, posts, comments, creatorProfiles, creatorCommunities, creatorSubscriptions, creatorTransactions, creatorPayouts] = await Promise.all([
    fsListCollection(env, 'users', 5000),
    fsListCollection(env, 'companies', 2500),
    fsListCollection(env, 'companyMembers', 10000),
    fsListCollection(env, 'communities', 10000),
    fsListCollection(env, 'posts', 15000),
    fsListCollection(env, 'comments', 20000),
    fsListCollection(env, 'creatorProfiles', 5000),
    fsListCollection(env, 'creatorCommunities', 5000),
    fsListCollection(env, 'creatorSubscriptions', 15000),
    fsListCollection(env, 'creatorTransactions', 30000),
    fsListCollection(env, 'creatorPayouts', 10000)
  ]);

  const activeMemberships = memberships.filter(item => item.status === 'active');
  const memberCountByCompany = {};
  const communityCountByCompany = {};
  const ownerByCompany = {};
  const userByUid = new Map(users.map(user => [user.uid || user.id, user]));

  for (const membership of activeMemberships) {
    memberCountByCompany[membership.companyId] =
      Number(memberCountByCompany[membership.companyId] || 0) + 1;
    if (membership.role === 'owner') {
      ownerByCompany[membership.companyId] = membership;
    }
  }

  for (const community of communities) {
    communityCountByCompany[community.companyId] =
      Number(communityCountByCompany[community.companyId] || 0) + 1;
  }

  const now = Date.now();
  const last30 = now - 30 * 24 * 60 * 60 * 1000;
  const createdInLast30Days = values =>
    values.filter(item => new Date(item.createdAt || 0).getTime() >= last30).length;

  let premiumCompanies = 0;
  let paidPremiumCompanies = 0;
  let manualPremiumCompanies = 0;

  const rows = companies.map(company => {
    const manualUntil = activeManualPremiumUntil(company);
    const paid = Boolean(
      company.plan === 'premium' &&
      (
        (company.premiumUntil && new Date(company.premiumUntil).getTime() > now) ||
        (company.billingStatus === 'active' && !company.premiumUntil)
      )
    );

    if (hasPremiumAccess(company)) premiumCompanies += 1;
    if (paid) paidPremiumCompanies += 1;
    if (manualUntil) manualPremiumCompanies += 1;

    const ownerMembership = ownerByCompany[company.id];
    const owner = ownerMembership
      ? userByUid.get(ownerMembership.uid) || ownerMembership
      : null;

    return {
      id: company.id,
      name: company.name,
      effectivePlan: hasPremiumAccess(company) ? 'premium' : 'free',
      billingStatus: company.billingStatus || 'inactive',
      premiumSource: manualUntil ? 'manual' : paid ? 'asaas' : '',
      premiumUntil: company.premiumUntil || '',
      manualPremiumUntil: manualUntil,
      memberCount: Number(memberCountByCompany[company.id] || 0),
      communityCount: Number(communityCountByCompany[company.id] || 0),
      ownerName: owner?.displayName || '',
      ownerEmail: owner?.email || ownerMembership?.email || '',
      createdAt: company.createdAt || ''
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const enabledCreators = creatorProfiles.filter(item => item.enabled !== false);
  const activeCreatorSubscriptions = creatorSubscriptions.filter(item => String(item.status || '').toLowerCase() === 'active');
  const paidCreatorTransactions = creatorTransactions.filter(paidCreatorTransaction);

  let creatorGrossRevenue = 0;
  let creatorPlatformRevenue = 0;
  let creatorNetRevenue = 0;
  for (const item of paidCreatorTransactions) {
    const gross = moneyNumber(item.grossAmount ?? item.amount ?? item.value);
    const fee = item.platformFeeAmount !== undefined
      ? moneyNumber(item.platformFeeAmount)
      : gross * (moneyNumber(item.platformFeePercent || creatorPlatformFeePercent(env)) / 100);
    creatorGrossRevenue += gross;
    creatorPlatformRevenue += fee;
    creatorNetRevenue += item.creatorNetAmount !== undefined
      ? moneyNumber(item.creatorNetAmount)
      : Math.max(0, gross - fee);
  }

  const creatorPaidOut = creatorPayouts
    .filter(completedCreatorPayout)
    .reduce((sum, item) => sum + moneyNumber(item.amount ?? item.netAmount ?? item.value), 0);

  const subscriptionsByCreator = {};
  const grossByCreator = {};
  const feeByCreator = {};
  for (const subscription of activeCreatorSubscriptions) {
    subscriptionsByCreator[subscription.creatorUid] = Number(subscriptionsByCreator[subscription.creatorUid] || 0) + 1;
  }
  for (const transaction of paidCreatorTransactions) {
    const gross = moneyNumber(transaction.grossAmount ?? transaction.amount ?? transaction.value);
    const fee = transaction.platformFeeAmount !== undefined
      ? moneyNumber(transaction.platformFeeAmount)
      : gross * (moneyNumber(transaction.platformFeePercent || creatorPlatformFeePercent(env)) / 100);
    grossByCreator[transaction.creatorUid] = moneyNumber(grossByCreator[transaction.creatorUid]) + gross;
    feeByCreator[transaction.creatorUid] = moneyNumber(feeByCreator[transaction.creatorUid]) + fee;
  }

  const creatorRows = enabledCreators.map(profile => {
    const uid = profile.uid || profile.id;
    const user = userByUid.get(uid) || {};
    return {
      uid,
      displayName: user.displayName || 'Criador',
      email: user.email || '',
      activeSubscribers: Number(subscriptionsByCreator[uid] || 0),
      grossRevenue: Number(moneyNumber(grossByCreator[uid]).toFixed(2)),
      platformRevenue: Number(moneyNumber(feeByCreator[uid]).toFixed(2)),
      communityCount: creatorCommunities.filter(item => item.creatorUid === uid && item.status === 'active').length,
      createdAt: profile.createdAt || user.creatorActivatedAt || ''
    };
  }).sort((a,b) => b.grossRevenue - a.grossRevenue || a.displayName.localeCompare(b.displayName, 'pt-BR'));

  return {
    metrics: {
      totalUsers: users.length,
      totalCompanies: companies.length,
      freeCompanies: Math.max(0, companies.length - premiumCompanies),
      premiumCompanies,
      paidPremiumCompanies,
      manualPremiumCompanies,
      activeMemberships: activeMemberships.length,
      totalCommunities: communities.length,
      totalPosts: posts.length,
      totalComments: comments.length,
      newUsers30d: createdInLast30Days(users),
      newCompanies30d: createdInLast30Days(companies),
      posts30d: createdInLast30Days(posts),
      comments30d: createdInLast30Days(comments),
      estimatedMonthlyRecurringRevenue:
        Number((paidPremiumCompanies * premiumMonthlyPrice(env)).toFixed(2)),
      premiumMonthlyPrice: premiumMonthlyPrice(env),
      totalCreators: enabledCreators.length,
      activeCreatorCommunities: creatorCommunities.filter(item => item.status === 'active').length,
      activeCreatorSubscriptions: activeCreatorSubscriptions.length,
      creatorGrossRevenue: Number(creatorGrossRevenue.toFixed(2)),
      creatorPlatformRevenue: Number(creatorPlatformRevenue.toFixed(2)),
      creatorNetRevenue: Number(creatorNetRevenue.toFixed(2)),
      creatorPaidOut: Number(creatorPaidOut.toFixed(2)),
      creatorPendingPayout: Number(Math.max(0, creatorNetRevenue - creatorPaidOut).toFixed(2)),
      creatorPlatformFeePercent: creatorPlatformFeePercent(env)
    },
    companies: rows,
    creators: creatorRows,
    generatedAt: nowIso()
  };
}

async function updateSuperadminPremium(env, identity, companyId, body) {
  requireSuperadmin(env, identity);

  const company = await fsGetRequired(env, 'companies', companyId, 'Empresa não encontrada.');
  const action = clean(body.action || 'grant', 20);

  if (action === 'revoke') {
    const updated = {
      ...company,
      manualPremiumUntil: '',
      manualPremiumGrantedAt: '',
      manualPremiumGrantedBy: '',
      manualPremiumNote: clean(body.note || '', 240),
      updatedAt: nowIso()
    };
    await fsPut(env, 'companies', companyId, updated);
    await fsPut(env, 'superadminAudit', id(), {
      actorUid: identity.uid,
      action: 'manual_premium_revoked',
      companyId,
      companyName: company.name,
      createdAt: nowIso()
    });
    return {
      ok: true,
      company: companyPlanView(updated, env),
      message: hasPremiumAccess(updated)
        ? 'Cortesia removida. O Premium pago continua ativo.'
        : 'Premium manual removido.'
    };
  }

  const days = Math.floor(Number(body.days || 30));
  if (!Number.isFinite(days) || days < 1 || days > 3650) {
    throw httpError(400, 'Informe um período entre 1 e 3650 dias.');
  }

  const currentManual = company.manualPremiumUntil
    ? new Date(company.manualPremiumUntil).getTime()
    : 0;
  const startAt = currentManual > Date.now() ? currentManual : Date.now();
  const manualPremiumUntil = new Date(
    startAt + days * 24 * 60 * 60 * 1000
  ).toISOString();

  const updated = {
    ...company,
    manualPremiumUntil,
    manualPremiumGrantedAt: nowIso(),
    manualPremiumGrantedBy: identity.uid,
    manualPremiumNote: clean(body.note || '', 240),
    updatedAt: nowIso()
  };

  await fsPut(env, 'companies', companyId, updated);
  await fsPut(env, 'superadminAudit', id(), {
    actorUid: identity.uid,
    action: 'manual_premium_granted',
    companyId,
    companyName: company.name,
    days,
    manualPremiumUntil,
    createdAt: nowIso()
  });

  return {
    ok: true,
    company: companyPlanView(updated, env),
    message: `Premium manual adicionado por ${days} dia(s).`
  };
}

async function bootstrap(env, identity, requestedCompanyId, ctx) {
  const me = await ensureUser(env, identity);
  await exposePendingEmailInvites(env, identity, ctx);

  const memberships = (await fsWhere(env, 'companyMembers', 'uid', identity.uid, 10)).filter(m => m.status === 'active');
  const companies = [];
  for (const membership of memberships) {
    const company = await fsGet(env, 'companies', membership.companyId);
    if (company) companies.push(companyPlanView(company, env, { role: membership.role }));
  }
  let selectedCompanyId = requestedCompanyId && memberships.some(m => m.companyId === requestedCompanyId)
    ? requestedCompanyId
    : (memberships[0]?.companyId || '');
  const company = selectedCompanyId ? companies.find(c => c.id === selectedCompanyId) || null : null;
  const role = memberships.find(m => m.companyId === selectedCompanyId)?.role || null;
  const canAdmin = role === 'owner' || role === 'admin';

  const cmAll = await fsWhere(env, 'communityMembers', 'uid', identity.uid, 150);
  const communityMemberships = cmAll.filter(m => !selectedCompanyId || m.companyId === selectedCompanyId);
  const memberCommunityIds = new Set(communityMemberships.map(m => m.communityId));

  const companyCommunityMemberships = selectedCompanyId
    ? await fsWhere(env, 'communityMembers', 'companyId', selectedCompanyId, 500)
    : [];
  const memberCountByCommunity = {};
  for (const membership of companyCommunityMemberships) {
    memberCountByCommunity[membership.communityId] = Number(memberCountByCommunity[membership.communityId] || 0) + 1;
  }

  const rawCompanyCommunities = selectedCompanyId ? await fsWhere(env, 'communities', 'companyId', selectedCompanyId, 120) : [];
  const companyCommunities = rawCompanyCommunities.map(c => ({
    ...communityView(c),
    memberCount: Number(memberCountByCommunity[c.id] || 0)
  }));
  const communities = companyCommunities.filter(c => memberCommunityIds.has(c.id)).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  const communityIds = new Set(communities.map(c => c.id));
  const communityMap = Object.fromEntries(communities.map(c => [c.id, c]));

  let posts = [];
  if (selectedCompanyId) {
    const raw = await fsWhere(env, 'posts', 'companyId', selectedCompanyId, 100);
    const visiblePostCommunityIds = canAdmin
      ? new Set(companyCommunities.map(community => community.id))
      : communityIds;
    posts = raw.filter(p => p.scope === 'company' || (p.scope === 'community' && visiblePostCommunityIds.has(p.communityId)));
  }
  let worldPosts = await fsWhere(env, 'posts', 'scope', 'world', 40);

  const userReactions = await fsWhere(env, 'reactions', 'uid', identity.uid, 200);
  const likedIds = new Set(userReactions.map(r => r.postId));
  const userReceipts = await fsWhere(env, 'readReceipts', 'uid', identity.uid, 200);
  const readIds = new Set(userReceipts.map(r => r.postId));
  const userPollVotes = await fsWhere(env, 'pollVotes', 'uid', identity.uid, 200);
  const pollVoteMap = new Map(userPollVotes.map(vote => [vote.postId, vote.optionId]));
  posts = enrichPosts(posts, likedIds, readIds, pollVoteMap).slice(0, 60);
  worldPosts = enrichPosts(worldPosts, likedIds, readIds, pollVoteMap).slice(0, 40);

  let notifications = await fsWhere(env, 'notifications', 'recipientUid', identity.uid, 100);

  // v1.2.4: confirmation of reading is exclusive to announcements.
  // Close any legacy pending receipt generated for a normal post/question/poll/event.
  for (let index = 0; index < notifications.length; index += 1) {
    const notification = notifications[index];
    if (
      notification.type !== 'read_required' ||
      !notification.persistent ||
      notification.status !== 'pending_confirmation' ||
      !notification.data?.postId
    ) continue;

    try {
      const linkedPost = await fsGet(env, 'posts', notification.data.postId);
      if (!linkedPost || linkedPost.type !== 'announcement' || !linkedPost.requiresReadReceipt) {
        const closed = {
          ...notification,
          read: true,
          persistent: false,
          status: 'receipt_not_required',
          readAt: nowIso()
        };
        await fsPut(env, 'notifications', notification.id, closed);
        notifications[index] = closed;
      }
    } catch {}
  }

  notifications = notifications.sort(byCreatedDesc).slice(0, 60);

  let allCompanyCommunities = companyCommunities.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  let members = [];
  if (selectedCompanyId && canAdmin) {
    const companyMemberDocs = (await fsWhere(env, 'companyMembers', 'companyId', selectedCompanyId, 100)).filter(m => m.status === 'active');
    members = companyMemberDocs.slice(0, 100).map(m => ({ uid:m.uid, role:m.role, displayName:m.displayName||'', email:m.email||'' }));
  }

  return {
    me, companies, selectedCompanyId, company, role, canAdmin,
    isSuperadmin: isSuperadmin(env, identity),
    communities, communityMap, posts, worldPosts, notifications,
    allCompanyCommunities, members
  };
}

function enrichPosts(posts, likedIds, readIds, pollVoteMap = new Map()) {
  return posts.sort(byCreatedDesc).map(p => ({
    ...p,
    liked: likedIds.has(p.id),
    hasRead: readIds.has(p.id),
    myPollOptionId: pollVoteMap.get(p.id) || ''
  }));
}

async function ensureUser(env, identity) {
  let user = await fsGet(env, 'users', identity.uid);
  if (!user) {
    user = {
      uid: identity.uid,
      email: normalizeEmail(identity.email || ''),
      displayName: identity.name || (identity.email ? identity.email.split('@')[0] : 'Usuário'),
      username: '', bio: '', avatarMediaId: '', createdAt: nowIso(), updatedAt: nowIso()
    };
    await fsPut(env, 'users', identity.uid, user);
  } else if (identity.email && user.email !== normalizeEmail(identity.email)) {
    user.email = normalizeEmail(identity.email); user.updatedAt = nowIso(); await fsPut(env, 'users', identity.uid, user);
  }
  return user;
}

async function updateMe(env, identity, body) {
  const user = await ensureUser(env, identity);
  const avatarMediaId = body.avatarMediaId === undefined ? (user.avatarMediaId || '') : clean(body.avatarMediaId, 150);

  if (avatarMediaId) {
    const media = await fsGetRequired(env, 'media', avatarMediaId, 'Foto não encontrada.');
    if (media.ownerUid !== identity.uid || media.scope !== 'avatar') throw httpError(403, 'Esta foto não pertence ao seu perfil.');
  }

  const previousAvatar = user.avatarMediaId || '';
  user.avatarMediaId = avatarMediaId;
  user.updatedAt = nowIso();
  await fsPut(env, 'users', identity.uid, user);

  const authoredPosts = await fsWhere(env, 'posts', 'authorUid', identity.uid, 120);
  for (const post of authoredPosts) await fsPut(env, 'posts', post.id, { ...post, authorAvatarMediaId: avatarMediaId });
  const authoredComments = await fsWhere(env, 'comments', 'authorUid', identity.uid, 120);
  for (const comment of authoredComments) await fsPut(env, 'comments', comment.id, { ...comment, authorAvatarMediaId: avatarMediaId });

  if (previousAvatar && previousAvatar !== avatarMediaId) {
    const old = await fsGet(env, 'media', previousAvatar);
    if (old?.ownerUid === identity.uid && old.scope === 'avatar') {
      try { await env.MEDIA.delete(old.key); } catch {}
      try { await fsDelete(env, 'media', previousAvatar); } catch {}
    }
  }

  return { user };
}

async function deleteUserAccount(env, identity, body) {
  if (clean(body.confirmation || '', 20).toUpperCase() !== 'EXCLUIR') {
    throw httpError(400, 'Digite EXCLUIR para confirmar a exclusão da conta.');
  }

  const [
    user,
    memberships,
    ownedCompanies,
    communityMemberships,
    notifications,
    pushSubscriptions,
    reactions,
    commentReactions,
    readReceipts,
    pollVotes,
    authoredPosts,
    authoredComments,
    authoredJobs,
    ownedMedia,
    targetInvites,
    sentInvites
  ] = await Promise.all([
    fsGet(env, 'users', identity.uid),
    fsWhere(env, 'companyMembers', 'uid', identity.uid, 500),
    fsWhere(env, 'companies', 'ownerUid', identity.uid, 100),
    fsWhere(env, 'communityMembers', 'uid', identity.uid, 500),
    fsWhere(env, 'notifications', 'recipientUid', identity.uid, 500),
    fsWhere(env, 'pushSubscriptions', 'uid', identity.uid, 100),
    fsWhere(env, 'reactions', 'uid', identity.uid, 500),
    fsWhere(env, 'commentReactions', 'uid', identity.uid, 500),
    fsWhere(env, 'readReceipts', 'uid', identity.uid, 500),
    fsWhere(env, 'pollVotes', 'uid', identity.uid, 500),
    fsWhere(env, 'posts', 'authorUid', identity.uid, 500),
    fsWhere(env, 'comments', 'authorUid', identity.uid, 500),
    fsWhere(env, 'jobs', 'authorUid', identity.uid, 500),
    fsWhere(env, 'media', 'ownerUid', identity.uid, 500),
    fsWhere(env, 'invites', 'targetUid', identity.uid, 250),
    fsWhere(env, 'invites', 'invitedBy', identity.uid, 250)
  ]);

  const ownerMemberships = memberships.filter(item => item.status === 'active' && item.role === 'owner');
  const ownedCompanyIds = new Set([
    ...ownedCompanies.map(company => company.id),
    ...ownerMemberships.map(membership => membership.companyId)
  ]);
  if (ownedCompanyIds.size) {
    const names = [];
    for (const companyId of ownedCompanyIds) {
      const company = ownedCompanies.find(item => item.id === companyId) || await fsGet(env, 'companies', companyId);
      if (company?.name) names.push(company.name);
    }
    throw httpError(
      409,
      `Antes de apagar sua conta, transfira a propriedade ou exclua ${names.length === 1 ? 'a empresa' : 'as empresas'}: ${names.join(', ') || 'empresa vinculada'}.`
    );
  }

  const deletedAt = nowIso();
  await fsBatchPut(env, authoredPosts.map(post => ({
    collection: 'posts',
    id: post.id,
    data: {
      ...post,
      authorUid: '',
      authorName: 'Conta removida',
      authorAvatarMediaId: '',
      resolvedByUid: post.resolvedByUid === identity.uid ? '' : post.resolvedByUid || '',
      authorAccountDeletedAt: deletedAt,
      updatedAt: deletedAt
    }
  })));
  await fsBatchPut(env, authoredComments.map(comment => ({
    collection: 'comments',
    id: comment.id,
    data: {
      ...comment,
      authorUid: '',
      authorName: 'Conta removida',
      authorAvatarMediaId: '',
      authorAccountDeletedAt: deletedAt,
      updatedAt: deletedAt
    }
  })));
  await fsBatchPut(env, authoredJobs.map(job => ({
    collection: 'jobs',
    id: job.id,
    data: {
      ...job,
      authorUid: '',
      authorName: 'Conta removida',
      authorAccountDeletedAt: deletedAt,
      updatedAt: deletedAt
    }
  })));

  for (const media of ownedMedia) {
    if (media.scope === 'avatar' || media.id === user?.avatarMediaId) {
      try { await env.MEDIA.delete(media.key); } catch {}
      try { await fsDelete(env, 'media', media.id); } catch {}
    } else {
      await fsPut(env, 'media', media.id, {
        ...media,
        ownerUid: '',
        ownerAccountDeletedAt: deletedAt,
        updatedAt: deletedAt
      });
    }
  }

  const invitationUpdates = new Map();
  for (const invite of targetInvites) {
    invitationUpdates.set(invite.id, {
      ...invite,
      targetUid: '',
      acceptedBy: invite.acceptedBy === identity.uid ? '' : invite.acceptedBy || '',
      targetAccountDeletedAt: deletedAt,
      updatedAt: deletedAt
    });
  }
  for (const invite of sentInvites) {
    const current = invitationUpdates.get(invite.id) || invite;
    invitationUpdates.set(invite.id, {
      ...current,
      invitedBy: '',
      inviterAccountDeletedAt: deletedAt,
      updatedAt: deletedAt
    });
  }
  await fsBatchPut(env, Array.from(invitationUpdates.values()).map(invite => ({
    collection: 'invites',
    id: invite.id,
    data: invite
  })));

  await fsBatchDelete(env, [
    ...memberships.map(item => ({ collection: 'companyMembers', id: item.id })),
    ...communityMemberships.map(item => ({ collection: 'communityMembers', id: item.id })),
    ...notifications.map(item => ({ collection: 'notifications', id: item.id })),
    ...pushSubscriptions.map(item => ({ collection: 'pushSubscriptions', id: item.id })),
    ...reactions.map(item => ({ collection: 'reactions', id: item.id })),
    ...commentReactions.map(item => ({ collection: 'commentReactions', id: item.id })),
    ...readReceipts.map(item => ({ collection: 'readReceipts', id: item.id })),
    ...pollVotes.map(item => ({ collection: 'pollVotes', id: item.id })),
    { collection: 'users', id: identity.uid }
  ]);

  return {
    ok: true,
    deletedAt,
    anonymizedPosts: authoredPosts.length,
    anonymizedComments: authoredComments.length,
    anonymizedJobs: authoredJobs.length
  };
}

async function exposePendingEmailInvites(env, identity, ctx) {
  if (!identity.email) return;
  const email = normalizeEmail(identity.email);
  const invites = await fsWhere(env, 'invites', 'email', email, 10);
  for (const invite of invites) {
    if (invite.status !== 'pending' || isExpired(invite.expiresAt)) continue;
    const nid = `invite_${invite.id}_${identity.uid}`;
    const existingNotification = await fsGet(env, 'notifications', nid);
    if (!existingNotification) await createInviteNotification(env, invite, identity.uid, ctx);
    if (identity.email_verified && invite.targetUid !== identity.uid) {
      await fsPut(env, 'invites', invite.id, { ...invite, targetUid: identity.uid, updatedAt: nowIso() });
    }
  }
}

async function createCompany(env, identity, body) {
  const name = clean(body.name, 120);
  if (!name) throw httpError(400, 'Informe o nome da empresa.');

  const cnpjDigits = onlyDigits(body.cnpj).slice(0, 14);
  if (!isValidCnpj(cnpjDigits)) throw httpError(400, 'Informe um CNPJ válido.');

  const addressInput = body.address && typeof body.address === 'object' ? body.address : {};
  const address = {
    postalCode: onlyDigits(addressInput.postalCode).slice(0, 8),
    street: clean(addressInput.street, 160),
    number: clean(addressInput.number, 30),
    complement: clean(addressInput.complement || '', 100),
    district: clean(addressInput.district, 100),
    city: clean(addressInput.city, 100),
    state: clean(addressInput.state, 2).toUpperCase()
  };
  if (
    address.postalCode.length !== 8 || !address.street || !address.number ||
    !address.district || !address.city || !/^[A-Z]{2}$/.test(address.state)
  ) {
    throw httpError(400, 'Preencha o endereço completo da empresa para emissão de nota fiscal.');
  }

  const duplicates = await fsWhere(env, 'companies', 'cnpjDigits', cnpjDigits, 2);
  if (duplicates.length) throw httpError(409, 'Já existe uma empresa cadastrada com este CNPJ.');

  await ensureUser(env, identity);
  const companyId = id();
  const company = {
    id: companyId,
    name,
    slug: slugify(name),
    cnpj: formatCnpj(cnpjDigits),
    cnpjDigits,
    address,
    ownerUid: identity.uid,
    plan: 'free',
    billingStatus: 'inactive',
    billingProvider: 'asaas',
    billingCheckoutId: '',
    billingCheckoutLink: '',
    billingSubscriptionId: '',
    billingCustomerId: '',
    premiumUntil: '',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const creator = await fsGet(env,'users',identity.uid);
  const ownerMembership = {
    id:`${companyId}_${identity.uid}`,
    companyId,
    uid: identity.uid,
    displayName:creator?.displayName||identity.name||'',
    email:normalizeEmail(identity.email||''),
    role:'owner',
    status:'active',
    joinedAt:nowIso()
  };
  try {
    await fsCommit(env, [
      { update: { collection: 'companies', id: companyId, data: company } },
      { update: { collection: 'companyMembers', id: ownerMembership.id, data: ownerMembership } },
      {
        update: {
          collection: 'companyCnpjRegistry',
          id: cnpjDigits,
          data: { cnpjDigits, companyId, companyName: name, createdAt: company.createdAt },
          createOnly: true
        }
      }
    ]);
  } catch (error) {
    if (error?.status === 409) throw httpError(409, 'Já existe uma empresa cadastrada com este CNPJ.');
    throw error;
  }
  // Comunidades agora sao sempre criadas manualmente pelo administrador.
  // Publicacoes para toda a empresa continuam usando scope === 'company'.
  return { company };
}

async function syncCompanyNameReferences(env, companyId, companyName) {
  const [posts, jobs, invites] = await Promise.all([
    fsWhere(env, 'posts', 'companyId', companyId, 500),
    fsWhere(env, 'jobs', 'companyId', companyId, 500).catch(() => []),
    fsWhere(env, 'invites', 'companyId', companyId, 500).catch(() => [])
  ]);
  await fsBatchPut(env, [
    ...posts.filter(item => item.companyName !== companyName).map(item => ({
      collection: 'posts', id: item.id, data: { ...item, companyName }
    })),
    ...jobs.filter(item => item.companyName !== companyName).map(item => ({
      collection: 'jobs', id: item.id, data: { ...item, companyName }
    })),
    ...invites.filter(item => item.companyName !== companyName).map(item => ({
      collection: 'invites', id: item.id, data: { ...item, companyName }
    }))
  ]);
}

async function updateCompany(env, identity, companyId, body, ctx) {
  await requireCompanyAdmin(env, identity.uid, companyId);
  const company = await fsGetRequired(env, 'companies', companyId, 'Empresa não encontrada.');
  const name = clean(body.name, 120);
  if (!name) throw httpError(400, 'Informe o nome da empresa.');

  const cnpjDigits = onlyDigits(body.cnpj).slice(0, 14);
  if (!isValidCnpj(cnpjDigits)) throw httpError(400, 'Informe um CNPJ válido.');

  const addressInput = body.address && typeof body.address === 'object' ? body.address : {};
  const address = {
    postalCode: onlyDigits(addressInput.postalCode).slice(0, 8),
    street: clean(addressInput.street, 160),
    number: clean(addressInput.number, 30),
    complement: clean(addressInput.complement || '', 100),
    district: clean(addressInput.district, 100),
    city: clean(addressInput.city, 100),
    state: clean(addressInput.state, 2).toUpperCase()
  };
  if (
    address.postalCode.length !== 8 || !address.street || !address.number ||
    !address.district || !address.city || !/^[A-Z]{2}$/.test(address.state)
  ) {
    throw httpError(400, 'Preencha o endereço completo da empresa para emissão de nota fiscal.');
  }

  const duplicates = await fsWhere(env, 'companies', 'cnpjDigits', cnpjDigits, 3);
  if (duplicates.some(item => item.id !== companyId)) {
    throw httpError(409, 'Já existe uma empresa cadastrada com este CNPJ.');
  }

  const updatedAt = nowIso();
  const updated = {
    ...company,
    name,
    slug: slugify(name),
    cnpj: formatCnpj(cnpjDigits),
    cnpjDigits,
    address,
    updatedAt,
    updatedBy: identity.uid
  };
  const previousCnpjDigits = onlyDigits(company.cnpjDigits || company.cnpj).slice(0, 14);
  const registry = {
    cnpjDigits,
    companyId,
    companyName: name,
    createdAt: company.createdAt || updatedAt,
    updatedAt
  };
  const operations = [
    { update: { collection: 'companies', id: companyId, data: updated } },
    {
      update: {
        collection: 'companyCnpjRegistry',
        id: cnpjDigits,
        data: registry,
        createOnly: previousCnpjDigits !== cnpjDigits
      }
    }
  ];
  if (previousCnpjDigits && previousCnpjDigits !== cnpjDigits) {
    operations.push({ delete: { collection: 'companyCnpjRegistry', id: previousCnpjDigits } });
  }

  try {
    await fsCommit(env, operations);
  } catch (error) {
    if (error?.status === 409) throw httpError(409, 'Já existe uma empresa cadastrada com este CNPJ.');
    throw error;
  }

  if (company.name !== name) {
    const syncTask = syncCompanyNameReferences(env, companyId, name)
      .catch(error => console.error('Falha ao atualizar o nome da empresa nos conteúdos:', error));
    if (ctx?.waitUntil) ctx.waitUntil(syncTask);
    else await syncTask;
  }
  deferRealtime(ctx, broadcastRealtime(env, 'company', companyId, 'company_updated'));
  return { company: companyPlanView(updated, env) };
}

async function cleanupCompanyAccessForUser(env, companyId, uid) {
  const memberships = await fsWhere(env, 'communityMembers', 'uid', uid, 500);
  const companyMemberships = memberships
    .filter(item => item.companyId === companyId)
    .map(item => ({ collection: 'communityMembers', id: item.id }));
  await fsBatchDelete(env, companyMemberships);
}

async function leaveCompany(env, identity, companyId, body, ctx) {
  const company = await fsGetRequired(env, 'companies', companyId, 'Empresa não encontrada.');
  const membershipId = `${companyId}_${identity.uid}`;
  const membership = await requireCompanyMember(env, identity.uid, companyId);
  let newOwner = null;

  if (membership.role === 'owner' || company.ownerUid === identity.uid) {
    const newOwnerUid = clean(body.newOwnerUid, 150);
    if (!newOwnerUid || newOwnerUid === identity.uid) {
      throw httpError(400, 'Escolha outro administrador para receber a propriedade.');
    }

    newOwner = await fsGet(env, 'companyMembers', `${companyId}_${newOwnerUid}`);
    if (!newOwner || newOwner.status !== 'active' || newOwner.role !== 'admin') {
      throw httpError(400, 'Escolha um administrador ativo desta empresa.');
    }

    const transferredAt = nowIso();
    await fsCommit(env, [
      {
        update: {
          collection: 'companies',
          id: companyId,
          data: { ...company, ownerUid: newOwnerUid, ownershipTransferredAt: transferredAt, updatedAt: transferredAt }
        }
      },
      {
        update: {
          collection: 'companyMembers',
          id: `${companyId}_${newOwnerUid}`,
          data: { ...newOwner, role: 'owner', ownershipReceivedAt: transferredAt, updatedAt: transferredAt }
        }
      },
      {
        update: {
          collection: 'notifications',
          id: `ownership_${companyId}_${newOwnerUid}_${Date.now()}`,
          data: {
            recipientUid: newOwnerUid,
            type: 'company_ownership_received',
            title: `Você agora é proprietário de ${company.name}`,
            body: 'A propriedade da empresa foi transferida para sua conta.',
            data: { companyId },
            read: false,
            status: 'new',
            createdAt: transferredAt
          }
        }
      },
      { delete: { collection: 'companyMembers', id: membershipId } }
    ]);
  } else {
    await fsDelete(env, 'companyMembers', membershipId);
  }

  const cleanupTask = cleanupCompanyAccessForUser(env, companyId, identity.uid)
    .catch(error => console.error('Falha ao limpar acesso às comunidades após saída da empresa:', error));
  if (ctx?.waitUntil) ctx.waitUntil(cleanupTask);
  else await cleanupTask;

  const remainingMemberships = (await fsWhere(env, 'companyMembers', 'uid', identity.uid, 20))
    .filter(item => item.status === 'active');

  return {
    ok: true,
    leftCompanyId: companyId,
    newOwnerUid: newOwner?.uid || '',
    nextCompanyId: remainingMemberships[0]?.companyId || ''
  };
}

async function deletionApproversForCompany(env, companyId) {
  const members = await fsWhere(env, 'companyMembers', 'companyId', companyId, 500);
  return [...new Set(
    members
      .filter(member => member.status === 'active' && ['owner', 'admin'].includes(member.role))
      .map(member => member.uid)
      .filter(Boolean)
  )];
}

async function deletionApproversForCommunity(env, community) {
  if (community.companyId) return deletionApproversForCompany(env, community.companyId);

  const members = await fsWhere(env, 'communityMembers', 'communityId', community.id, 500);
  const approvers = new Set(
    members
      .filter(member => ['owner', 'admin', 'moderator'].includes(member.role))
      .map(member => member.uid)
      .filter(Boolean)
  );
  if (community.createdBy) approvers.add(community.createdBy);
  return [...approvers];
}

async function createDeletionRequest(env, identity, entityType, entity, approverUids, ctx) {
  if (!approverUids.length) throw httpError(409, 'Não há administradores elegíveis para aprovar esta exclusão.');
  if (!approverUids.includes(identity.uid)) {
    throw httpError(403, 'Somente um administrador pode solicitar a exclusão.');
  }

  const existing = await fsWhere(env, 'deletionRequests', 'entityId', entity.id, 20);
  const pending = existing.find(item => item.entityType === entityType && item.status === 'pending');
  if (pending) return {
    ok: true,
    pending: true,
    requestId: pending.id,
    requiredApprovals: pending.requiredApproverUids?.length || approverUids.length,
    approvals: pending.approvedByUids?.length || 0
  };

  const requestId = id();
  const request = {
    id: requestId,
    entityType,
    entityId: entity.id,
    entityName: entity.name || (entityType === 'company' ? 'Empresa' : 'Comunidade'),
    companyId: entityType === 'company' ? entity.id : (entity.companyId || ''),
    requestedBy: identity.uid,
    requiredApproverUids: approverUids,
    approvedByUids: [],
    status: 'pending',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await fsPut(env, 'deletionRequests', requestId, request);

  const notificationWrites = approverUids.map(uid => ({
    collection: 'notifications',
    id: `deletion_approval_${requestId}_${uid}`,
    data: {
      recipientUid: uid,
      type: 'deletion_approval_required',
      title: entityType === 'company'
        ? `Aprovar exclusão de ${request.entityName}`
        : `Aprovar exclusão da comunidade ${request.entityName}`,
      body: 'A exclusão só acontecerá quando todos os administradores aprovarem. Todo o conteúdo vinculado será removido automaticamente.',
      data: {
        deletionRequestId: requestId,
        entityType,
        entityId: entity.id,
        entityName: request.entityName,
        companyId: request.companyId || '',
        targetView: 'notifications'
      },
      read: false,
      persistent: true,
      status: 'pending',
      createdAt: request.createdAt
    }
  }));
  await fsBatchPut(env, notificationWrites);

  deferPushes(ctx, notificationWrites.map(item => sendPushToUser(env, item.data.recipientUid, {
    title: item.data.title,
    body: item.data.body,
    notificationId: item.id,
    type: item.data.type,
    deletionRequestId: requestId,
    companyId: request.companyId || '',
    targetView: 'notifications',
    url: '/?notifications=1'
  })));

  return {
    ok: true,
    pending: true,
    requestId,
    requiredApprovals: approverUids.length,
    approvals: 0
  };
}

async function requestCompanyDeletion(env, identity, companyId, body, ctx) {
  const company = await fsGetRequired(env, 'companies', companyId, 'Empresa não encontrada.');
  await requireCompanyAdmin(env, identity.uid, companyId);

  const confirmation = clean(body.confirmation || '', 160);
  if (confirmation !== company.name) {
    throw httpError(400, 'Digite exatamente o nome da empresa para confirmar a solicitação.');
  }

  const approvers = await deletionApproversForCompany(env, companyId);
  const pendingSecurityChanges = await fsWhere(env, 'adminSecurityChanges', 'companyId', companyId, 100).catch(() => []);
  for (const change of pendingSecurityChanges) {
    if (change.status === 'pending' && change.targetUid) approvers.push(change.targetUid);
  }
  return createDeletionRequest(env, identity, 'company', company, [...new Set(approvers)], ctx);
}

async function requestCommunityDeletion(env, identity, communityId, ctx) {
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
  const approvers = await deletionApproversForCommunity(env, community);
  return createDeletionRequest(env, identity, 'community', community, approvers, ctx);
}

async function deletePostCascade(env, post) {
  const comments = await fsWhere(env, 'comments', 'postId', post.id, 500);
  for (const comment of comments) {
    const byComment = await fsWhere(env, 'commentReactions', 'commentId', comment.id, 500).catch(() => []);
    for (const reaction of byComment) await fsDelete(env, 'commentReactions', reaction.id);
    await fsDelete(env, 'comments', comment.id);
  }

  const relatedCollections = ['reactions', 'commentReactions', 'pollVotes', 'readReceipts'];
  for (const collection of relatedCollections) {
    const rows = await fsWhere(env, collection, 'postId', post.id, 500).catch(() => []);
    for (const row of rows) await fsDelete(env, collection, row.id);
  }

  for (const attachment of (post.attachments || [])) {
    const media = await fsGet(env, 'media', attachment.id);
    if (!media) continue;
    try { await env.MEDIA.delete(media.key); } catch {}
    try { await fsDelete(env, 'media', media.id); } catch {}
  }

  await fsDelete(env, 'posts', post.id);
}

async function deleteCommunityCascade(env, communityId) {
  const community = await fsGet(env, 'communities', communityId);
  if (!community) return;

  const posts = await fsWhere(env, 'posts', 'communityId', communityId, 500);
  for (const post of posts) await deletePostCascade(env, post);

  const topics = await fsWhere(env, 'communityTopics', 'communityId', communityId, 500).catch(() => []);
  for (const topic of topics) {
    const topicMembers = await fsWhere(env, 'communityTopicMembers', 'topicId', topic.id, 500).catch(() => []);
    for (const member of topicMembers) await fsDelete(env, 'communityTopicMembers', member.id);
    await fsDelete(env, 'communityTopics', topic.id);
  }

  const cleanupQueries = [
    ['communityMembers', 'communityId'],
    ['communityJoinRequests', 'communityId'],
    ['invites', 'communityId']
  ];
  for (const [collection, field] of cleanupQueries) {
    const rows = await fsWhere(env, collection, field, communityId, 500).catch(() => []);
    for (const row of rows) await fsDelete(env, collection, row.id);
  }

  const mediaRows = await fsWhere(env, 'media', 'communityId', communityId, 500).catch(() => []);
  for (const media of mediaRows) {
    try { await env.MEDIA.delete(media.key); } catch {}
    try { await fsDelete(env, 'media', media.id); } catch {}
  }

  const notifications = await fsWhere(env, 'notifications', 'data.communityId', communityId, 500).catch(() => []);
  for (const notification of notifications) await fsDelete(env, 'notifications', notification.id);

  await fsDelete(env, 'communities', communityId);
}

async function deleteCompanyCascade(env, company) {
  const companyId = company.id;

  if (company.billingSubscriptionId && env.ASAAS_API_KEY) {
    try {
      await asaasRequest(env, `/subscriptions/${encodeURIComponent(company.billingSubscriptionId)}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'INACTIVE' })
      });
    } catch (error) {
      console.warn('Não foi possível inativar a assinatura antes da exclusão:', error?.message || error);
    }
  }

  const communities = await fsWhere(env, 'communities', 'companyId', companyId, 500);
  for (const community of communities) await deleteCommunityCascade(env, community.id);

  // Publicações gerais da empresa, não ligadas a uma comunidade.
  const companyPosts = await fsWhere(env, 'posts', 'companyId', companyId, 500);
  for (const post of companyPosts) {
    const stillExists = await fsGet(env, 'posts', post.id);
    if (stillExists) await deletePostCascade(env, stillExists);
  }

  const mediaRows = await fsWhere(env, 'media', 'companyId', companyId, 500).catch(() => []);
  for (const media of mediaRows) {
    try { await env.MEDIA.delete(media.key); } catch {}
    try { await fsDelete(env, 'media', media.id); } catch {}
  }

  const cleanupQueries = [
    ['invites', 'companyId'],
    ['jobs', 'companyId'],
    ['companyMembers', 'companyId']
  ];
  for (const [collection, field] of cleanupQueries) {
    const rows = await fsWhere(env, collection, field, companyId, 500).catch(() => []);
    for (const row of rows) await fsDelete(env, collection, row.id);
  }

  const notifications = await fsWhere(env, 'notifications', 'data.companyId', companyId, 500).catch(() => []);
  for (const notification of notifications) await fsDelete(env, 'notifications', notification.id);

  await fsCommit(env, [
    { delete: { collection: 'companies', id: companyId } },
    ...(company.cnpjDigits ? [{ delete: { collection: 'companyCnpjRegistry', id: company.cnpjDigits } }] : [])
  ]);
}

async function approveDeletionRequest(env, identity, requestId, ctx) {
  const request = await fsGetRequired(env, 'deletionRequests', requestId, 'Solicitação de exclusão não encontrada.');
  if (request.status !== 'pending') throw httpError(409, 'Esta solicitação já foi concluída.');

  const required = Array.isArray(request.requiredApproverUids) ? request.requiredApproverUids : [];
  if (!required.includes(identity.uid)) throw httpError(403, 'Você não é um dos administradores responsáveis por esta aprovação.');

  const approvals = new Set(Array.isArray(request.approvedByUids) ? request.approvedByUids : []);
  approvals.add(identity.uid);
  const approvedByUids = [...approvals];
  const complete = required.every(uid => approvals.has(uid));
  const updatedAt = nowIso();

  if (!complete) {
    await fsPut(env, 'deletionRequests', requestId, {
      ...request,
      approvedByUids,
      updatedAt
    });
    const notificationId = `deletion_approval_${requestId}_${identity.uid}`;
    const notification = await fsGet(env, 'notifications', notificationId);
    if (notification) {
      await fsPut(env, 'notifications', notificationId, {
        ...notification,
        read: true,
        persistent: false,
        status: 'approved',
        updatedAt
      });
    }
    return {
      ok: true,
      deleted: false,
      approvals: approvedByUids.length,
      requiredApprovals: required.length
    };
  }

  // Marca antes de iniciar a cascata para impedir dupla execução.
  await fsPut(env, 'deletionRequests', requestId, {
    ...request,
    approvedByUids,
    status: 'executing',
    updatedAt
  });

  if (request.entityType === 'company') {
    const company = await fsGetRequired(env, 'companies', request.entityId, 'Empresa não encontrada.');
    await deleteCompanyCascade(env, company);
  } else if (request.entityType === 'community') {
    await deleteCommunityCascade(env, request.entityId);
  } else {
    throw httpError(400, 'Tipo de exclusão inválido.');
  }

  const completedAt = nowIso();
  await fsPut(env, 'deletionRequests', requestId, {
    ...request,
    approvedByUids,
    status: 'completed',
    completedAt,
    updatedAt: completedAt
  });

  // As notificações vinculadas à entidade podem ter sido apagadas pela cascata.
  // Gera uma confirmação limpa para cada administrador.
  for (const uid of required) {
    await fsPut(env, 'notifications', `deletion_completed_${requestId}_${uid}`, {
      recipientUid: uid,
      type: 'deletion_completed',
      title: request.entityType === 'company' ? 'Empresa excluída' : 'Comunidade excluída',
      body: `${request.entityName} e todo o conteúdo vinculado foram removidos.`,
      data: { targetView: 'notifications' },
      read: false,
      status: 'new',
      createdAt: completedAt
    });
  }

  deferPushes(ctx, required.map(uid => sendPushToUser(env, uid, {
    title: request.entityType === 'company' ? 'Empresa excluída' : 'Comunidade excluída',
    body: `${request.entityName} e todo o conteúdo vinculado foram removidos.`,
    type: 'deletion_completed',
    targetView: 'notifications',
    url: '/?notifications=1'
  })));

  return {
    ok: true,
    deleted: true,
    approvals: approvedByUids.length,
    requiredApprovals: required.length
  };
}


async function updateCompanyMemberRole(env, identity, companyId, targetUid, body) {
  const actor = await requireCompanyAdmin(env, identity.uid, companyId);
  if (actor.role !== 'owner') throw httpError(403, 'Somente o proprietário pode alterar níveis de acesso.');

  const [company, target] = await Promise.all([
    fsGetRequired(env, 'companies', companyId, 'Empresa não encontrada.'),
    fsGetRequired(env, 'companyMembers', `${companyId}_${targetUid}`, 'Colaborador não encontrado.')
  ]);
  if (target.status !== 'active') throw httpError(400, 'Este colaborador não está ativo.');
  if (target.role === 'owner') throw httpError(400, 'O nível do proprietário não pode ser alterado.');

  const role = body.role === 'admin' ? 'admin' : body.role === 'member' ? 'member' : null;
  if (!role) throw httpError(400, 'Escolha Administrador ou Usuário.');
  if (role === target.role) return { member: target, unchanged: true };

  if (target.role === 'admin' && role === 'member' && isEstablishedAdmin(target)) {
    const change = await createAdminSecurityChange(env, identity.uid, company, target, 'demote', 'member');
    return {
      pending: true,
      securityDelay: true,
      executeAfter: change.executeAfter,
      message: 'Este administrador possui mais de 7 dias de função. O rebaixamento foi agendado e só ocorrerá após 24 horas corridas.'
    };
  }

  const updatedAt = nowIso();
  const updated = {
    ...target,
    role,
    adminSince: role === 'admin' ? updatedAt : '',
    roleUpdatedAt: updatedAt,
    updatedAt
  };
  await fsPut(env, 'companyMembers', target.id || `${companyId}_${targetUid}`, updated);

  await fsPut(env, 'notifications', `role_${companyId}_${targetUid}_${Date.now()}`, {
    recipientUid: targetUid,
    type: 'role_changed',
    title: 'Seu nível de acesso foi alterado',
    body: role === 'admin' ? 'Você agora é Administrador desta empresa no Uorqui.' : 'Seu nível agora é Usuário.',
    data: { companyId },
    read: false,
    status: 'new',
    createdAt: updatedAt
  });

  return { member: updated };
}

async function removeCompanyMember(env, identity, companyId, targetUid, ctx) {
  const actor = await requireCompanyAdmin(env, identity.uid, companyId);
  if (targetUid === identity.uid) {
    throw httpError(400, 'Use a opção Sair da empresa para remover seu próprio acesso.');
  }

  const [company, target] = await Promise.all([
    fsGetRequired(env, 'companies', companyId, 'Empresa não encontrada.'),
    fsGetRequired(env, 'companyMembers', `${companyId}_${targetUid}`, 'Colaborador não encontrado.')
  ]);
  if (target.status !== 'active') throw httpError(400, 'Este colaborador não está ativo.');
  if (target.role === 'owner' || company.ownerUid === targetUid) {
    throw httpError(400, 'Transfira a propriedade antes de remover o proprietário.');
  }
  if (target.role === 'admin' && actor.role !== 'owner') {
    throw httpError(403, 'Somente o proprietário pode remover outro administrador.');
  }

  if (target.role === 'admin' && isEstablishedAdmin(target)) {
    const change = await createAdminSecurityChange(env, identity.uid, company, target, 'remove');
    return {
      pending: true,
      securityDelay: true,
      executeAfter: change.executeAfter,
      message: 'Este administrador possui mais de 7 dias de função. A remoção foi agendada e só ocorrerá após 24 horas corridas.'
    };
  }

  await executeCompanyMemberRemoval(env, company, target);

  deferPushes(ctx, [sendPushToUser(env, targetUid, {
    title: `Você foi removido de ${company.name}`,
    body: 'Seu acesso à empresa e aos espaços vinculados foi removido.',
    type: 'company_member_removed',
    companyId,
    targetView: 'notifications',
    url: '/?notifications=1'
  })]);

  return { ok: true, removedUid: targetUid };
}

async function createCompanyInvite(env, identity, companyId, body, origin, ctx) {
  const admin = await requireCompanyAdmin(env, identity.uid, companyId);
  const company = await fsGet(env, 'companies', companyId);
  const email = normalizeEmail(body.email || '');
  if (!isEmail(email)) throw httpError(400, 'Informe um e-mail válido.');
  const users = await fsWhere(env, 'users', 'email', email, 5);
  if (users[0]) {
    const existing = await fsGet(env,'companyMembers',`${companyId}_${users[0].uid}`);
    if (existing?.status === 'active') throw httpError(409, 'Este usuário já faz parte da empresa.');
  }
  const existingInvites = await fsWhere(env, 'invites', 'companyId', companyId, 40);
  if (existingInvites.some(invite => invite.type === 'company' && invite.status === 'pending' && invite.email === email && !isExpired(invite.expiresAt))) {
    throw httpError(409, 'Já existe um convite pendente para este e-mail.');
  }
  await assertMemberCapacity(env, companyId, true);
  const token = randomToken(); const inviteId = id();
  const invite = {
    id: inviteId, type:'company', companyId, companyName:company.name, email,
    invitedBy: identity.uid, inviterRole: admin.role, status:'pending', tokenHash: await sha256(token),
    createdAt:nowIso(), expiresAt:new Date(Date.now()+7*86400000).toISOString()
  };
  if (users[0]) invite.targetUid = users[0].uid;
  await fsPut(env, 'invites', inviteId, invite);
  if (invite.targetUid) await createInviteNotification(env, invite, invite.targetUid, ctx);
  const inviteUrl = `${origin.replace(/\/$/,'')}/?invite=${encodeURIComponent(token)}`;
  const emailResult = await maybeSendInviteEmail(env, email, company.name, inviteUrl);
  await fsPut(env, 'invites', inviteId, {
    ...invite,
    emailSent: emailResult.sent,
    emailStatus: emailResult.status,
    emailError: emailResult.error || '',
    emailProviderId: emailResult.providerId || '',
    emailSentAt: emailResult.sent ? nowIso() : '',
    updatedAt: nowIso()
  });
  return {
    inviteId,
    inviteUrl,
    emailSent: emailResult.sent,
    emailStatus: emailResult.status,
    emailError: emailResult.error || ''
  };
}

async function getCompanyInvites(env, identity, companyId) {
  await requireCompanyAdmin(env, identity.uid, companyId);
  const invites = await fsWhere(env, 'invites', 'companyId', companyId, 250);

  return {
    invites: invites
      .filter(invite => invite.status !== 'accepted')
      .map(invite => ({
        id: invite.id,
        type: invite.type === 'community' ? 'community' : 'company',
        email: invite.email || '',
        communityId: invite.communityId || '',
        communityName: invite.communityName || '',
        status: invite.status === 'pending' && isExpired(invite.expiresAt) ? 'expired' : invite.status || 'pending',
        emailSent: Boolean(invite.emailSent),
        emailStatus: invite.emailStatus || (invite.emailSent ? 'sent' : 'unknown'),
        emailError: invite.emailError || '',
        createdAt: invite.createdAt || '',
        expiresAt: invite.expiresAt || '',
        acceptedAt: invite.acceptedAt || '',
        canceledAt: invite.canceledAt || '',
        lastResentAt: invite.lastResentAt || '',
        resendCount: Number(invite.resendCount || 0)
      }))
      .sort(byCreatedDesc)
  };
}

async function requireManagedInvite(env, identity, companyId, inviteId) {
  await requireCompanyAdmin(env, identity.uid, companyId);
  const invite = await fsGetRequired(env, 'invites', inviteId, 'Convite não encontrado.');
  if (invite.companyId !== companyId) throw httpError(403, 'Este convite pertence a outra empresa.');
  return invite;
}

async function cancelCompanyInvite(env, identity, companyId, inviteId) {
  const invite = await requireManagedInvite(env, identity, companyId, inviteId);
  if (invite.status === 'accepted') throw httpError(409, 'Um convite já aceito não pode ser cancelado.');
  if (invite.status === 'canceled') return { ok: true, alreadyCanceled: true };

  const canceledAt = nowIso();
  const updated = {
    ...invite,
    status: 'canceled',
    tokenHash: '',
    canceledAt,
    canceledBy: identity.uid,
    updatedAt: canceledAt
  };
  const operations = [
    { update: { collection: 'invites', id: invite.id, data: updated } }
  ];

  if (invite.targetUid) {
    const notificationId = `invite_${invite.id}_${invite.targetUid}`;
    const notification = await fsGet(env, 'notifications', notificationId);
    if (notification) {
      operations.push({
        update: {
          collection: 'notifications',
          id: notificationId,
          data: { ...notification, read: true, status: 'canceled', updatedAt: canceledAt }
        }
      });
    }
  }

  await fsCommit(env, operations);
  return { ok: true, inviteId: invite.id, status: 'canceled' };
}

async function resendCompanyInvite(env, identity, companyId, inviteId, origin, ctx) {
  const invite = await requireManagedInvite(env, identity, companyId, inviteId);
  if (invite.status === 'accepted') throw httpError(409, 'Este convite já foi aceito.');

  const lastSentAt = new Date(invite.lastResentAt || invite.emailSentAt || invite.createdAt || 0).getTime();
  if (Number.isFinite(lastSentAt) && Date.now() - lastSentAt < 60 * 1000) {
    throw httpError(429, 'Aguarde um minuto antes de reenviar este convite.');
  }

  let targetUid = invite.targetUid || '';
  if (invite.type === 'company') {
    const users = invite.email ? await fsWhere(env, 'users', 'email', invite.email, 5) : [];
    if (users[0]) targetUid = users[0].uid;
    if (targetUid) {
      const existingMember = await fsGet(env, 'companyMembers', `${companyId}_${targetUid}`);
      if (existingMember?.status === 'active') throw httpError(409, 'Este usuário já faz parte da empresa.');
    }
    if (invite.status !== 'pending' || isExpired(invite.expiresAt)) {
      await assertMemberCapacity(env, companyId, true);
    }
  } else {
    if (!targetUid) throw httpError(400, 'O destinatário deste convite não está mais disponível.');
    const companyMember = await fsGet(env, 'companyMembers', `${companyId}_${targetUid}`);
    if (!companyMember || companyMember.status !== 'active') {
      throw httpError(409, 'O destinatário não faz mais parte da empresa.');
    }
    const communityMember = await fsGet(env, 'communityMembers', `${invite.communityId}_${targetUid}`);
    if (communityMember) throw httpError(409, 'Este usuário já participa da comunidade.');
  }

  const token = randomToken();
  const lastResentAt = nowIso();
  const updated = {
    ...invite,
    targetUid,
    status: 'pending',
    tokenHash: await sha256(token),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    canceledAt: '',
    canceledBy: '',
    lastResentAt,
    lastResentBy: identity.uid,
    resendCount: Number(invite.resendCount || 0) + 1,
    updatedAt: lastResentAt
  };
  await fsPut(env, 'invites', invite.id, updated);

  if (targetUid) await createInviteNotification(env, updated, targetUid, ctx);

  let inviteUrl = '';
  let emailResult = { sent: false, status: 'not_applicable', error: '', providerId: '' };
  if (invite.type === 'company') {
    inviteUrl = `${origin.replace(/\/$/,'')}/?invite=${encodeURIComponent(token)}`;
    emailResult = await maybeSendInviteEmail(env, invite.email, invite.companyName, inviteUrl);
  }

  const finalInvite = {
    ...updated,
    emailSent: emailResult.sent,
    emailStatus: emailResult.status,
    emailError: emailResult.error || '',
    emailProviderId: emailResult.providerId || '',
    emailSentAt: emailResult.sent ? lastResentAt : '',
    updatedAt: nowIso()
  };
  await fsPut(env, 'invites', invite.id, finalInvite);

  return {
    ok: true,
    inviteId: invite.id,
    inviteUrl,
    emailSent: emailResult.sent,
    emailStatus: emailResult.status,
    emailError: emailResult.error || '',
    status: 'pending',
    expiresAt: finalInvite.expiresAt
  };
}

function normalizedCommunityVisibility(value) {
  return value === 'public' ? 'public' : 'private';
}

function publicCommunity(community) {
  return normalizedCommunityVisibility(community?.visibility) === 'public';
}

function communityView(community) {
  return { ...community, visibility: normalizedCommunityVisibility(community?.visibility) };
}

async function createSocialCommunity(env, identity, body) {
  await ensureUser(env, identity);
  const name = clean(body.name, 90);
  const description = clean(body.description || '', 280);
  const visibility = normalizedCommunityVisibility(body.visibility);
  if (!name) throw httpError(400, 'Informe o nome da comunidade.');

  const communityId = id();
  const createdAt = nowIso();
  const community = {
    id: communityId,
    companyId: '',
    name,
    description,
    visibility,
    isDefault: false,
    createdBy: identity.uid,
    createdAt,
    updatedAt: createdAt
  };
  const membership = {
    id: `${communityId}_${identity.uid}`,
    companyId: '',
    communityId,
    uid: identity.uid,
    role: 'owner',
    joinedAt: createdAt,
    addedBy: identity.uid
  };
  await fsPut(env, 'communities', communityId, community);
  await fsPut(env, 'communityMembers', membership.id, membership);
  return { community: communityView(community) };
}

async function createCommunity(env, identity, companyId, body) {
  await requireCompanyAdmin(env, identity.uid, companyId);
  await assertCommunityCapacity(env, companyId);
  const name=clean(body.name,90), description=clean(body.description||'',280);
  const visibility=normalizedCommunityVisibility(body.visibility);
  if(!name)throw httpError(400,'Informe o nome da comunidade.');
  const communityId=id(); const community={id:communityId,companyId,name,description,visibility,isDefault:false,createdBy:identity.uid,createdAt:nowIso()};
  await fsPut(env,'communities',communityId,community);
  await fsPut(env,'communityMembers',`${communityId}_${identity.uid}`,{id:`${communityId}_${identity.uid}`,companyId,communityId,uid:identity.uid,role:'moderator',joinedAt:nowIso()});
  return { community };
}

async function updateCommunityVisibility(env, identity, communityId, body) {
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
  if (community.companyId) {
    await requireCompanyAdmin(env, identity.uid, community.companyId);
  } else if (!(await canManageCommunityStructure(env, identity, community))) {
    throw httpError(403, 'Somente o dono ou moderadores podem alterar esta comunidade.');
  }

  if (body.visibility !== 'public' && body.visibility !== 'private') {
    throw httpError(400, 'Escolha se a comunidade é pública ou privada.');
  }

  const updated = {
    ...community,
    visibility: normalizedCommunityVisibility(body.visibility),
    updatedAt: nowIso(),
    updatedBy: identity.uid
  };
  await fsPut(env, 'communities', communityId, updated);
  return { community: communityView(updated) };
}

async function requireCommunityAccess(env, uid, community) {
  if (!community.companyId) {
    if (publicCommunity(community)) return { uid, role: 'member', social: true };
    const membership = await requireCommunityMember(env, uid, community.id);
    return membership;
  }

  const companyMember = await requireCompanyMember(env, uid, community.companyId);
  if (companyMember.role === 'owner' || companyMember.role === 'admin') return companyMember;
  if (publicCommunity(community)) return companyMember;
  await requireCommunityMember(env, uid, community.id);
  return companyMember;
}

async function getCommunityJoinStatus(env, identity, communityId) {
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
  const membership = await fsGet(env, 'communityMembers', `${communityId}_${identity.uid}`);
  const request = await fsGet(env, 'communityJoinRequests', `${communityId}_${identity.uid}`);
  return {
    community: communityView(community),
    member: Boolean(membership),
    requestStatus: request?.status || '',
    canJoinImmediately: publicCommunity(community)
  };
}

async function requestOrJoinCommunity(env, identity, communityId, ctx) {
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
  await ensureUser(env, identity);

  const memberId = `${communityId}_${identity.uid}`;
  const existingMember = await fsGet(env, 'communityMembers', memberId);
  if (existingMember) return { status: 'joined', alreadyMember: true, communityId };

  if (community.companyId) {
    throw httpError(403, 'Esta é uma comunidade de empresa. Somente a empresa pode convidar colaboradores.');
  }

  if (publicCommunity(community)) {
    const membership = {
      id: memberId,
      companyId: community.companyId || '',
      communityId,
      uid: identity.uid,
      role: 'member',
      joinedAt: nowIso(),
      joinedBy: 'self'
    };
    await fsPut(env, 'communityMembers', memberId, membership);
    return { status: 'joined', communityId };
  }

  const requestId = memberId;
  const existing = await fsGet(env, 'communityJoinRequests', requestId);
  if (existing?.status === 'pending') return { status: 'pending', requestId, communityId };

  const user = await fsGet(env, 'users', identity.uid);
  const request = {
    id: requestId,
    communityId,
    companyId: community.companyId || '',
    requesterUid: identity.uid,
    requesterName: user?.displayName || identity.name || 'Usuário',
    requesterEmail: user?.email || identity.email || '',
    status: 'pending',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await fsPut(env, 'communityJoinRequests', requestId, request);

  const recipients = new Set();
  if (community.createdBy && community.createdBy !== identity.uid) recipients.add(community.createdBy);

  const communityMembers = await fsWhere(env, 'communityMembers', 'communityId', communityId, 500);
  for (const member of communityMembers) {
    if (member.uid && member.uid !== identity.uid && ['owner','moderator','admin'].includes(member.role)) recipients.add(member.uid);
  }

  if (community.companyId) {
    const companyMembers = await fsWhere(env, 'companyMembers', 'companyId', community.companyId, 500);
    for (const member of companyMembers) {
      if (member.uid && member.uid !== identity.uid && member.status === 'active' && ['owner','admin'].includes(member.role)) recipients.add(member.uid);
    }
  }

  const createdAt = nowIso();
  const notifications = [...recipients].map(uid => ({
    collection: 'notifications',
    id: `community_join_request_${communityId}_${identity.uid}_${uid}`,
    data: {
      recipientUid: uid,
      type: 'community_join_request',
      title: `${request.requesterName} quer participar de ${community.name}`,
      body: 'Aceite ou recuse a solicitação de participação.',
      data: {
        requestId,
        communityId,
        companyId: community.companyId || '',
        requesterUid: identity.uid,
        targetView: 'notifications'
      },
      read: false,
      persistent: true,
      status: 'pending',
      createdAt
    }
  }));
  await fsBatchPut(env, notifications);
  deferPushes(ctx, notifications.map(item => sendPushToUser(env, item.data.recipientUid, {
    title: item.data.title,
    body: item.data.body,
    notificationId: item.id,
    type: item.data.type,
    requestId,
    communityId,
    companyId: community.companyId || ''
  })));

  return { status: 'pending', requestId, communityId };
}

async function respondCommunityJoinRequest(env, identity, requestId, body, ctx) {
  const request = await fsGetRequired(env, 'communityJoinRequests', requestId, 'Solicitação não encontrada.');
  if (request.status !== 'pending') throw httpError(409, 'Esta solicitação já foi respondida.');
  const community = await fsGetRequired(env, 'communities', request.communityId, 'Comunidade não encontrada.');

  let allowed = community.createdBy === identity.uid;
  const communityMembership = await fsGet(env, 'communityMembers', `${community.id}_${identity.uid}`);
  if (communityMembership && ['owner','moderator','admin'].includes(communityMembership.role)) allowed = true;
  if (!allowed && community.companyId) {
    const companyMembership = await fsGet(env, 'companyMembers', `${community.companyId}_${identity.uid}`);
    if (companyMembership?.status === 'active' && ['owner','admin'].includes(companyMembership.role)) allowed = true;
  }
  if (!allowed) throw httpError(403, 'Você não pode responder solicitações desta comunidade.');

  const decision = body?.decision === 'accept' ? 'accepted' : body?.decision === 'reject' ? 'rejected' : '';
  if (!decision) throw httpError(400, 'Escolha aceitar ou recusar.');

  const decidedAt = nowIso();
  await fsPut(env, 'communityJoinRequests', requestId, {
    ...request,
    status: decision,
    decidedAt,
    decidedBy: identity.uid,
    updatedAt: decidedAt
  });

  if (decision === 'accepted') {
    await fsPut(env, 'communityMembers', `${community.id}_${request.requesterUid}`, {
      id: `${community.id}_${request.requesterUid}`,
      companyId: community.companyId || '',
      communityId: community.id,
      uid: request.requesterUid,
      role: 'member',
      joinedAt: decidedAt,
      joinedBy: identity.uid
    });
  }

  const resultNotificationId = `community_join_result_${community.id}_${request.requesterUid}_${Date.now()}`;
  const accepted = decision === 'accepted';
  const notification = {
    recipientUid: request.requesterUid,
    type: accepted ? 'community_join_approved' : 'community_join_rejected',
    title: accepted ? `Você entrou em ${community.name}` : `Solicitação para ${community.name}`,
    body: accepted ? 'Sua solicitação foi aceita.' : 'Sua solicitação não foi aceita.',
    data: {
      communityId: community.id,
      companyId: community.companyId || '',
      targetView: accepted ? 'community' : 'notifications'
    },
    read: false,
    status: 'new',
    createdAt: decidedAt
  };
  await fsPut(env, 'notifications', resultNotificationId, notification);
  deferPushes(ctx, [sendPushToUser(env, request.requesterUid, {
    title: notification.title,
    body: notification.body,
    notificationId: resultNotificationId,
    type: notification.type,
    communityId: community.id,
    companyId: community.companyId || ''
  })]);

  const adminNotifications = await fsWhere(env, 'notifications', 'data.requestId', requestId, 100).catch(() => []);
  await fsBatchPut(env, adminNotifications.map(item => ({
    collection: 'notifications',
    id: item.id,
    data: { ...item, read: true, persistent: false, status: decision, updatedAt: decidedAt }
  })));

  return { ok: true, status: decision, communityId: community.id, requesterUid: request.requesterUid };
}

async function getCommunityMembers(env, identity, communityId) {
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');

  if (community.companyId) {
    const companyMember = await requireCompanyMember(env, identity.uid, community.companyId);
    if (companyMember.role !== 'owner' && companyMember.role !== 'admin') {
      await requireCommunityMember(env, identity.uid, community.id);
    }
  } else {
    if (!publicCommunity(community)) await requireCommunityMember(env, identity.uid, community.id);
  }

  const docs = await fsWhere(env, 'communityMembers', 'communityId', communityId, 250);
  const members = [];
  for (const membership of docs) {
    const user = await fsGet(env, 'users', membership.uid);
    if (community.companyId) {
      const companyMember = await fsGet(env, 'companyMembers', `${community.companyId}_${membership.uid}`);
      if (!companyMember || companyMember.status !== 'active') continue;
      members.push({
        uid: membership.uid,
        displayName: user?.displayName || companyMember.displayName || '',
        email: user?.email || companyMember.email || '',
        avatarMediaId: user?.avatarMediaId || '',
        companyRole: companyMember.role || 'member',
        communityRole: membership.role || 'member'
      });
    } else {
      members.push({
        uid: membership.uid,
        displayName: user?.displayName || '',
        email: user?.email || '',
        avatarMediaId: user?.avatarMediaId || '',
        companyRole: '',
        communityRole: membership.role || 'member'
      });
    }
  }
  members.sort((a,b) => (a.displayName || a.email).localeCompare(b.displayName || b.email, 'pt-BR'));
  return { community: { ...communityView(community), memberCount: members.length }, members, count: members.length };
}

async function addCommunityMember(env, identity, communityId, body, ctx) {
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
  await requireCompanyAdmin(env, identity.uid, community.companyId);

  const targetUid = clean(body.uid, 150);
  if (!targetUid) throw httpError(400, 'Escolha um usuário.');
  const companyMember = await fsGet(env, 'companyMembers', `${community.companyId}_${targetUid}`);
  if (!companyMember || companyMember.status !== 'active') throw httpError(400, 'Este usuário não faz parte da empresa.');

  const memberId = `${communityId}_${targetUid}`;
  const existing = await fsGet(env, 'communityMembers', memberId);
  if (existing) return { member: existing, alreadyMember: true };

  const membership = {
    id: memberId,
    companyId: community.companyId,
    communityId,
    uid: targetUid,
    role: 'member',
    joinedAt: nowIso(),
    addedBy: identity.uid
  };
  await fsPut(env, 'communityMembers', memberId, membership);

  const notificationId = `community_added_${communityId}_${targetUid}_${Date.now()}`;
  const notification = {
    recipientUid: targetUid,
    type: 'community_added',
    title: `Você foi adicionado a ${community.name}`,
    body: 'Um administrador adicionou você a esta comunidade.',
    data: { companyId: community.companyId, communityId, targetView: 'community' },
    read: false,
    status: 'new',
    createdAt: nowIso()
  };
  await fsPut(env, 'notifications', notificationId, notification);
  deferPushes(ctx, [sendPushToUser(env, targetUid, {
    title: notification.title,
    body: notification.body,
    notificationId,
    type: notification.type,
    companyId: community.companyId,
    communityId,
    targetView: 'community',
    url: `/?community=${encodeURIComponent(communityId)}&company=${encodeURIComponent(community.companyId)}`
  })]);

  return { member: membership };
}

async function removeCommunityMember(env, identity, communityId, targetUid, ctx) {
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
  await requireCompanyAdmin(env, identity.uid, community.companyId);

  const memberId = `${communityId}_${targetUid}`;
  const existing = await fsGet(env, 'communityMembers', memberId);
  if (!existing) return { ok: true, alreadyRemoved: true };

  await fsDelete(env, 'communityMembers', memberId);
  const notificationId = `community_removed_${communityId}_${targetUid}_${Date.now()}`;
  const notification = {
    recipientUid: targetUid,
    type: 'community_removed',
    title: `Você foi removido de ${community.name}`,
    body: publicCommunity(community)
      ? 'Você não participa mais desta comunidade, mas as publicações públicas continuam disponíveis na pesquisa.'
      : 'Seu acesso a esta comunidade foi removido por um administrador.',
    data: { companyId: community.companyId, communityId, targetView: 'notifications' },
    read: false,
    status: 'new',
    createdAt: nowIso()
  };
  await fsPut(env, 'notifications', notificationId, notification);
  deferPushes(ctx, [sendPushToUser(env, targetUid, {
    title: notification.title,
    body: notification.body,
    notificationId,
    type: notification.type,
    companyId: community.companyId,
    communityId,
    targetView: 'notifications',
    url: `/?notifications=1&company=${encodeURIComponent(community.companyId)}`
  })]);

  return { ok: true };
}

async function createCommunityInvite(env, identity, communityId, body, ctx) {
  const community=await fsGetRequired(env,'communities',communityId,'Comunidade não encontrada.');
  await requireCompanyAdmin(env,identity.uid,community.companyId);
  let target=null;
  if(body.uid) target=await fsGet(env,'users',clean(body.uid,150));
  else if(body.email){const u=await fsWhere(env,'users','email',normalizeEmail(body.email),5);target=u[0]||null;}
  if(!target)throw httpError(404,'Usuário não encontrado. Ele precisa entrar primeiro na empresa.');
  const member=await fsGet(env,'companyMembers',`${community.companyId}_${target.uid}`);
  if(!member||member.status!=='active')throw httpError(400,'Este usuário não faz parte da empresa.');
  const existing=await fsGet(env,'communityMembers',`${communityId}_${target.uid}`); if(existing)throw httpError(409,'O usuário já participa desta comunidade.');
  const company=await fsGet(env,'companies',community.companyId); const token=randomToken(); const inviteId=id();
  const invite={id:inviteId,type:'community',companyId:community.companyId,companyName:company?.name||'',communityId,communityName:community.name,email:target.email,targetUid:target.uid,invitedBy:identity.uid,status:'pending',tokenHash:await sha256(token),createdAt:nowIso(),expiresAt:new Date(Date.now()+7*86400000).toISOString()};
  await fsPut(env,'invites',inviteId,invite); await createInviteNotification(env,invite,target.uid,ctx);
  return { inviteId };
}

async function createInviteNotification(env, invite, uid, ctx) {
  const notificationId = `invite_${invite.id}_${uid}`;
  const notification = {
    recipientUid: uid,
    type: invite.type === 'company' ? 'company_invite' : 'community_invite',
    title: invite.type === 'company' ? `${invite.companyName} convidou você` : `Convite para ${invite.communityName}`,
    body: invite.type === 'company'
      ? 'Aceite para entrar no ambiente privado da empresa.'
      : `A empresa convidou você para ${invite.communityName}.`,
    data: {
      inviteId: invite.id,
      companyId: invite.companyId,
      communityId: invite.communityId || ''
    },
    read: false,
    status: 'pending',
    createdAt: invite.lastResentAt || invite.createdAt,
    updatedAt: nowIso()
  };
  await fsPut(env, 'notifications', notificationId, notification);

  const pushTask = sendPushToUser(env, uid, {
    title: notification.title,
    body: notification.body,
    notificationId,
    type: notification.type,
    inviteId: invite.id,
    companyId: invite.companyId || '',
    communityId: invite.communityId || ''
  });
  if (ctx?.waitUntil) ctx.waitUntil(pushTask);
  else await pushTask;
}

async function acceptInvite(env, identity, body, ctx) {
  let invite=null; let acceptedByToken=false;
  if(body.token){const hash=await sha256(String(body.token));const found=await fsWhere(env,'invites','tokenHash',hash,5);invite=found[0]||null;acceptedByToken=true;}
  else if(body.inviteId)invite=await fsGet(env,'invites',clean(body.inviteId,120));
  if(!invite)throw httpError(404,'Convite não encontrado.');
  if(invite.status==='accepted')return {ok:true,alreadyAccepted:true};
  if(invite.status!=='pending'||isExpired(invite.expiresAt))throw httpError(410,'Este convite expirou.');
  const email=normalizeEmail(identity.email||'');
  if(!acceptedByToken){
    if(!identity.email_verified)throw httpError(403,'Verifique seu e-mail antes de aceitar este convite pela Central de Notificações.');
    if(invite.email&&invite.email!==email)throw httpError(403,'Este convite pertence a outro e-mail.');
    // O e-mail verificado é a autoridade do convite. Isso também recupera convites
    // que ficaram ligados a uma conta antiga criada com o mesmo endereço.
    if(invite.targetUid!==identity.uid)invite.targetUid=identity.uid;
  } else if (invite.email && email && invite.email !== email) {
    throw httpError(403,'Crie ou entre com a conta do e-mail que recebeu o convite.');
  }
  await ensureUser(env,identity);
  let joiningUser=null;
  if(invite.type==='company'){
    const existingMember = await fsGet(env,'companyMembers',`${invite.companyId}_${identity.uid}`);
    if(!existingMember || existingMember.status!=='active') await assertMemberCapacity(env, invite.companyId, false);
    joiningUser=await fsGet(env,'users',identity.uid);
    await fsPut(env,'companyMembers',`${invite.companyId}_${identity.uid}`,{id:`${invite.companyId}_${identity.uid}`,companyId:invite.companyId,uid:identity.uid,displayName:joiningUser?.displayName||identity.name||'',email:normalizeEmail(identity.email||''),role:'member',status:'active',joinedAt:nowIso()});
  } else {
    const member=await fsGet(env,'companyMembers',`${invite.companyId}_${identity.uid}`);if(!member||member.status!=='active')throw httpError(403,'Você precisa fazer parte da empresa antes de entrar na comunidade.');
    await fsPut(env,'communityMembers',`${invite.communityId}_${identity.uid}`,{id:`${invite.communityId}_${identity.uid}`,companyId:invite.companyId,communityId:invite.communityId,uid:identity.uid,role:'member',joinedAt:nowIso()});
  }
  invite.status='accepted';invite.acceptedBy=identity.uid;invite.acceptedAt=nowIso();await fsPut(env,'invites',invite.id,invite);
  const nid=`invite_${invite.id}_${identity.uid}`;const n=await fsGet(env,'notifications',nid);if(n)await fsPut(env,'notifications',nid,{...n,read:true,status:'accepted'});
  if(invite.type==='company'){
    const notifyTask=notifyCompanyAdminsAboutAcceptedInvite(env,invite,joiningUser||{},identity)
      .catch(error=>console.error('Falha ao avisar administradores sobre convite aceito:',error));
    if(ctx?.waitUntil)ctx.waitUntil(notifyTask);else await notifyTask;
  }
  return {ok:true,companyId:invite.companyId,communityId:invite.communityId||null};
}

async function notifyCompanyAdminsAboutAcceptedInvite(env, invite, joiningUser, identity) {
  const [company, communities, companyMembers] = await Promise.all([
    fsGet(env, 'companies', invite.companyId),
    fsWhere(env, 'communities', 'companyId', invite.companyId, 120),
    fsWhere(env, 'companyMembers', 'companyId', invite.companyId, 250)
  ]);
  const activeCommunities = communities.filter(community => community.archived !== true && community.status !== 'inactive');
  if (!activeCommunities.length) return;

  const administrators = companyMembers.filter(member =>
    member.uid &&
    member.uid !== identity.uid &&
    member.status === 'active' &&
    (member.role === 'owner' || member.role === 'admin')
  );
  if (!administrators.length) return;

  const memberName = joiningUser.displayName || identity.name || joiningUser.email || identity.email || 'Um novo colaborador';
  const companyName = company?.name || invite.companyName || 'sua empresa';
  const communityCount = activeCommunities.length;
  const createdAt = nowIso();
  const body = communityCount === 1
    ? `Adicione ${memberName} à comunidade ativa da empresa.`
    : `Escolha em quais das ${communityCount} comunidades ativas ${memberName} deve participar.`;

  const notifications = administrators.map(administrator => ({
    collection: 'notifications',
    id: `member_joined_${invite.id}_${administrator.uid}`,
    data: {
      recipientUid: administrator.uid,
      type: 'company_member_joined',
      title: `${memberName} entrou em ${companyName}`,
      body,
      data: {
        companyId: invite.companyId,
        memberUid: identity.uid,
        targetView: 'admin'
      },
      read: false,
      status: 'new',
      createdAt
    }
  }));

  await fsBatchPut(env, notifications);
  await Promise.allSettled(notifications.map(notification => sendPushToUser(env, notification.data.recipientUid, {
    title: notification.data.title,
    body: notification.data.body,
    notificationId: notification.id,
    type: notification.data.type,
    companyId: invite.companyId,
    memberUid: identity.uid,
    targetView: 'admin',
    url: `/?admin=1&company=${encodeURIComponent(invite.companyId)}`
  })));
}

function jobView(job) {
  return {
    id: job.id,
    companyId: job.companyId,
    companyName: job.companyName || '',
    authorUid: job.authorUid,
    authorName: job.authorName || '',
    title: job.title,
    description: job.description,
    location: job.location || '',
    contractType: job.contractType || 'clt',
    contactEmail: job.contactEmail || '',
    audience: job.audience === 'world' ? 'world' : 'company',
    status: job.status === 'closed' ? 'closed' : 'open',
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

async function getJobs(env, identity, requestedCompanyId) {
  const companyId = clean(requestedCompanyId, 150);
  if (companyId) await requireCompanyMember(env, identity.uid, companyId);

  const [worldJobs, companyJobs] = await Promise.all([
    fsWhere(env, 'jobs', 'audience', 'world', 250),
    companyId ? fsWhere(env, 'jobs', 'companyId', companyId, 250) : Promise.resolve([])
  ]);

  const visible = new Map();
  for (const job of [...companyJobs, ...worldJobs]) {
    if (job.status === 'closed') continue;
    if (job.audience !== 'world' && job.companyId !== companyId) continue;
    visible.set(job.id, jobView(job));
  }

  return {
    jobs: Array.from(visible.values()).sort(byCreatedDesc).slice(0, 250)
  };
}

async function createJob(env, identity, body, ctx) {
  const companyId = clean(body.companyId, 150);
  await requireCompanyAdmin(env, identity.uid, companyId);
  const [company, user] = await Promise.all([
    fsGetRequired(env, 'companies', companyId, 'Empresa não encontrada.'),
    ensureUser(env, identity)
  ]);
  if (!hasPremiumAccess(company)) {
    throw httpError(403, 'A publicação de vagas é um recurso da comunidade convertida em Empresa.');
  }

  const title = clean(body.title, 140);
  const description = clean(body.description, 5000);
  const location = clean(body.location || '', 160);
  const audience = body.audience === 'world' ? 'world' : body.audience === 'company' ? 'company' : '';
  const allowedContractTypes = new Set(['clt', 'pj', 'internship', 'temporary', 'other']);
  const contractType = allowedContractTypes.has(body.contractType) ? body.contractType : 'clt';
  const contactEmail = normalizeEmail(body.contactEmail || identity.email || '');

  if (!title) throw httpError(400, 'Informe o título da vaga.');
  if (description.length < 20) throw httpError(400, 'Descreva a vaga com pelo menos 20 caracteres.');
  if (!audience) throw httpError(400, 'Escolha se a vaga é interna ou para o mundo.');
  if (!isEmail(contactEmail)) throw httpError(400, 'Informe um e-mail válido para candidatura.');

  const createdAt = nowIso();
  const jobId = id();
  const job = {
    id: jobId,
    companyId,
    companyName: company.name,
    authorUid: identity.uid,
    authorName: user.displayName || identity.name || '',
    title,
    description,
    location,
    contractType,
    contactEmail,
    audience,
    status: 'open',
    createdAt,
    updatedAt: createdAt
  };
  await fsPut(env, 'jobs', jobId, job);

  if (audience === 'company') {
    const notifyTask = notifyCompanyMembersAboutJob(env, job, identity.uid)
      .then(() => broadcastRealtime(env, 'company', companyId, 'job_created'))
      .catch(error => console.error('Falha ao avisar colaboradores sobre nova vaga:', error));
    if (ctx?.waitUntil) ctx.waitUntil(notifyTask);
    else await notifyTask;
  } else {
    deferRealtime(ctx, broadcastRealtime(env, 'world', '', 'job_created'));
  }

  return { job: jobView(job) };
}

async function notifyCompanyMembersAboutJob(env, job, authorUid) {
  const memberships = (await fsWhere(env, 'companyMembers', 'companyId', job.companyId, 500))
    .filter(member => member.status === 'active' && member.uid && member.uid !== authorUid);
  if (!memberships.length) return;

  const createdAt = nowIso();
  const docs = memberships.map(member => ({
    collection: 'notifications',
    id: `job_${job.id}_${member.uid}`,
    data: {
      recipientUid: member.uid,
      type: 'job_posted',
      title: `Nova vaga interna: ${job.title}`,
      body: `${job.companyName} publicou uma oportunidade para os colaboradores.`,
      data: {
        jobId: job.id,
        companyId: job.companyId,
        targetView: 'jobs'
      },
      read: false,
      status: 'new',
      createdAt
    }
  }));
  await fsBatchPut(env, docs);
  await Promise.allSettled(docs.map(doc => sendPushToUser(env, doc.data.recipientUid, {
    title: doc.data.title,
    body: doc.data.body,
    notificationId: doc.id,
    type: doc.data.type,
    companyId: job.companyId,
    targetView: 'jobs',
    url: `/?jobs=1&company=${encodeURIComponent(job.companyId)}`
  })));
}

async function deleteJob(env, identity, jobId, ctx) {
  const job = await fsGetRequired(env, 'jobs', jobId, 'Vaga não encontrada.');
  await requireCompanyAdmin(env, identity.uid, job.companyId);
  await fsDelete(env, 'jobs', jobId);

  if (job.audience === 'world') {
    deferRealtime(ctx, broadcastRealtime(env, 'world', '', 'job_deleted'));
  } else {
    deferRealtime(ctx, broadcastRealtime(env, 'company', job.companyId, 'job_deleted'));
  }
  return { ok: true, deletedJobId: jobId };
}

async function canManageCommunityStructure(env, identity, community) {
  if (community.createdBy === identity.uid) return true;
  const membership = await fsGet(env, 'communityMembers', `${community.id}_${identity.uid}`);
  if (membership && ['owner', 'moderator', 'admin'].includes(membership.role)) return true;
  if (community.companyId) {
    const companyMembership = await fsGet(env, 'companyMembers', `${community.companyId}_${identity.uid}`);
    if (companyMembership?.status === 'active' && ['owner', 'admin'].includes(companyMembership.role)) return true;
  }
  return false;
}

async function getCommunityTopics(env, identity, communityId) {
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
  await requireCommunityAccess(env, identity.uid, community);
  const topics = await fsWhere(env, 'communityTopics', 'communityId', communityId, 250);
  topics.sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  return {
    community: communityView(community),
    kind: community.companyId ? 'sector' : 'topic',
    topics
  };
}

async function createCommunityTopic(env, identity, communityId, body) {
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
  if (!(await canManageCommunityStructure(env, identity, community))) {
    throw httpError(403, community.companyId ? 'Somente administradores podem criar setores.' : 'Somente o dono ou moderadores podem criar assuntos.');
  }

  const name = clean(body?.name, 80);
  const description = clean(body?.description || '', 220);
  if (!name) throw httpError(400, community.companyId ? 'Informe o nome do setor.' : 'Informe o nome do assunto.');

  const existing = await fsWhere(env, 'communityTopics', 'communityId', communityId, 250);
  if (existing.some(item => String(item.name || '').trim().toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
    throw httpError(409, community.companyId ? 'Já existe um setor com este nome.' : 'Já existe um assunto com este nome.');
  }

  const topicId = id();
  const topic = {
    id: topicId,
    communityId,
    companyId: community.companyId || '',
    name,
    description,
    kind: community.companyId ? 'sector' : 'topic',
    createdBy: identity.uid,
    createdAt: nowIso()
  };
  await fsPut(env, 'communityTopics', topicId, topic);
  if (community.companyId) {
    await fsPut(env, 'communityTopicMembers', `${topicId}_${identity.uid}`, {
      id: `${topicId}_${identity.uid}`,
      topicId,
      communityId,
      companyId: community.companyId,
      uid: identity.uid,
      role: 'admin',
      joinedAt: nowIso()
    });
  }
  return { topic };
}

async function requireCompanySectorAccess(env, identityUid, post) {
  if (!post?.companyId || !post?.topicId) return;
  const companyMembership = await fsGet(env, 'companyMembers', `${post.companyId}_${identityUid}`);
  if (!companyMembership || companyMembership.status !== 'active') {
    throw httpError(403, 'Você não participa desta empresa.');
  }
  if (['owner', 'admin'].includes(companyMembership.role)) return;

  const sectorMembership = await fsGet(env, 'communityTopicMembers', `${post.topicId}_${identityUid}`);
  if (!sectorMembership) throw httpError(403, 'Você não participa deste setor.');
}

async function getCommunityPosts(env, identity, communityId, topicId = '') {
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
  await requireCommunityAccess(env, identity.uid, community);

  let posts = await fsWhere(env, 'posts', 'communityId', communityId, 120);
  posts = posts.filter(p => p.scope === 'community');
  const normalizedTopicId = clean(topicId, 150);
  if (normalizedTopicId) posts = posts.filter(post => post.topicId === normalizedTopicId);

  if (community.companyId) {
    const companyMembership = await fsGet(env, 'companyMembers', `${community.companyId}_${identity.uid}`);
    const isAdmin = Boolean(companyMembership?.status === 'active' && ['owner', 'admin'].includes(companyMembership.role));
    if (!isAdmin) {
      const allowed = [];
      for (const post of posts) {
        if (!post.topicId) {
          allowed.push(post);
          continue;
        }
        const sectorMembership = await fsGet(env, 'communityTopicMembers', `${post.topicId}_${identity.uid}`);
        if (sectorMembership) allowed.push(post);
      }
      posts = allowed;
    }
  }

  const reactions = await fsWhere(env, 'reactions', 'uid', identity.uid, 250);
  const likedIds = new Set(reactions.map(r => r.postId));
  const receipts = await fsWhere(env, 'readReceipts', 'uid', identity.uid, 250);
  const readIds = new Set(receipts.map(r => r.postId));
  const pollVotes = await fsWhere(env, 'pollVotes', 'uid', identity.uid, 250);
  const pollVoteMap = new Map(pollVotes.map(vote => [vote.postId, vote.optionId]));

  return {
    community: communityView(community),
    posts: enrichPosts(posts.map(post => ({
      ...post,
      communityVisibility: normalizedCommunityVisibility(community.visibility)
    })), likedIds, readIds, pollVoteMap).slice(0, 100)
  };
}


async function interestedPostRecipients(env, post, authorUid) {
  if (!post) return [];

  if (post.scope === 'world') {
    const followers = await fsWhere(env, 'socialFollows', 'targetUid', authorUid, 500).catch(() => []);
    return Array.from(new Set(followers.map(item => item.followerUid).filter(uid => uid && uid !== authorUid)));
  }

  let memberships = [];

  if (post.scope === 'company') {
    memberships = await fsWhere(env, 'companyMembers', 'companyId', post.companyId, 500);
    memberships = memberships.filter(item => item.status === 'active');
  } else if (post.scope === 'community') {
    memberships = await fsWhere(env, 'communityMembers', 'communityId', post.communityId, 500);
  }

  return Array.from(new Set(
    memberships
      .map(item => item.uid)
      .filter(uid => uid && uid !== authorUid)
  ));
}

async function notifyInterestedPostRecipients(env, post, authorUid) {
  const interestedRecipients = await interestedPostRecipients(env, post, authorUid);
  if (!interestedRecipients.length) return;

  const persistent = post.type === 'announcement' && Boolean(post.requiresReadReceipt);
  const notificationType = persistent ? 'read_required' : post.type === 'announcement' ? 'announcement' : 'new_post';
  const notificationTitle = persistent
    ? 'Confirmação de leitura pendente'
    : post.type === 'announcement'
      ? post.title || 'Novo comunicado'
      : post.scope === 'world'
        ? `${post.authorName || 'Alguém que você segue'} publicou`
        : post.scope === 'community'
          ? `Nova publicação em ${post.communityName || 'uma comunidade'}`
          : `Nova publicação em ${post.companyName || 'sua empresa'}`;

  const notificationBody = persistent
    ? `${post.authorName} publicou um comunicado que precisa da sua confirmação de leitura.`
    : `${post.authorName} publicou ${post.type === 'poll' ? 'uma enquete' : post.type === 'event' ? 'um evento' : post.type === 'question' ? 'uma pergunta' : 'uma nova mensagem'}.`;

  const docs = interestedRecipients.map(uid => ({
    collection: 'notifications',
    id: persistent ? `read_${post.id}_${uid}` : `post_${post.id}_${uid}`,
    data: {
      recipientUid: uid,
      type: notificationType,
      title: notificationTitle,
      body: notificationBody,
      data: {
        postId: post.id,
        companyId: post.companyId || '',
        communityId: post.communityId || ''
      },
      read: false,
      persistent,
      status: persistent ? 'pending_confirmation' : 'new',
      createdAt: post.createdAt
    }
  }));

  await fsBatchPut(env, docs);
  await Promise.allSettled(docs.map(doc => sendPushToUser(env, doc.data.recipientUid, {
    title: doc.data.title,
    body: doc.data.body,
    notificationId: doc.id,
    type: doc.data.type,
    postId: post.id,
    companyId: post.companyId || '',
    communityId: post.communityId || ''
  })));
}

function deferPushes(ctx, promises) {
  if (!promises?.length) return;
  const task = Promise.allSettled(promises).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(task);
}

async function registerPushToken(env, identity, body, ctx) {
  await ensureUser(env, identity);

  const token = clean(body.token || '', 4096);
  if (!token) throw httpError(400, 'Token de push obrigatório.');

  const tokenHash = await sha256(token);
  const subscriptionId = `${identity.uid}_${tokenHash.slice(0, 40)}`;

  const subscription = {
    id: subscriptionId,
    uid: identity.uid,
    token,
    tokenHash,
    platform: clean(body.platform || 'web', 40),
    userAgent: clean(body.userAgent || '', 500),
    enabled: true,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  const existing = await fsGet(env, 'pushSubscriptions', subscriptionId);
  if (existing?.createdAt) subscription.createdAt = existing.createdAt;

  await fsPut(env, 'pushSubscriptions', subscriptionId, subscription);

  if (!existing) {
    const notifications = await fsWhere(env, 'notifications', 'recipientUid', identity.uid, 100);
    const pendingInvites = notifications.filter(item =>
      item.status === 'pending' &&
      (item.type === 'company_invite' || item.type === 'community_invite')
    );
    deferPushes(ctx, pendingInvites.map(item => sendPushToUser(env, identity.uid, {
      title: item.title,
      body: item.body,
      notificationId: item.id,
      type: item.type,
      inviteId: item.data?.inviteId || '',
      companyId: item.data?.companyId || '',
      communityId: item.data?.communityId || ''
    })));
  }
  return { ok: true };
}

async function unregisterPushToken(env, identity, body) {
  const token = clean(body.token || '', 4096);
  if (!token) return { ok: true };

  const tokenHash = await sha256(token);
  const subscriptionId = `${identity.uid}_${tokenHash.slice(0, 40)}`;
  await fsDelete(env, 'pushSubscriptions', subscriptionId);
  return { ok: true };
}

async function sendPushToUser(env, uid, payload) {
  if (!uid || !env.FIREBASE_PROJECT_ID) return;

  let subscriptions = [];
  try {
    subscriptions = (await fsWhere(env, 'pushSubscriptions', 'uid', uid, 20))
      .filter(item => item.enabled !== false && item.token);
  } catch (error) {
    console.warn('Push subscriptions:', error);
    return;
  }

  if (!subscriptions.length) return;

  let accessToken = '';
  try {
    accessToken = await getGoogleAccessToken(env);
  } catch (error) {
    console.warn('FCM auth:', error);
    return;
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/messages:send`;
  const title = clean(payload.title || 'Uorqui', 160);
  const body = clean(payload.body || 'Você tem uma nova atualização.', 240);
  const openComments = payload.openComments || payload.commentId ? 'true' : '';

  const data = {};
  for (const [key, value] of Object.entries({
    notificationId: payload.notificationId || '',
    type: payload.type || '',
    inviteId: payload.inviteId || '',
    postId: payload.postId || '',
    commentId: payload.commentId || '',
    companyId: payload.companyId || '',
    communityId: payload.communityId || '',
    memberUid: payload.memberUid || '',
    targetView: payload.targetView || '',
    openComments,
    url: payload.url || (payload.postId
      ? `/?post=${encodeURIComponent(payload.postId)}${payload.companyId ? `&company=${encodeURIComponent(payload.companyId)}` : ''}${openComments ? '&comments=1' : ''}${payload.commentId ? `&comment=${encodeURIComponent(payload.commentId)}` : ''}`
      : payload.inviteId
        ? '/?notifications=1'
        : '/')
  })) {
    data[key] = String(value || '');
  }

  await Promise.allSettled(subscriptions.map(async subscription => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          token: subscription.token,
          notification: { title, body },
          data,
          webpush: {
            headers: { Urgency: payload.type === 'read_required' ? 'high' : 'normal' }
          }
        }
      })
    });

    if (response.ok) return;

    const responseText = await response.text().catch(() => '');
    const invalidToken =
      response.status === 404 ||
      /UNREGISTERED|registration-token-not-registered|Requested entity was not found/i.test(responseText);

    if (invalidToken) {
      try {
        await fsDelete(env, 'pushSubscriptions', subscription.id);
      } catch {}
      return;
    }

    console.warn('FCM send failed:', response.status, responseText.slice(0, 500));
  }));
}

async function createPost(env, identity, body, ctx) {
  await ensureUser(env, identity);

  const scope = ['world', 'company', 'community'].includes(body.scope) ? body.scope : null;
  if (!scope) throw httpError(400, 'Audiência inválida.');

  const type = ['post', 'question', 'announcement', 'poll', 'event'].includes(body.type)
    ? body.type
    : 'post';

  const text = clean(body.text, 5000);
  const title = clean(body.title || '', 180);
  if (type !== 'event' && !text) throw httpError(400, 'Escreva a publicação.');
  if ((type === 'announcement' || type === 'event') && !title) {
    throw httpError(400, type === 'event' ? 'Informe o título do evento.' : 'Informe o título do comunicado.');
  }

  const companyId = body.companyId ? clean(body.companyId, 120) : null;
  const communityId = body.communityId ? clean(body.communityId, 120) : null;
  const topicId = body.topicId ? clean(body.topicId, 120) : '';
  let company = null;
  let community = null;
  let topic = null;

  if (scope === 'company') {
    if (!companyId) throw httpError(400, 'Empresa obrigatória.');
    await requireCompanyMember(env, identity.uid, companyId);
    company = await fsGet(env, 'companies', companyId);
  }

  if (scope === 'community') {
    if (!communityId) throw httpError(400, 'Escolha a comunidade.');
    community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
    if ((community.companyId || '') !== (companyId || '')) throw httpError(400, 'Comunidade inválida.');
    await requireCommunityAccess(env, identity.uid, community);
    if (community.companyId) company = await fsGet(env, 'companies', community.companyId);
    if (topicId) {
      topic = await fsGetRequired(env, 'communityTopics', topicId, 'Assunto não encontrado.');
      if (topic.communityId !== communityId) throw httpError(400, 'Assunto inválido para esta comunidade.');
    }
  }

  if (type === 'announcement') {
    if (scope !== 'company') throw httpError(400, 'Comunicados oficiais devem ser publicados para a empresa.');
    await requireCompanyAdmin(env, identity.uid, companyId);
  }

  let pollOptions = [];
  if (type === 'poll') {
    const rawOptions = Array.isArray(body.pollOptions) ? body.pollOptions : [];
    const optionTexts = rawOptions
      .map(value => clean(value, 160))
      .filter(Boolean)
      .slice(0, 6);

    const unique = [...new Set(optionTexts.map(value => value.toLocaleLowerCase('pt-BR')))];
    if (optionTexts.length < 2 || unique.length < 2) {
      throw httpError(400, 'A enquete precisa de pelo menos 2 opções diferentes.');
    }

    pollOptions = optionTexts.map(optionText => ({
      id: id(),
      text: optionText,
      voteCount: 0
    }));
  }

  let eventStart = '';
  let eventEnd = '';
  let eventLocation = '';
  let eventTimeZone = '';

  if (type === 'event') {
    eventStart = clean(body.eventStart || '', 80);
    eventEnd = clean(body.eventEnd || '', 80);
    eventLocation = clean(body.eventLocation || '', 240);
    eventTimeZone = clean(body.eventTimeZone || 'UTC', 100);

    const startTime = new Date(eventStart).getTime();
    if (!eventStart || !Number.isFinite(startTime)) throw httpError(400, 'Informe a data e o horário do evento.');

    if (eventEnd) {
      const endTime = new Date(eventEnd).getTime();
      if (!Number.isFinite(endTime)) throw httpError(400, 'O horário final do evento é inválido.');
      if (endTime <= startTime) throw httpError(400, 'O término do evento precisa ser depois do início.');
    }
  }

  const user = await fsGet(env, 'users', identity.uid);
  const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.slice(0, 5) : [];
  const attachments = [];

  for (const mediaId of attachmentIds) {
    const m = await fsGetRequired(env, 'media', clean(mediaId, 120), 'Anexo não encontrado.');
    if (m.ownerUid !== identity.uid) throw httpError(403, 'Anexo inválido.');
    if (
      m.scope !== scope ||
      ((scope !== 'world' && scope !== 'message') && (m.companyId || '') !== (companyId || '')) ||
      (scope === 'community' && m.communityId !== communityId)
    ) {
      throw httpError(400, 'O anexo foi enviado para outra audiência.');
    }
    attachments.push({ id: m.id, name: m.name, contentType: m.contentType, size: m.size });
  }

  const postId = id();
  const post = {
    id: postId,
    authorUid: identity.uid,
    authorName: user?.displayName || identity.name || 'Usuário',
    authorAvatarMediaId: user?.avatarMediaId || '',
    scope,
    companyId: companyId || '',
    companyName: company?.name || '',
    communityId: communityId || '',
    communityName: community?.name || '',
    communityVisibility: community ? normalizedCommunityVisibility(community.visibility) : '',
    topicId: topic?.id || '',
    topicName: topic?.name || '',
    type,
    text,
    title: type === 'announcement' || type === 'event' ? title : '',
    requiresReadReceipt: type === 'announcement' && Boolean(body.requiresReadReceipt),
    attachments,
    reactionCount: 0,
    commentCount: 0,
    lastCommentAt: '',
    followUpReminderFor: '',
    followUpReminderAt: '',
    isResolved: false,
    resolvedAt: '',
    resolvedByUid: '',
    acceptedCommentId: '',
    pollOptions,
    pollTotalVotes: 0,
    eventStart,
    eventEnd,
    eventLocation,
    eventTimeZone,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await fsPut(env, 'posts', postId, post);

  const notificationTask = notifyInterestedPostRecipients(env, post, identity.uid)
    .catch(error => console.error('Falha ao notificar nova publicação:', error));
  if (ctx?.waitUntil) ctx.waitUntil(notificationTask);
  else await notificationTask;

  deferRealtime(ctx, broadcastRealtimeForPost(env, post, 'post_created'));

  return { post };
}

async function cleanupDeletedPost(env, post, keepNotifications) {
  const postId = post.id;
  try {
    const [comments, reactions, commentReactions, pollVotes, receipts, notifications] = await Promise.all([
      fsWhere(env, 'comments', 'postId', postId, 250),
      fsWhere(env, 'reactions', 'postId', postId, 250),
      fsWhere(env, 'commentReactions', 'postId', postId, 500),
      fsWhere(env, 'pollVotes', 'postId', postId, 250),
      fsWhere(env, 'readReceipts', 'postId', postId, 250),
      fsWhere(env, 'notifications', 'data.postId', postId, 250).catch(() => [])
    ]);

    await fsBatchDelete(env, [
      ...comments.map(item => ({ collection: 'comments', id: item.id })),
      ...reactions.map(item => ({ collection: 'reactions', id: item.id })),
      ...commentReactions.map(item => ({ collection: 'commentReactions', id: item.id })),
      ...pollVotes.map(item => ({ collection: 'pollVotes', id: item.id })),
      ...receipts.map(item => ({ collection: 'readReceipts', id: item.id })),
      ...(keepNotifications ? [] : notifications.map(item => ({ collection: 'notifications', id: item.id })))
    ]);

    if (keepNotifications && notifications.length) {
      const readAt = nowIso();
      await fsBatchPut(env, notifications.map(notification => ({
        collection: 'notifications',
        id: notification.id,
        data: {
          ...notification,
          read: true,
          persistent: false,
          status: 'post_removed',
          readAt
        }
      })));
    }

    await Promise.allSettled((post.attachments || []).map(async attachment => {
      const media = await fsGet(env, 'media', attachment.id);
      if (!media) return;
      if (env.MEDIA && media.key) await env.MEDIA.delete(media.key);
      await fsDelete(env, 'media', media.id);
    }));
  } catch (error) {
    console.warn('Post cleanup:', postId, error);
  }
}

async function deletePost(env, identity, postId, ctx) {
  const post = await fsGetRequired(env, 'posts', postId, 'Publicação não encontrada.');
  const access = await requirePostAccess(env, identity.uid, post);

  const isAuthor = post.authorUid === identity.uid;
  const adminMembership = !isAuthor && access && ['owner', 'admin'].includes(access.role) ? access : null;
  if (!isAuthor && !adminMembership) throw httpError(403, 'Você não pode excluir esta publicação.');

  if (!isAuthor && adminMembership) {
    const deletedAt = nowIso();
    const tombstone = {
      ...post,
      type: 'post',
      text: '',
      title: '',
      attachments: [],
      requiresReadReceipt: false,
      acceptedCommentId: '',
      isResolved: false,
      pollOptions: [],
      pollTotalVotes: 0,
      eventStart: '',
      eventEnd: '',
      eventLocation: '',
      eventTimeZone: '',
      reactionCount: 0,
      commentCount: 0,
      lastCommentAt: '',
      followUpReminderFor: '',
      followUpReminderAt: '',
      deletedByAdmin: true,
      deletedAt,
      deletedByUid: identity.uid,
      updatedAt: deletedAt
    };
    await fsPut(env, 'posts', postId, tombstone);
    const cleanup = cleanupDeletedPost(env, post, true);
    if (ctx?.waitUntil) ctx.waitUntil(cleanup);
    else await cleanup;
    deferRealtime(ctx, broadcastRealtimeForPost(env, post, 'post_deleted'));
    return { ok: true, tombstone: true, post: tombstone };
  }

  await fsDelete(env, 'posts', postId);
  const cleanup = cleanupDeletedPost(env, post, false);
  if (ctx?.waitUntil) ctx.waitUntil(cleanup);
  else await cleanup;
  deferRealtime(ctx, broadcastRealtimeForPost(env, post, 'post_deleted'));
  return { ok: true, tombstone: false };
}

async function getPostDetail(env, identity, postId) {
  const post = await fsGetRequired(env, 'posts', postId, 'Publicação não encontrada.');
  await requirePostAccess(env, identity.uid, post);

  const reaction = await fsGet(env, 'reactions', `${postId}_${identity.uid}`);
  const receipt = await fsGet(env, 'readReceipts', `${postId}_${identity.uid}`);
  const pollVote = await fsGet(env, 'pollVotes', `${postId}_${identity.uid}`);

  return {
    post: {
      ...post,
      liked: Boolean(reaction),
      hasRead: Boolean(receipt),
      myPollOptionId: pollVote?.optionId || ''
    }
  };
}

async function getComments(env, identity, postId, focusCommentId = '') {
  const [post, commentsResult, reactionsResult] = await Promise.all([
    fsGetRequired(env, 'posts', postId, 'Publicação não encontrada.'),
    fsWhere(env, 'comments', 'postId', postId, 100),
    fsWhere(env, 'commentReactions', 'postId', postId, 500).catch(() => [])
  ]);
  await requirePostAccess(env, identity.uid, post);
  const requestedCommentId = clean(focusCommentId, 150);
  if (requestedCommentId && !commentsResult.some(comment => comment.id === requestedCommentId)) {
    const requestedComment = await fsGet(env, 'comments', requestedCommentId);
    if (requestedComment?.postId === postId) commentsResult.push(requestedComment);
  }
  const likedCommentIds = new Set(
    reactionsResult.filter(reaction => reaction.uid === identity.uid).map(reaction => reaction.commentId)
  );
  const comments = commentsResult
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(comment => ({
      ...comment,
      reactionCount: Math.max(0, Number(comment.reactionCount || 0)),
      liked: likedCommentIds.has(comment.id)
    }));
  return { post, comments };
}
async function addComment(env, identity, postId, body, ctx) {
  const post = await fsGetRequired(env, 'posts', postId, 'Publicação não encontrada.');
  await requirePostAccess(env, identity.uid, post);
  if (post.deletedByAdmin) throw httpError(410, 'Esta publicação foi removida por um administrador.');

  const text = clean(body.text, 3000);
  if (!text) throw httpError(400, 'Escreva a resposta.');

  const user = await ensureUser(env, identity);
  const commentId = id();
  const comment = {
    id: commentId,
    postId,
    authorUid: identity.uid,
    authorName: user.displayName || 'Usuário',
    authorAvatarMediaId: user.avatarMediaId || '',
    text,
    reactionCount: 0,
    createdAt: nowIso()
  };

  await fsPut(env, 'comments', commentId, comment);
  post.commentCount = Math.max(0, Number(post.commentCount || 0) + 1);
  post.lastCommentAt = comment.createdAt;
  post.followUpReminderFor = '';
  post.followUpReminderAt = '';
  post.updatedAt = comment.createdAt;
  await fsPut(env, 'posts', postId, post);

  if (post.authorUid !== identity.uid) {
    const notificationId = `comment_${commentId}_${post.authorUid}`;
    const notification = {
      recipientUid: post.authorUid,
      type: 'comment',
      title: `${comment.authorName} respondeu sua publicação`,
      body: text.slice(0, 180),
      data: {
        postId,
        commentId,
        companyId: post.companyId || '',
        communityId: post.communityId || '',
        openComments: 'true'
      },
      read: false,
      persistent: false,
      status: 'new',
      createdAt: comment.createdAt
    };

    await fsPut(env, 'notifications', notificationId, notification);
    deferPushes(ctx, [sendPushToUser(env, post.authorUid, {
      title: notification.title,
      body: 'Abra o Uorqui para ver a nova resposta.',
      notificationId,
      type: 'comment',
      postId,
      commentId,
      companyId: post.companyId || '',
      communityId: post.communityId || '',
      openComments: 'true'
    })]);
  }

  deferRealtime(ctx, broadcastRealtimeForPost(env, post, 'comment_created'));

  return { comment };
}

async function deleteComment(env, identity, commentId, ctx) {
  const comment = await fsGetRequired(env, 'comments', commentId, 'Resposta não encontrada.');
  const post = await fsGetRequired(env, 'posts', comment.postId, 'Publicação não encontrada.');
  const access = await requirePostAccess(env, identity.uid, post);
  if (post.deletedByAdmin) throw httpError(410, 'Esta publicação foi removida por um administrador.');

  const isAuthor = comment.authorUid === identity.uid;
  const isCompanyAdmin = !isAuthor && post.scope !== 'world' && ['owner', 'admin'].includes(access?.role);
  if (!isAuthor && !isCompanyAdmin) {
    throw httpError(403, 'Você não pode excluir esta resposta.');
  }

  const [postComments, reactions, notifications] = await Promise.all([
    fsWhere(env, 'comments', 'postId', post.id, 500),
    fsWhere(env, 'commentReactions', 'commentId', commentId, 500).catch(() => []),
    fsWhere(env, 'notifications', 'data.commentId', commentId, 500).catch(() => [])
  ]);
  const remainingComments = postComments.filter(item => item.id !== commentId);
  const lastCommentAt = remainingComments.reduce((latest, item) => {
    const createdAt = item.createdAt || '';
    return !latest || new Date(createdAt).getTime() > new Date(latest).getTime() ? createdAt : latest;
  }, '');
  const changedAt = nowIso();
  const deletedAcceptedSolution = post.acceptedCommentId === commentId;
  const updatedPost = {
    ...post,
    commentCount: Math.max(0, Number(post.commentCount || 0) - 1),
    lastCommentAt,
    followUpReminderFor: '',
    followUpReminderAt: '',
    acceptedCommentId: deletedAcceptedSolution ? '' : post.acceptedCommentId || '',
    isResolved: deletedAcceptedSolution ? false : Boolean(post.isResolved),
    resolvedAt: deletedAcceptedSolution ? '' : post.resolvedAt || '',
    resolvedByUid: deletedAcceptedSolution ? '' : post.resolvedByUid || '',
    updatedAt: changedAt
  };

  await fsCommit(env, [
    { delete: { collection: 'comments', id: commentId } },
    { update: { collection: 'posts', id: post.id, data: updatedPost } }
  ]);

  const cleanupTask = fsBatchDelete(env, [
    ...reactions.map(item => ({ collection: 'commentReactions', id: item.id })),
    ...notifications.map(item => ({ collection: 'notifications', id: item.id }))
  ]).catch(error => console.error('Falha ao limpar vínculos da resposta excluída:', error));
  if (ctx?.waitUntil) ctx.waitUntil(cleanupTask);
  else await cleanupTask;

  deferRealtime(ctx, broadcastRealtimeForPost(env, updatedPost, 'comment_deleted'));
  return { ok: true, deletedCommentId: commentId, post: updatedPost };
}

async function toggleReaction(env, identity, postId, ctx) {
  const post = await fsGetRequired(env, 'posts', postId, 'Publicação não encontrada.');
  await requirePostAccess(env, identity.uid, post);
  if (post.deletedByAdmin) throw httpError(410, 'Esta publicação foi removida por um administrador.');

  const rid = `${postId}_${identity.uid}`;
  const existing = await fsGet(env, 'reactions', rid);
  let liked;

  if (existing) {
    await fsDelete(env, 'reactions', rid);
    post.reactionCount = Math.max(0, Number(post.reactionCount || 0) - 1);
    liked = false;
  } else {
    await fsPut(env, 'reactions', rid, {
      id: rid,
      postId,
      uid: identity.uid,
      kind: 'like',
      createdAt: nowIso()
    });
    post.reactionCount = Number(post.reactionCount || 0) + 1;
    liked = true;
  }

  await fsPut(env, 'posts', postId, { ...post, updatedAt: nowIso() });

  if (liked && post.authorUid !== identity.uid) {
    const user = await ensureUser(env, identity);
    const notificationId = `like_${postId}_${identity.uid}`;
    const notification = {
      recipientUid: post.authorUid,
      type: 'like',
      title: `${user.displayName || 'Alguém'} curtiu sua publicação`,
      body: post.text ? post.text.slice(0, 140) : post.title || 'Sua publicação recebeu uma curtida.',
      data: {
        postId,
        companyId: post.companyId || '',
        communityId: post.communityId || ''
      },
      read: false,
      persistent: false,
      status: 'new',
      createdAt: nowIso()
    };

    await fsPut(env, 'notifications', notificationId, notification);
    deferPushes(ctx, [sendPushToUser(env, post.authorUid, {
      title: notification.title,
      body: 'Sua publicação recebeu uma nova curtida.',
      notificationId,
      type: 'like',
      postId,
      companyId: post.companyId || '',
      communityId: post.communityId || ''
    })]);
  }

  deferRealtime(ctx, broadcastRealtimeForPost(env, post, 'post_reaction'));

  return { liked, reactionCount: post.reactionCount };
}

async function toggleCommentReaction(env, identity, commentId, ctx) {
  const comment = await fsGetRequired(env, 'comments', commentId, 'Resposta não encontrada.');
  const post = await fsGetRequired(env, 'posts', comment.postId, 'Publicação não encontrada.');
  await requirePostAccess(env, identity.uid, post);
  if (post.deletedByAdmin) throw httpError(410, 'Esta publicação foi removida por um administrador.');

  const reactionId = `${commentId}_${identity.uid}`;
  const existing = await fsGet(env, 'commentReactions', reactionId);
  const changedAt = nowIso();
  let liked = false;

  if (existing) {
    await fsDelete(env, 'commentReactions', reactionId);
    comment.reactionCount = Math.max(0, Number(comment.reactionCount || 0) - 1);
  } else {
    await fsPut(env, 'commentReactions', reactionId, {
      id: reactionId,
      commentId,
      postId: post.id,
      uid: identity.uid,
      kind: 'like',
      createdAt: changedAt
    });
    comment.reactionCount = Number(comment.reactionCount || 0) + 1;
    liked = true;
  }

  comment.updatedAt = changedAt;
  await fsPut(env, 'comments', commentId, comment);
  await fsPut(env, 'posts', post.id, { ...post, updatedAt: changedAt });

  if (liked && comment.authorUid && comment.authorUid !== identity.uid) {
    const user = await ensureUser(env, identity);
    const notificationId = `comment_like_${commentId}_${identity.uid}`;
    const notification = {
      recipientUid: comment.authorUid,
      type: 'comment_like',
      title: `${user.displayName || 'Alguém'} curtiu sua resposta`,
      body: comment.text ? comment.text.slice(0, 160) : 'Sua resposta recebeu uma curtida.',
      data: {
        postId: post.id,
        commentId,
        companyId: post.companyId || '',
        communityId: post.communityId || '',
        openComments: 'true'
      },
      read: false,
      persistent: false,
      status: 'new',
      createdAt: changedAt
    };

    await fsPut(env, 'notifications', notificationId, notification);
    deferPushes(ctx, [sendPushToUser(env, comment.authorUid, {
      title: notification.title,
      body: 'Abra o Uorqui para ver a resposta curtida.',
      notificationId,
      type: notification.type,
      postId: post.id,
      commentId,
      companyId: post.companyId || '',
      communityId: post.communityId || '',
      openComments: 'true'
    })]);
  }

  deferRealtime(ctx, broadcastRealtimeForPost(env, post, 'comment_reaction'));

  return { liked, reactionCount: comment.reactionCount };
}

async function confirmRead(env, identity, postId) {
  const post = await fsGetRequired(env, 'posts', postId, 'Publicação não encontrada.');
  if (post.type !== 'announcement' || !post.requiresReadReceipt) {
    throw httpError(400, 'Somente comunicados podem exigir confirmação de leitura.');
  }

  await requirePostAccess(env, identity.uid, post);

  if (post.authorUid === identity.uid) {
    return { ok: true, ownPost: true };
  }

  const rid = `${postId}_${identity.uid}`;
  const readAt = nowIso();

  await fsPut(env, 'readReceipts', rid, {
    id: rid,
    postId,
    uid: identity.uid,
    companyId: post.companyId || '',
    communityId: post.communityId || '',
    readAt
  });

  const notificationId = `read_${postId}_${identity.uid}`;
  const notification = await fsGet(env, 'notifications', notificationId);
  if (notification) {
    await fsPut(env, 'notifications', notificationId, {
      ...notification,
      read: true,
      status: 'confirmed',
      readAt,
      confirmedAt: readAt
    });
  }

  return { ok: true, readAt };
}

async function acceptSolution(env, identity, postId, body, ctx) {
  const post = await fsGetRequired(env, 'posts', postId, 'Publicação não encontrada.');
  if (post.type !== 'question' || post.scope === 'world') {
    throw httpError(400, 'Somente perguntas de comunidades ou empresas podem ter uma resposta aceita.');
  }

  await requirePostAccess(env, identity.uid, post);

  if (post.authorUid !== identity.uid) {
    if (post.companyId) {
      await requireCompanyAdmin(env, identity.uid, post.companyId);
    } else if (post.communityId) {
      const community = await fsGetRequired(env, 'communities', post.communityId, 'Comunidade não encontrada.');
      if (!(await canManageCommunityStructure(env, identity, community))) {
        throw httpError(403, 'Somente o autor, dono ou moderadores da comunidade podem aceitar uma resposta.');
      }
    } else {
      throw httpError(403, 'Sem permissão.');
    }
  }

  const comment = await fsGetRequired(env, 'comments', clean(body.commentId, 120), 'Resposta não encontrada.');
  if (comment.postId !== postId) throw httpError(400, 'Resposta inválida.');

  post.acceptedCommentId = comment.id;
  post.isResolved = true;
  post.resolvedAt = nowIso();
  post.resolvedByUid = identity.uid;
  post.followUpReminderFor = post.lastCommentAt || '';
  post.updatedAt = nowIso();
  await fsPut(env, 'posts', postId, post);
  deferRealtime(ctx, broadcastRealtimeForPost(env, post, 'solution_accepted'));
  return { ok: true, isResolved: true };
}

async function setPostResolved(env, identity, postId, body, ctx) {
  const post = await fsGetRequired(env, 'posts', postId, 'Publicação não encontrada.');
  if (post.type !== 'question' || post.scope === 'world') {
    throw httpError(400, 'Somente perguntas de comunidades ou empresas podem ser marcadas como resolvidas.');
  }
  await requirePostAccess(env, identity.uid, post);

  if (post.authorUid !== identity.uid) {
    if (post.companyId) {
      await requireCompanyAdmin(env, identity.uid, post.companyId);
    } else if (post.communityId) {
      const community = await fsGetRequired(env, 'communities', post.communityId, 'Comunidade não encontrada.');
      if (!(await canManageCommunityStructure(env, identity, community))) {
        throw httpError(403, 'Somente o autor, dono ou moderadores da comunidade podem marcar esta pergunta como resolvida.');
      }
    } else {
      throw httpError(403, 'Sem permissão.');
    }
  }

  const resolved = body.resolved !== false;
  post.isResolved = resolved;
  post.resolvedAt = resolved ? nowIso() : '';
  post.resolvedByUid = resolved ? identity.uid : '';
  if (!resolved) post.acceptedCommentId = '';
  post.followUpReminderFor = post.lastCommentAt || post.followUpReminderFor || '';
  post.updatedAt = nowIso();

  await fsPut(env, 'posts', postId, post);
  deferRealtime(ctx, broadcastRealtimeForPost(env, post, 'post_resolved'));
  return { ok: true, isResolved: resolved };
}

async function votePoll(env, identity, postId, body, ctx) {
  const post = await fsGetRequired(env, 'posts', postId, 'Enquete não encontrada.');
  if (post.type !== 'poll') throw httpError(400, 'Esta publicação não é uma enquete.');
  if (post.deletedByAdmin) throw httpError(410, 'Esta publicação foi removida por um administrador.');
  await requirePostAccess(env, identity.uid, post);

  const optionId = clean(body.optionId, 120);
  const options = Array.isArray(post.pollOptions)
    ? post.pollOptions.map(option => ({ ...option, voteCount: Number(option.voteCount || 0) }))
    : [];

  const selected = options.find(option => option.id === optionId);
  if (!selected) throw httpError(400, 'Opção de enquete inválida.');

  const voteId = `${postId}_${identity.uid}`;
  const existing = await fsGet(env, 'pollVotes', voteId);

  if (existing?.optionId === optionId) {
    return {
      ok: true,
      optionId,
      pollOptions: options,
      pollTotalVotes: Number(post.pollTotalVotes || 0)
    };
  }

  if (existing?.optionId) {
    const previous = options.find(option => option.id === existing.optionId);
    if (previous) previous.voteCount = Math.max(0, Number(previous.voteCount || 0) - 1);
  }

  selected.voteCount = Number(selected.voteCount || 0) + 1;
  const total = existing
    ? Number(post.pollTotalVotes || 0)
    : Number(post.pollTotalVotes || 0) + 1;

  await fsPut(env, 'pollVotes', voteId, {
    id: voteId,
    postId,
    uid: identity.uid,
    optionId,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  });

  await fsPut(env, 'posts', postId, {
    ...post,
    pollOptions: options,
    pollTotalVotes: total,
    updatedAt: nowIso()
  });

  deferRealtime(ctx, broadcastRealtimeForPost(env, post, 'poll_voted'));

  return { ok: true, optionId, pollOptions: options, pollTotalVotes: total };
}

async function discoverContent(env, identity) {
  const [postResponse, communityResponse, worldJobs, follows, memberships, reactions] = await Promise.all([
    fsListCollection(env, 'posts', 300),
    fsListCollection(env, 'communities', 180),
    fsWhere(env, 'jobs', 'audience', 'world', 120),
    fsWhere(env, 'socialFollows', 'followerUid', identity.uid, 250).catch(() => []),
    fsWhere(env, 'communityMembers', 'uid', identity.uid, 250).catch(() => []),
    fsWhere(env, 'reactions', 'uid', identity.uid, 250).catch(() => [])
  ]);

  const allPosts = postResponse || [];
  const allCommunities = communityResponse || [];
  const communityById = new Map(allCommunities.map(community => [community.id, community]));
  const followedUids = new Set(follows.map(item => item.targetUid).filter(Boolean));
  const joinedCommunityIds = new Set(memberships.map(item => item.communityId).filter(Boolean));
  const likedPostIds = new Set(reactions.map(item => item.postId).filter(Boolean));

  const visiblePosts = allPosts.filter(post => {
    if (!post || post.deletedAt || post.deletedByAdmin) return false;
    if (post.scope === 'world') return true;
    if (post.scope !== 'community' || !post.communityId) return false;
    const community = communityById.get(post.communityId);
    return Boolean(community && !community.companyId && publicCommunity(community));
  });

  const scorePost = post => {
    const ageHours = Math.max(0, (Date.now() - new Date(post.createdAt || 0).getTime()) / 3600000);
    const freshness = Math.max(0, 96 - ageHours) / 10;
    const social = Number(post.reactionCount || 0) * 1.5 + Number(post.commentCount || 0) * 2;
    const followBoost = followedUids.has(post.authorUid) ? 24 : 0;
    const unseenBoost = likedPostIds.has(post.id) ? 0 : 3;
    return freshness + social + followBoost + unseenBoost;
  };

  const posts = visiblePosts
    .sort((a,b) => scorePost(b) - scorePost(a))
    .slice(0, 40);

  const communities = allCommunities
    .filter(community => !community.companyId && publicCommunity(community) && community.archived !== true && community.status !== 'inactive')
    .map(community => ({
      ...communityView(community),
      alreadyMember: joinedCommunityIds.has(community.id),
      verifiedCompany: false
    }))
    .sort((a,b) => {
      if (a.alreadyMember !== b.alreadyMember) return a.alreadyMember ? 1 : -1;
      return Number(b.memberCount || 0) - Number(a.memberCount || 0);
    })
    .slice(0, 20);

  const jobs = worldJobs
    .filter(job => job.status !== 'closed')
    .sort(byCreatedDesc)
    .slice(0, 20)
    .map(jobView);

  const likedIds = new Set(reactions.map(item => item.postId));
  const receipts = await fsWhere(env, 'readReceipts', 'uid', identity.uid, 200).catch(() => []);
  const readIds = new Set(receipts.map(item => item.postId));
  const pollVotes = await fsWhere(env, 'pollVotes', 'uid', identity.uid, 200).catch(() => []);
  const pollVoteMap = new Map(pollVotes.map(vote => [vote.postId, vote.optionId]));

  return {
    posts: enrichPosts(posts, likedIds, readIds, pollVoteMap),
    communities,
    jobs
  };
}

async function searchPosts(env, identity, params) {
  const q = String(params.get('q') || '').trim().toLocaleLowerCase('pt-BR');
  if (q.length < 2) throw httpError(400, 'Digite ao menos 2 caracteres.');

  const companyId = params.get('companyId') || '';
  let posts = [];

  if (companyId) {
    const companyMember = await requireCompanyMember(env, identity.uid, companyId);
    const isAdmin = companyMember.role === 'owner' || companyMember.role === 'admin';
    const [cms, companyCommunities, raw] = await Promise.all([
      fsWhere(env, 'communityMembers', 'uid', identity.uid, 150),
      fsWhere(env, 'communities', 'companyId', companyId, 120),
      fsWhere(env, 'posts', 'companyId', companyId, 160)
    ]);
    const allowed = new Set(cms.filter(m => m.companyId === companyId).map(m => m.communityId));
    const visibilityByCommunity = new Map(companyCommunities.map(community => [
      community.id,
      normalizedCommunityVisibility(community.visibility)
    ]));
    const publicCommunityIds = new Set(
      companyCommunities.filter(publicCommunity).map(community => community.id)
    );

    posts = raw.filter(post =>
      (
        post.scope === 'company' ||
        (post.scope === 'community' && (isAdmin || allowed.has(post.communityId) || publicCommunityIds.has(post.communityId)))
      ) &&
      `${post.title || ''} ${post.text || ''} ${post.communityName || ''} ${post.eventLocation || ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(q)
    ).map(post => post.scope === 'community' ? {
      ...post,
      communityVisibility: visibilityByCommunity.get(post.communityId) || 'private'
    } : post);
  } else {
    const raw = await fsWhere(env, 'posts', 'scope', 'world', 100);
    posts = raw.filter(post =>
      `${post.title || ''} ${post.text || ''} ${post.eventLocation || ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(q)
    );
  }

  const userReactions = await fsWhere(env, 'reactions', 'uid', identity.uid, 200);
  const likedIds = new Set(userReactions.map(r => r.postId));
  const userReceipts = await fsWhere(env, 'readReceipts', 'uid', identity.uid, 200);
  const readIds = new Set(userReceipts.map(r => r.postId));
  const userPollVotes = await fsWhere(env, 'pollVotes', 'uid', identity.uid, 200);
  const pollVoteMap = new Map(userPollVotes.map(vote => [vote.postId, vote.optionId]));

  return { posts: enrichPosts(posts, likedIds, readIds, pollVoteMap).slice(0, 30) };
}

function directConversationId(uidA, uidB) {
  return [uidA, uidB].sort().join('__');
}

async function assertDirectMessageAllowed(env, senderUid, targetUid) {
  if (!targetUid || senderUid === targetUid) throw httpError(400, 'Escolha outra pessoa para conversar.');
  const target = await fsGetRequired(env, 'users', targetUid, 'Usuário não encontrado.');
  const [myBlock, theirBlock] = await Promise.all([
    fsGet(env, 'socialBlocks', `${senderUid}__${targetUid}`),
    fsGet(env, 'socialBlocks', `${targetUid}__${senderUid}`)
  ]);
  if (myBlock || theirBlock) throw httpError(403, 'Não é possível trocar mensagens enquanto houver bloqueio.');
  return target;
}

async function listMessageConversations(env, identity, params) {
  const pageSize = Math.min(30, Math.max(10, Number(params.get('limit') || 20)));
  const offset = Math.max(0, Number(params.get('offset') || 0));
  const [asA, asB] = await Promise.all([
    fsWhere(env, 'messageConversations', 'userA', identity.uid, 250).catch(() => []),
    fsWhere(env, 'messageConversations', 'userB', identity.uid, 250).catch(() => [])
  ]);
  const all = [...asA, ...asB]
    .filter((item, index, arr) => arr.findIndex(x => x.id === item.id) === index)
    .sort((a,b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

  const slice = all.slice(offset, offset + pageSize);
  const conversations = [];
  for (const conversation of slice) {
    const targetUid = conversation.userA === identity.uid ? conversation.userB : conversation.userA;
    const user = await fsGet(env, 'users', targetUid);
    conversations.push({
      id: conversation.id,
      targetUid,
      displayName: user?.displayName || 'Usuário',
      username: user?.username || '',
      avatarMediaId: user?.avatarMediaId || '',
      status: conversation.status || 'accepted',
      requestedBy: conversation.requestedBy || '',
      lastMessagePreview: conversation.lastMessagePreview || '',
      lastMessageAt: conversation.lastMessageAt || conversation.updatedAt || '',
      unreadCount: Number(conversation[`unread_${identity.uid}`] || 0)
    });
  }

  return {
    conversations,
    offset,
    nextOffset: offset + slice.length < all.length ? offset + slice.length : null
  };
}

async function getDirectMessages(env, identity, targetUid, params) {
  await assertDirectMessageAllowed(env, identity.uid, targetUid);
  const conversationId = directConversationId(identity.uid, targetUid);
  const conversation = await fsGet(env, 'messageConversations', conversationId);
  if (!conversation) return { conversation: null, messages: [], nextBefore: '' };

  const limit = Math.min(60, Math.max(10, Number(params.get('limit') || 30)));
  const before = clean(params.get('before') || '', 80);
  let rows = await fsWhere(env, 'directMessages', 'conversationId', conversationId, 500).catch(() => []);
  rows = rows.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  if (before) rows = rows.filter(item => new Date(item.createdAt || 0).getTime() < new Date(before).getTime());
  const page = rows.slice(0, limit);
  const messages = page.reverse();

  if (Number(conversation[`unread_${identity.uid}`] || 0) > 0) {
    await fsPut(env, 'messageConversations', conversationId, {
      ...conversation,
      [`unread_${identity.uid}`]: 0,
      updatedAt: conversation.updatedAt || nowIso()
    });
  }

  return {
    conversation: {
      id: conversationId,
      status: conversation.status || 'accepted',
      requestedBy: conversation.requestedBy || '',
      targetUid
    },
    messages,
    nextBefore: page.length === limit ? page[0]?.createdAt || '' : ''
  };
}

async function acceptMessageRequest(env, identity, targetUid) {
  const conversationId = directConversationId(identity.uid, targetUid);
  const conversation = await fsGetRequired(env, 'messageConversations', conversationId, 'Solicitação de conversa não encontrada.');
  if (conversation.status !== 'pending' || conversation.requestedBy === identity.uid) {
    throw httpError(409, 'Esta solicitação não está aguardando sua aprovação.');
  }
  const updated = { ...conversation, status: 'accepted', acceptedAt: nowIso(), updatedAt: nowIso() };
  await fsPut(env, 'messageConversations', conversationId, updated);
  return { ok: true, status: 'accepted' };
}

async function rejectMessageRequest(env, identity, targetUid) {
  const conversationId = directConversationId(identity.uid, targetUid);
  const conversation = await fsGetRequired(env, 'messageConversations', conversationId, 'Solicitação de conversa não encontrada.');
  if (conversation.status !== 'pending' || conversation.requestedBy === identity.uid) {
    throw httpError(409, 'Esta solicitação não está aguardando sua decisão.');
  }
  await fsDelete(env, 'messageConversations', conversationId);
  const messages = await fsWhere(env, 'directMessages', 'conversationId', conversationId, 100).catch(() => []);
  for (const message of messages) await fsDelete(env, 'directMessages', message.id);
  return { ok: true, rejected: true };
}

async function sendDirectMessage(env, identity, targetUid, body, ctx) {
  const target = await assertDirectMessageAllowed(env, identity.uid, targetUid);
  const sender = await ensureUser(env, identity);
  const conversationId = directConversationId(identity.uid, targetUid);
  let conversation = await fsGet(env, 'messageConversations', conversationId);

  const [followsTarget, targetFollows] = await Promise.all([
    fsGet(env, 'socialFollows', `${identity.uid}__${targetUid}`),
    fsGet(env, 'socialFollows', `${targetUid}__${identity.uid}`)
  ]);

  if (!conversation) {
    conversation = {
      id: conversationId,
      userA: [identity.uid, targetUid].sort()[0],
      userB: [identity.uid, targetUid].sort()[1],
      status: followsTarget && targetFollows ? 'accepted' : 'pending',
      requestedBy: identity.uid,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      [`unread_${identity.uid}`]: 0,
      [`unread_${targetUid}`]: 0
    };
  } else if (conversation.status === 'pending' && conversation.requestedBy === identity.uid) {
    const existingMessages = await fsWhere(env, 'directMessages', 'conversationId', conversationId, 20).catch(() => []);
    if (existingMessages.length) throw httpError(409, 'Aguarde a pessoa aceitar sua solicitação de conversa.');
  }

  const text = clean(body.text || '', 4000);
  const postId = clean(body.postId || '', 150);
  const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.slice(0, 4) : [];
  if (!text && !postId && !attachmentIds.length) throw httpError(400, 'Escreva uma mensagem ou adicione um conteúdo.');

  let sharedPost = null;
  if (postId) {
    const post = await fsGetRequired(env, 'posts', postId, 'Publicação compartilhada não encontrada.');
    await requirePostAccess(env, identity.uid, post);
    await requirePostAccess(env, targetUid, post);
    sharedPost = {
      id: post.id,
      authorName: post.authorName || '',
      text: clean(post.text || post.title || '', 220),
      scope: post.scope,
      companyId: post.companyId || ''
    };
  }

  const attachments = [];
  for (const mediaId of attachmentIds) {
    const media = await fsGetRequired(env, 'media', clean(mediaId, 150), 'Arquivo não encontrado.');
    if (media.ownerUid !== identity.uid || media.scope !== 'message' || media.targetUid !== targetUid) {
      throw httpError(403, 'Arquivo inválido para esta conversa.');
    }
    attachments.push({ id: media.id, name: media.name, contentType: media.contentType, size: media.size });
  }

  const createdAt = nowIso();
  const messageId = id();
  const message = {
    id: messageId,
    conversationId,
    senderUid: identity.uid,
    recipientUid: targetUid,
    text,
    attachments,
    sharedPost,
    createdAt
  };
  await fsPut(env, 'directMessages', messageId, message);

  const preview = text
    ? clean(text.replace(/\s+/g, ' '), 110)
    : sharedPost
      ? 'Compartilhou uma publicação'
      : attachments[0]?.contentType?.startsWith('audio/')
        ? 'Enviou um áudio'
        : attachments[0]?.contentType?.startsWith('video/')
          ? 'Enviou um vídeo'
          : 'Enviou uma foto';

  conversation = {
    ...conversation,
    lastMessagePreview: preview,
    lastMessageAt: createdAt,
    lastSenderUid: identity.uid,
    updatedAt: createdAt,
    [`unread_${targetUid}`]: Number(conversation[`unread_${targetUid}`] || 0) + 1
  };
  await fsPut(env, 'messageConversations', conversationId, conversation);

  const notificationId = `message_${messageId}_${targetUid}`;
  const notification = {
    recipientUid: targetUid,
    type: conversation.status === 'pending' ? 'message_request' : 'direct_message',
    title: conversation.status === 'pending'
      ? `${sender.displayName || 'Alguém'} quer conversar com você`
      : `Nova mensagem de ${sender.displayName || 'Alguém'}`,
    body: preview,
    data: {
      targetView: 'messages',
      conversationUid: identity.uid,
      messageId
    },
    read: false,
    persistent: false,
    status: 'new',
    createdAt
  };
  await fsPut(env, 'notifications', notificationId, notification);
  deferPushes(ctx, [sendPushToUser(env, targetUid, {
    title: notification.title,
    body: preview,
    notificationId,
    type: notification.type,
    targetView: 'messages',
    url: `/?messages=1&conversation=${encodeURIComponent(identity.uid)}`
  })]);

  return { message, conversation: { id: conversationId, status: conversation.status, requestedBy: conversation.requestedBy } };
}

async function uploadMedia(request, env, identity, params) {
  const scope=params.get('scope');
  if(!['world','company','community','avatar','message'].includes(scope))throw httpError(400,'Audiência inválida.');
  const companyId=params.get('companyId')||'';const communityId=params.get('communityId')||'';const targetUid=params.get('targetUid')||'';
  if(scope==='company')await requireCompanyMember(env,identity.uid,companyId);
  if(scope==='community'){
    const community=await fsGetRequired(env,'communities',communityId,'Comunidade não encontrada.');
    await requireCommunityAccess(env,identity.uid,community);
  }
  if(scope==='message')await assertDirectMessageAllowed(env,identity.uid,targetUid);

  const limit=scope==='avatar'?5*1024*1024:20*1024*1024;
  const length=Number(request.headers.get('content-length')||0);
  if(length>limit)throw httpError(413,scope==='avatar'?'A foto de perfil pode ter no máximo 5 MB.':'O limite por arquivo na v1 é 20 MB.');

  const contentType=(request.headers.get('content-type')||'application/octet-stream').slice(0,120);
  if(scope==='avatar'&&!['image/jpeg','image/png','image/webp'].includes(contentType))throw httpError(415,'Use uma imagem JPG, PNG ou WebP.');

  const name=clean(request.headers.get('x-file-name')||params.get('name')||'arquivo',180);
  const body=await request.arrayBuffer();
  if(body.byteLength>limit)throw httpError(413,scope==='avatar'?'A foto de perfil pode ter no máximo 5 MB.':'O limite por arquivo na v1 é 20 MB.');

  const mediaId=id();const safeName=name.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-100)||'arquivo';
  const key=scope==='avatar'
    ? `users/${identity.uid}/avatar/${mediaId}-${safeName}`
    : scope==='world'
      ? `world/${identity.uid}/${mediaId}-${safeName}`
      : scope==='message'
        ? `messages/${directConversationId(identity.uid,targetUid)}/${identity.uid}/${mediaId}-${safeName}`
        : scope==='company'
          ? `companies/${companyId}/general/${identity.uid}/${mediaId}-${safeName}`
          : `communities/${communityId}/${identity.uid}/${mediaId}-${safeName}`;

  await env.MEDIA.put(key,body,{httpMetadata:{contentType},customMetadata:{ownerUid:identity.uid,scope,companyId,communityId,targetUid,mediaId}});
  const media={id:mediaId,key,ownerUid:identity.uid,scope,companyId,communityId,targetUid,name,contentType,size:body.byteLength,createdAt:nowIso()};
  await fsPut(env,'media',mediaId,media);
  return {media};
}
async function getMedia(env, identity, mediaId) {
  const media=await fsGetRequired(env,'media',mediaId,'Arquivo não encontrado.');
  if(media.scope==='company')await requireCompanyMember(env,identity.uid,media.companyId);
  else if(media.scope==='message'){
    if(identity.uid!==media.ownerUid&&identity.uid!==media.targetUid)throw httpError(403,'Sem permissão para este arquivo.');
  }
  else if(media.scope==='community'){
    const community=await fsGetRequired(env,'communities',media.communityId,'Comunidade não encontrada.');
    if(community.companyId!==media.companyId)throw httpError(403,'Comunidade inválida.');
    await requireCommunityAccess(env,identity.uid,community);
  }
  const object=await env.MEDIA.get(media.key);if(!object)throw httpError(404,'Arquivo não encontrado no armazenamento.');
  const headers=new Headers();object.writeHttpMetadata(headers);
  headers.set('Cache-Control',media.scope==='world'||media.scope==='avatar'?'private, max-age=300':'private, no-store');
  headers.set('Content-Disposition',`inline; filename="${String(media.name||'arquivo').replace(/["\r\n]/g,'')}"`);
  return new Response(object.body,{headers});
}
async function markNotificationRead(env, identity, idValue) {
  const n = await fsGetRequired(env, 'notifications', idValue, 'Notificação não encontrada.');
  if (n.recipientUid !== identity.uid) throw httpError(403, 'Sem permissão.');

  if (n.persistent && n.status === 'pending_confirmation') {
    return {
      ok: true,
      persistent: true,
      message: 'Esta notificação permanecerá no sino até a confirmação de leitura.'
    };
  }

  await fsPut(env, 'notifications', idValue, {
    ...n,
    read: true,
    readAt: nowIso()
  });

  return { ok: true, persistent: false };
}

async function deleteNotification(env, identity, idValue) {
  const notification = await fsGetRequired(env, 'notifications', idValue, 'Notificação não encontrada.');
  if (notification.recipientUid !== identity.uid) throw httpError(403, 'Sem permissão.');
  if (notification.persistent && notification.status === 'pending_confirmation') {
    throw httpError(409, 'Confirme a leitura da publicação antes de excluir esta notificação.');
  }
  if (
    notification.status === 'pending' &&
    ['company_invite', 'community_invite'].includes(notification.type)
  ) {
    throw httpError(409, 'Aceite ou aguarde o encerramento do convite antes de excluir esta notificação.');
  }

  await fsDelete(env, 'notifications', idValue);
  return { ok: true, deletedNotificationId: idValue };
}

async function requirePostAccess(env, uid, post) {
  if(post.scope==='world')return true;
  if(post.scope==='company')return requireCompanyMember(env,uid,post.companyId);
  if(post.scope==='community'){
    const community=await fsGetRequired(env,'communities',post.communityId,'Comunidade não encontrada.');
    if(community.companyId!==post.companyId)throw httpError(403,'Comunidade inválida.');
    post.communityVisibility=normalizedCommunityVisibility(community.visibility);
    return requireCommunityAccess(env,uid,community);
  }
  throw httpError(403,'Sem permissão.');
}
async function requireCompanyMember(env, uid, companyId) {if(!companyId)throw httpError(400,'Empresa inválida.');const m=await fsGet(env,'companyMembers',`${companyId}_${uid}`);if(!m||m.status!=='active')throw httpError(403,'Você não faz parte desta empresa.');return m;}
async function requireCompanyAdmin(env, uid, companyId) {const m=await requireCompanyMember(env,uid,companyId);if(!['owner','admin'].includes(m.role))throw httpError(403,'Somente administradores podem fazer isso.');return m;}
async function requireCommunityMember(env, uid, communityId) {const m=await fsGet(env,'communityMembers',`${communityId}_${uid}`);if(!m)throw httpError(403,'Você não participa desta comunidade.');return m;}

async function maybeSendInviteEmail(env, email, companyName, inviteUrl) {
  if (!env.RESEND_API_KEY || !env.INVITE_FROM_EMAIL) {
    return {
      sent: false,
      status: 'not_configured',
      error: 'O envio de e-mail ainda não está configurado no Worker.',
      providerId: ''
    };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.INVITE_FROM_EMAIL,
        to: [email],
        subject: `${companyName} convidou você para o Uorqui`,
        text: `${companyName} convidou você para o Uorqui. Aceite o convite em ${inviteUrl}. Este convite expira em 7 dias.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>Você foi convidado para ${htmlEscape(companyName)}</h2><p>Crie ou entre na sua conta Uorqui para acessar o ambiente privado da empresa.</p><p><a href="${htmlEscape(inviteUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px">Aceitar convite</a></p><p style="color:#777;font-size:12px">Este convite expira em 7 dias.</p></div>`
      })
    });
    const responseText = await response.text();
    let responseBody = {};
    try { responseBody = responseText ? JSON.parse(responseText) : {}; } catch {}

    if (response.ok) {
      return {
        sent: true,
        status: 'sent',
        error: '',
        providerId: clean(responseBody.id || '', 200)
      };
    }

    const providerError = clean(
      responseBody.message || responseBody.error || responseText || `Erro ${response.status}`,
      300
    );
    console.error(JSON.stringify({
      message: 'Falha ao enviar convite por e-mail',
      provider: 'resend',
      status: response.status,
      error: providerError
    }));
    return {
      sent: false,
      status: 'failed',
      error: providerError || 'O provedor recusou o envio do convite.',
      providerId: ''
    };
  } catch (error) {
    const message = clean(error instanceof Error ? error.message : String(error), 300);
    console.error(JSON.stringify({
      message: 'Erro de conexão ao enviar convite por e-mail',
      provider: 'resend',
      error: message
    }));
    return {
      sent: false,
      status: 'failed',
      error: message || 'Não foi possível acessar o provedor de e-mail.',
      providerId: ''
    };
  }
}

function asaasApiBase(env) {
  return String(env.ASAAS_ENV || 'sandbox').toLowerCase() === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3';
}

async function asaasRequest(env, path, options = {}) {
  if (!env.ASAAS_API_KEY) throw httpError(503, 'A cobrança ainda não foi configurada. Adicione ASAAS_API_KEY ao Worker.');

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

function addDaysIso(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function addMonthsIso(months = 1) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

function asaasDateTime(date = new Date(Date.now() + 5 * 60000)) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

async function getBillingStatus(env, identity, companyId) {
  const membership = await requireCompanyMember(env, identity.uid, companyId);
  const company = await fsGetRequired(env, 'companies', companyId, 'Empresa não encontrada.');
  const usage = await companyUsage(env, companyId);

  return {
    company: companyPlanView(company, env, {
      role: membership.role,
      memberCount: usage.memberCount,
      communityCount: usage.communityCount
    })
  };
}

async function createPremiumCheckout(env, identity, companyId, origin) {
  const membership = await requireCompanyMember(env, identity.uid, companyId);
  if (membership.role !== 'owner') throw httpError(403, 'Somente o proprietário pode contratar o Premium.');

  const company = await fsGetRequired(env, 'companies', companyId, 'Empresa não encontrada.');
  if (hasPremiumAccess(company) && company.billingStatus === 'active') {
    throw httpError(409, 'Esta empresa já possui Uorqui Premium ativo.');
  }

  const createdAt = company.billingCheckoutCreatedAt ? new Date(company.billingCheckoutCreatedAt).getTime() : 0;
  if (
    company.billingStatus === 'pending' &&
    company.billingCheckoutLink &&
    createdAt > Date.now() - 50 * 60000
  ) {
    return {
      checkoutId: company.billingCheckoutId,
      url: company.billingCheckoutLink,
      reused: true
    };
  }

  const externalReference = `uorqui-premium:${companyId}:${id()}`;
  const price = premiumMonthlyPrice(env);
  const returnBase = `${origin.replace(/\/$/, '')}/?billingCompany=${encodeURIComponent(companyId)}`;

  const result = await asaasRequest(env, '/checkouts', {
    method: 'POST',
    body: JSON.stringify({
      billingTypes: ['PIX', 'CREDIT_CARD'],
      chargeTypes: ['RECURRENT'],
      minutesToExpire: 60,
      externalReference,
      callback: {
        successUrl: `${returnBase}&billing=success`,
        cancelUrl: `${returnBase}&billing=cancel`,
        expiredUrl: `${returnBase}&billing=expired`
      },
      items: [{
        externalReference: `uorqui-premium-${companyId}`,
        name: 'Uorqui Premium',
        description: `Plano Premium mensal da empresa ${company.name}`,
        quantity: 1,
        value: price
      }],
      subscription: {
        cycle: 'MONTHLY',
        nextDueDate: asaasDateTime()
      }
    })
  });

  const checkoutId = clean(result?.id || '', 160);
  const checkoutLink = clean(
    result?.link ||
      (checkoutId ? `${String(env.ASAAS_ENV || 'sandbox').toLowerCase() === 'production' ? 'https://asaas.com' : 'https://sandbox.asaas.com'}/checkoutSession/show?id=${encodeURIComponent(checkoutId)}` : ''),
    500
  );

  if (!checkoutId || !checkoutLink) throw httpError(502, 'O Asaas não retornou um checkout válido.');

  await fsPut(env, 'companies', companyId, {
    ...company,
    plan: company.plan === 'premium' ? 'premium' : 'free',
    billingProvider: 'asaas',
    billingStatus: 'pending',
    billingCheckoutId: checkoutId,
    billingCheckoutLink: checkoutLink,
    billingCheckoutCreatedAt: nowIso(),
    billingExternalReference: externalReference,
    updatedAt: nowIso()
  });

  return { checkoutId, url: checkoutLink, reused: false };
}

async function cancelPremiumSubscription(env, identity, companyId) {
  const membership = await requireCompanyMember(env, identity.uid, companyId);
  if (membership.role !== 'owner') throw httpError(403, 'Somente o proprietário pode cancelar o Premium.');

  const company = await fsGetRequired(env, 'companies', companyId, 'Empresa não encontrada.');
  if (!company.billingSubscriptionId) {
    throw httpError(409, 'A assinatura ainda não foi vinculada. Aguarde a confirmação do pagamento ou cancele pelo painel do Asaas.');
  }

  await asaasRequest(env, `/subscriptions/${encodeURIComponent(company.billingSubscriptionId)}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'INACTIVE' })
  });

  await fsPut(env, 'companies', companyId, {
    ...company,
    billingStatus: 'canceled',
    updatedAt: nowIso()
  });

  return {
    ok: true,
    premiumUntil: company.premiumUntil || ''
  };
}

function companyIdFromBillingReference(value) {
  const text = String(value || '');
  const match = text.match(/^uorqui-premium:([^:]+):/);
  return match?.[1] || '';
}

async function findCompanyForAsaasEvent(env, payload) {
  const checkout = payload?.checkout || {};
  const payment = payload?.payment || {};
  const subscription = payload?.subscription || {};

  const directId = companyIdFromBillingReference(
    checkout.externalReference || subscription.externalReference || payment.externalReference
  );
  if (directId) {
    const direct = await fsGet(env, 'companies', directId);
    if (direct) return direct;
  }

  const checkoutId = clean(checkout.id || '', 180);
  if (checkoutId) {
    const found = await fsWhere(env, 'companies', 'billingCheckoutId', checkoutId, 5);
    if (found[0]) return found[0];
  }

  const subscriptionId = clean(subscription.id || payment.subscription || '', 180);
  if (subscriptionId) {
    const found = await fsWhere(env, 'companies', 'billingSubscriptionId', subscriptionId, 5);
    if (found[0]) return found[0];
  }

  const customerId = clean(checkout.customer || payment.customer || subscription.customer || '', 180);
  if (customerId) {
    const found = await fsWhere(env, 'companies', 'billingCustomerId', customerId, 5);
    if (found[0]) return found[0];
  }

  return null;
}

async function handleAsaasWebhook(request, env) {
  if (!env.ASAAS_WEBHOOK_TOKEN) throw httpError(503, 'ASAAS_WEBHOOK_TOKEN não configurado.');
  const receivedToken = request.headers.get('asaas-access-token') || '';
  if (!receivedToken || receivedToken !== env.ASAAS_WEBHOOK_TOKEN) {
    throw httpError(401, 'Webhook não autorizado.');
  }

  const payload = await readJson(request);
  const eventId = clean(payload?.id || '', 220);
  const event = clean(payload?.event || '', 120);
  if (!eventId || !event) throw httpError(400, 'Evento do Asaas inválido.');

  const existing = await fsGet(env, 'billingWebhookEvents', eventId);
  if (existing?.processedAt) return json({ ok: true, duplicate: true });

  await fsPut(env, 'billingWebhookEvents', eventId, {
    id: eventId,
    event,
    receivedAt: nowIso(),
    processedAt: ''
  });

  const company = await findCompanyForAsaasEvent(env, payload);
  if (!company) {
    await fsPut(env, 'billingWebhookEvents', eventId, {
      id: eventId,
      event,
      receivedAt: existing?.receivedAt || nowIso(),
      processedAt: nowIso(),
      companyId: '',
      ignored: true
    });
    return json({ ok: true, ignored: true });
  }

  const checkout = payload.checkout || {};
  const payment = payload.payment || {};
  const subscription = payload.subscription || {};
  const updates = { ...company, updatedAt: nowIso() };

  if (event === 'CHECKOUT_PAID') {
    updates.plan = 'premium';
    updates.billingStatus = 'active';
    updates.premiumUntil = addMonthsIso(1);
    updates.billingCheckoutId = checkout.id || company.billingCheckoutId || '';
    updates.billingCheckoutLink = checkout.link || company.billingCheckoutLink || '';
    updates.billingCustomerId = checkout.customer || company.billingCustomerId || '';
    updates.billingSubscriptionId =
      checkout.subscription?.id ||
      checkout.subscriptionId ||
      company.billingSubscriptionId ||
      '';
  } else if (event === 'CHECKOUT_CANCELED' || event === 'CHECKOUT_EXPIRED') {
    if (!hasPremiumAccess(company)) updates.billingStatus = 'inactive';
  } else if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
    updates.plan = 'premium';
    updates.billingStatus = 'active';
    updates.premiumUntil = addMonthsIso(1);
    updates.billingCustomerId = payment.customer || company.billingCustomerId || '';
    updates.billingSubscriptionId = payment.subscription || company.billingSubscriptionId || '';
  } else if (event === 'PAYMENT_OVERDUE') {
    updates.billingStatus = 'past_due';
    updates.billingSubscriptionId = payment.subscription || company.billingSubscriptionId || '';
  } else if (
    event === 'PAYMENT_REFUNDED' ||
    event === 'PAYMENT_DELETED' ||
    event === 'PAYMENT_CHARGEBACK_REQUESTED'
  ) {
    updates.billingStatus = 'past_due';
  } else if (event === 'SUBSCRIPTION_CREATED' || event === 'SUBSCRIPTION_UPDATED') {
    updates.billingSubscriptionId = subscription.id || company.billingSubscriptionId || '';
    updates.billingCustomerId = subscription.customer || company.billingCustomerId || '';
  } else if (event === 'SUBSCRIPTION_INACTIVATED' || event === 'SUBSCRIPTION_DELETED') {
    updates.billingStatus = 'canceled';
    updates.billingSubscriptionId = subscription.id || company.billingSubscriptionId || '';
  }

  await fsPut(env, 'companies', company.id, updates);
  await fsPut(env, 'billingWebhookEvents', eventId, {
    id: eventId,
    event,
    receivedAt: existing?.receivedAt || nowIso(),
    processedAt: nowIso(),
    companyId: company.id,
    ignored: false
  });

  return json({ ok: true });
}

const DAY_MS = 86400000;
const POST_FOLLOW_UP_MS = 5 * DAY_MS;

async function sendPostFollowUpReminders(env, now) {
  const unresolvedPosts = await fsWhere(env, 'posts', 'isResolved', false, 250);

  for (const post of unresolvedPosts) {
    if (
      post.deletedByAdmin ||
      !post.authorUid ||
      Number(post.commentCount || 0) < 1 ||
      !['post', 'question'].includes(post.type)
    ) continue;

    // Posts anteriores não tinham lastCommentAt. updatedAt é um fallback
    // conservador: pode adiar o lembrete, mas não o dispara cedo.
    const lastCommentAt = post.lastCommentAt || post.updatedAt || post.createdAt || '';
    const lastCommentMs = new Date(lastCommentAt).getTime();
    if (!Number.isFinite(lastCommentMs) || now - lastCommentMs < POST_FOLLOW_UP_MS) continue;
    if (post.followUpReminderFor === lastCommentAt) continue;

    const notificationId = `post_follow_up_${post.id}_${lastCommentMs}`;
    const createdAt = nowIso();
    const notification = {
      recipientUid: post.authorUid,
      type: 'post_follow_up',
      title: 'Sua publicação está sem novas respostas',
      body: 'Já se passaram 5 dias desde a última resposta. Marque como concluída ou continue o assunto.',
      data: {
        postId: post.id,
        companyId: post.companyId || '',
        communityId: post.communityId || '',
        openComments: 'true'
      },
      read: false,
      persistent: false,
      status: 'new',
      createdAt
    };

    await fsPut(env, 'notifications', notificationId, notification);
    await fsPut(env, 'posts', post.id, {
      ...post,
      lastCommentAt,
      followUpReminderFor: lastCommentAt,
      followUpReminderAt: createdAt
    });
    await sendPushToUser(env, post.authorUid, {
      title: notification.title,
      body: notification.body,
      notificationId,
      type: notification.type,
      postId: post.id,
      companyId: post.companyId || '',
      communityId: post.communityId || '',
      openComments: 'true'
    });
  }
}

const ESTABLISHED_ADMIN_MS = 7 * DAY_MS;
const ADMIN_SECURITY_DELAY_MS = 24 * 60 * 60 * 1000;

function adminEstablishedAt(member) {
  const value = member?.adminSince || member?.roleUpdatedAt || member?.joinedAt || member?.createdAt || '';
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isEstablishedAdmin(member, now = Date.now()) {
  return Boolean(
    member?.role === 'admin' &&
    adminEstablishedAt(member) &&
    now - adminEstablishedAt(member) >= ESTABLISHED_ADMIN_MS
  );
}

async function createAdminSecurityChange(env, actorUid, company, target, action, nextRole = '') {
  const existing = await fsWhere(env, 'adminSecurityChanges', 'targetUid', target.uid, 50).catch(() => []);
  const pending = existing.find(item =>
    item.companyId === company.id &&
    item.status === 'pending' &&
    item.action === action
  );
  if (pending) return pending;

  const requestedAt = nowIso();
  const executeAfter = new Date(Date.now() + ADMIN_SECURITY_DELAY_MS).toISOString();
  const change = {
    id: id(),
    companyId: company.id,
    companyName: company.name || 'Empresa',
    targetUid: target.uid,
    targetName: target.displayName || target.email || 'Administrador',
    requestedBy: actorUid,
    action,
    nextRole,
    status: 'pending',
    requestedAt,
    executeAfter,
    createdAt: requestedAt,
    updatedAt: requestedAt
  };
  await fsPut(env, 'adminSecurityChanges', change.id, change);

  const adminMembers = await fsWhere(env, 'companyMembers', 'companyId', company.id, 500).catch(() => []);
  const recipients = new Set(
    adminMembers
      .filter(member => member.status === 'active' && ['owner', 'admin'].includes(member.role))
      .map(member => member.uid)
      .filter(Boolean)
  );
  recipients.add(target.uid);

  for (const uid of recipients) {
    await fsPut(env, 'notifications', `admin_security_${change.id}_${uid}`, {
      recipientUid: uid,
      type: 'admin_security_delay',
      title: action === 'remove'
        ? `Remoção de administrador agendada`
        : `Alteração de administrador agendada`,
      body: `${change.targetName} é administrador há mais de 7 dias. A alteração só poderá ser executada após 24 horas corridas.`,
      data: {
        companyId: company.id,
        targetUid: target.uid,
        securityChangeId: change.id,
        executeAfter,
        targetView: 'notifications'
      },
      read: false,
      status: 'new',
      createdAt: requestedAt
    });
  }

  return change;
}

async function cancelPendingDeletionRequestsForCompany(env, companyId, reason = '') {
  const requests = await fsWhere(env, 'deletionRequests', 'companyId', companyId, 100).catch(() => []);
  for (const request of requests) {
    if (request.status !== 'pending') continue;
    await fsPut(env, 'deletionRequests', request.id, {
      ...request,
      status: 'canceled',
      canceledAt: nowIso(),
      cancelReason: reason || 'Mudança na composição de administradores.',
      updatedAt: nowIso()
    });
  }
}

async function executeCompanyMemberRemoval(env, company, target) {
  const companyId = company.id;
  const targetUid = target.uid;

  await fsDelete(env, 'companyMembers', `${companyId}_${targetUid}`);

  const targetEmail = normalizeEmail(target.email || '');
  const companyInvites = await fsWhere(env, 'invites', 'companyId', companyId, 250);
  const relatedInvites = companyInvites.filter(invite =>
    invite.targetUid === targetUid ||
    (targetEmail && normalizeEmail(invite.email || '') === targetEmail)
  );
  if (relatedInvites.length) {
    const cleanup = [];
    for (const invite of relatedInvites) {
      cleanup.push({ collection: 'invites', id: invite.id });
      const recipientUids = new Set([targetUid, invite.targetUid].filter(Boolean));
      for (const recipientUid of recipientUids) {
        cleanup.push({ collection: 'notifications', id: `invite_${invite.id}_${recipientUid}` });
      }
    }
    await fsBatchDelete(env, cleanup);
  }

  await cleanupCompanyAccessForUser(env, companyId, targetUid);

  await fsPut(env, 'notifications', `company_removed_${companyId}_${targetUid}_${Date.now()}`, {
    recipientUid: targetUid,
    type: 'company_member_removed',
    title: `Você foi removido de ${company.name}`,
    body: 'Seu acesso à empresa e aos espaços vinculados foi removido.',
    data: { companyId, targetView: 'notifications' },
    read: false,
    status: 'new',
    createdAt: nowIso()
  });
}

async function executeAdminSecurityChanges(env) {
  const pending = await fsWhere(env, 'adminSecurityChanges', 'status', 'pending', 100).catch(() => []);
  const now = Date.now();

  for (const change of pending) {
    const due = new Date(change.executeAfter || 0).getTime();
    if (!Number.isFinite(due) || due > now) continue;

    const [company, target] = await Promise.all([
      fsGet(env, 'companies', change.companyId),
      fsGet(env, 'companyMembers', `${change.companyId}_${change.targetUid}`)
    ]);

    if (!company || !target || target.status !== 'active') {
      await fsPut(env, 'adminSecurityChanges', change.id, {
        ...change,
        status: 'canceled',
        canceledAt: nowIso(),
        cancelReason: 'Empresa ou administrador não está mais ativo.',
        updatedAt: nowIso()
      });
      continue;
    }

    // A proteção só executa a ação agendada se o alvo ainda for administrador.
    if (target.role !== 'admin') {
      await fsPut(env, 'adminSecurityChanges', change.id, {
        ...change,
        status: 'canceled',
        canceledAt: nowIso(),
        cancelReason: 'O usuário não é mais administrador.',
        updatedAt: nowIso()
      });
      continue;
    }

    if (change.action === 'demote') {
      await fsPut(env, 'companyMembers', target.id || `${change.companyId}_${change.targetUid}`, {
        ...target,
        role: 'member',
        roleUpdatedAt: nowIso(),
        adminSince: '',
        updatedAt: nowIso()
      });
      await fsPut(env, 'notifications', `role_delayed_${change.companyId}_${change.targetUid}_${Date.now()}`, {
        recipientUid: change.targetUid,
        type: 'role_changed',
        title: 'Seu nível de acesso foi alterado',
        body: 'Após a janela de segurança de 24 horas, seu nível agora é Usuário.',
        data: { companyId: change.companyId },
        read: false,
        status: 'new',
        createdAt: nowIso()
      });
    } else if (change.action === 'remove') {
      await executeCompanyMemberRemoval(env, company, target);
    }

    await cancelPendingDeletionRequestsForCompany(
      env,
      change.companyId,
      'A composição de administradores mudou após uma janela de segurança.'
    );

    await fsPut(env, 'adminSecurityChanges', change.id, {
      ...change,
      status: 'completed',
      completedAt: nowIso(),
      updatedAt: nowIso()
    });
  }
}

async function runScheduled(env) {
  const now = Date.now();
  const pending = await fsWhere(env, 'invites', 'status', 'pending', 20);

  for (const invite of pending) {
    if (isExpired(invite.expiresAt)) {
      invite.status = 'expired';
      invite.updatedAt = nowIso();
      await fsPut(env, 'invites', invite.id, invite);
      continue;
    }

    const age = now - new Date(invite.createdAt).getTime();
    if (invite.targetUid && age > 3 * DAY_MS) {
      const notificationId = `invite_reminder_${invite.id}_${invite.targetUid}`;
      const existing = await fsGet(env, 'notifications', notificationId);
      if (!existing) {
        await fsPut(env, 'notifications', notificationId, {
          recipientUid: invite.targetUid,
          type: 'invite_reminder',
          title: 'Você tem um convite pendente',
          body: invite.type === 'company'
            ? `${invite.companyName} ainda aguarda sua resposta.`
            : `Convite pendente para ${invite.communityName}.`,
          data: { inviteId: invite.id },
          read: false,
          status: 'new',
          createdAt: nowIso()
        });
      }
    }
  }

  await sendPostFollowUpReminders(env, now);
  await executeAdminSecurityChanges(env);
}

async function requireAuth(request, env) {
  const header=request.headers.get('Authorization')||'';if(!header.startsWith('Bearer '))throw httpError(401,'Faça login para continuar.');const token=header.slice(7);return verifyFirebaseToken(token,env.FIREBASE_PROJECT_ID);
}
async function verifyFirebaseToken(token, projectId) {
  const parts=token.split('.');if(parts.length!==3)throw httpError(401,'Token inválido.');const header=JSON.parse(base64urlText(parts[0]));const payload=JSON.parse(base64urlText(parts[1]));if(header.alg!=='RS256'||!header.kid)throw httpError(401,'Token inválido.');const keys=await getFirebaseJwks();const jwk=keys.find(k=>k.kid===header.kid);if(!jwk)throw httpError(401,'Chave de autenticação inválida.');const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);const valid=await crypto.subtle.verify({name:'RSASSA-PKCS1-v1_5'},key,base64urlBytes(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));if(!valid)throw httpError(401,'Assinatura inválida.');const now=Math.floor(Date.now()/1000);if(payload.aud!==projectId||payload.iss!==`https://securetoken.google.com/${projectId}`||!payload.sub||payload.exp<=now||payload.iat>now+60)throw httpError(401,'Token expirado ou inválido.');return {uid:payload.sub,email:payload.email||'',email_verified:Boolean(payload.email_verified),name:payload.name||''};
}
async function getFirebaseJwks(){if(jwksCache.expires>Date.now()&&jwksCache.keys.length)return jwksCache.keys;const r=await fetch(FIREBASE_JWKS);if(!r.ok)throw httpError(503,'Serviço de autenticação indisponível.');const body=await r.json();const maxAge=Number((r.headers.get('cache-control')||'').match(/max-age=(\d+)/)?.[1]||3600);jwksCache={keys:body.keys||[],expires:Date.now()+maxAge*1000};return jwksCache.keys;}

async function getGoogleAccessToken(env){if(googleTokenCache.token&&googleTokenCache.expires>Date.now()+60000)return googleTokenCache.token;if(!env.FIREBASE_SERVICE_ACCOUNT_EMAIL||!env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY)throw httpError(503,'Service Account do Firebase ainda não foi configurada no Worker.');const now=Math.floor(Date.now()/1000);const header=b64urlJson({alg:'RS256',typ:'JWT'});const claims=b64urlJson({iss:env.FIREBASE_SERVICE_ACCOUNT_EMAIL,scope:'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});const input=`${header}.${claims}`;const key=await importPrivateKey(env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY);const sig=await crypto.subtle.sign({name:'RSASSA-PKCS1-v1_5'},key,new TextEncoder().encode(input));const assertion=`${input}.${b64url(new Uint8Array(sig))}`;const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion});const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const data=await r.json();if(!r.ok)throw httpError(503,`Não foi possível autenticar a API do Firebase: ${data.error_description||data.error||'erro'}`);googleTokenCache={token:data.access_token,expires:Date.now()+Number(data.expires_in||3600)*1000};return data.access_token;}
async function importPrivateKey(pem){const clean=String(pem).replace(/\\n/g,'\n').replace(/-----BEGIN PRIVATE KEY-----/,'').replace(/-----END PRIVATE KEY-----/,'').replace(/\s/g,'');const bytes=Uint8Array.from(atob(clean),c=>c.charCodeAt(0));return crypto.subtle.importKey('pkcs8',bytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);}

function fsBase(env){return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)`;}
async function fsRequest(env,path,options={}){const token=await getGoogleAccessToken(env);const headers=new Headers(options.headers||{});headers.set('Authorization',`Bearer ${token}`);if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');const r=await fetch(`${fsBase(env)}${path}`,{...options,headers});if(r.status===404)return null;const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok){const conflict=r.status===409||data?.error?.status==='ALREADY_EXISTS';throw httpError(conflict?409:500,`Firestore: ${data?.error?.message||r.statusText}`);}return data;}
async function fsGet(env,collection,docId){const d=await fsRequest(env,`/documents/${encPath(collection)}/${encodeURIComponent(docId)}`);return d?fromDoc(d):null;}
async function fsGetRequired(env,c,idValue,message){const d=await fsGet(env,c,idValue);if(!d)throw httpError(404,message);return d;}
async function fsPut(env,collection,docId,obj){const d=await fsRequest(env,`/documents/${encPath(collection)}/${encodeURIComponent(docId)}`,{method:'PATCH',body:JSON.stringify({fields:toFields({...obj,id:obj.id||docId})})});return fromDoc(d);}
async function fsDelete(env,collection,docId){await fsRequest(env,`/documents/${encPath(collection)}/${encodeURIComponent(docId)}`,{method:'DELETE'});}
async function fsBatchPut(env,docs){
  if(!docs.length)return;
  const project=encodeURIComponent(env.FIREBASE_PROJECT_ID);
  const prefix=`projects/${project}/databases/(default)/documents/`;
  for(let index=0;index<docs.length;index+=450){
    const writes=docs.slice(index,index+450).map(d=>({update:{name:`${prefix}${encPath(d.collection)}/${encodeURIComponent(d.id)}`,fields:toFields({...d.data,id:d.data.id||d.id})}}));
    await fsRequest(env,'/documents:commit',{method:'POST',body:JSON.stringify({writes})});
  }
}
async function fsBatchDelete(env,docs){
  if(!docs.length)return;
  const project=encodeURIComponent(env.FIREBASE_PROJECT_ID);
  const prefix=`projects/${project}/databases/(default)/documents/`;
  for(let index=0;index<docs.length;index+=450){
    const writes=docs.slice(index,index+450).map(d=>({delete:`${prefix}${encPath(d.collection)}/${encodeURIComponent(d.id)}`}));
    await fsRequest(env,'/documents:commit',{method:'POST',body:JSON.stringify({writes})});
  }
}
async function fsCommit(env,operations){
  if(!operations.length)return;
  const project=encodeURIComponent(env.FIREBASE_PROJECT_ID);
  const prefix=`projects/${project}/databases/(default)/documents/`;
  const writes=operations.map(operation=>{
    if(operation.update){
      const item=operation.update;
      const write={update:{name:`${prefix}${encPath(item.collection)}/${encodeURIComponent(item.id)}`,fields:toFields({...item.data,id:item.data.id||item.id})}};
      if(item.createOnly)write.currentDocument={exists:false};
      return write;
    }
    if(operation.delete){
      const item=operation.delete;
      return {delete:`${prefix}${encPath(item.collection)}/${encodeURIComponent(item.id)}`};
    }
    throw httpError(500,'Operação Firestore inválida.');
  });
  await fsRequest(env,'/documents:commit',{method:'POST',body:JSON.stringify({writes})});
}
async function fsWhere(env,collection,field,value,limit=100){const body={structuredQuery:{from:[{collectionId:collection}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:toValue(value)}},limit}};const rows=await fsRequest(env,'/documents:runQuery',{method:'POST',body:JSON.stringify(body)});return (Array.isArray(rows)?rows:[]).filter(x=>x.document).map(x=>fromDoc(x.document));}

async function fsListCollection(env, collection, maxItems = 5000) {
  const items = [];
  let pageToken = '';

  while (items.length < maxItems) {
    const pageSize = Math.min(500, maxItems - items.length);
    const query = new URLSearchParams({ pageSize: String(pageSize) });
    if (pageToken) query.set('pageToken', pageToken);

    const result = await fsRequest(
      env,
      `/documents/${encPath(collection)}?${query.toString()}`
    );

    for (const document of (result?.documents || [])) {
      items.push(fromDoc(document));
      if (items.length >= maxItems) break;
    }

    pageToken = result?.nextPageToken || '';
    if (!pageToken) break;
  }

  return items;
}
function fromDoc(doc){const obj=fromFields(doc.fields||{});obj.id=obj.id||decodeURIComponent(doc.name.split('/').pop());return obj;}
function toFields(obj){return Object.fromEntries(Object.entries(obj).filter(([,v])=>v!==undefined).map(([k,v])=>[k,toValue(v)]));}
function toValue(v){if(v===null)return{nullValue:null};if(typeof v==='string')return{stringValue:v};if(typeof v==='boolean')return{booleanValue:v};if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};if(Array.isArray(v))return{arrayValue:{values:v.map(toValue)}};if(typeof v==='object')return{mapValue:{fields:toFields(v)}};return{stringValue:String(v)};}
function fromFields(fields){return Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,fromValue(v)]));}
function fromValue(v){if('stringValue'in v)return v.stringValue;if('booleanValue'in v)return v.booleanValue;if('integerValue'in v)return Number(v.integerValue);if('doubleValue'in v)return Number(v.doubleValue);if('nullValue'in v)return null;if('timestampValue'in v)return v.timestampValue;if('arrayValue'in v)return (v.arrayValue.values||[]).map(fromValue);if('mapValue'in v)return fromFields(v.mapValue.fields||{});return null;}

function allowedOrigins(env){
  return String(env.ALLOWED_ORIGINS || env.APP_ORIGIN || '')
    .split(',').map(v => v.trim()).filter(Boolean);
}
function isAllowedOrigin(origin, env){
  return !origin || allowedOrigins(env).includes(origin);
}
function withCors(response, request, env){
  const origin = request.headers.get('Origin') || '';
  if(!origin || !isAllowedOrigin(origin, env)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Expose-Headers', 'Content-Type, Content-Disposition');
  headers.append('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function corsPreflight(request, env, requestOrigin=''){
  const origin = request.headers.get('Origin') || '';
  if(origin && origin !== requestOrigin && !isAllowedOrigin(origin, env)) return new Response(null, { status: 403 });
  const headers = new Headers();
  if(origin) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-File-Name, X-Uorqui-Company');
  headers.set('Access-Control-Max-Age', '86400');
  headers.append('Vary', 'Origin');
  return new Response(null, { status: 204, headers });
}
function jsonWithCors(body,status,request,env){ return withCors(json(body,status),request,env); }

function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
async function readJson(request){try{return await request.json()}catch{throw httpError(400,'JSON inválido.')}}
function httpError(status,message){const e=new Error(message);e.status=status;return e;}
function id(){return crypto.randomUUID().replace(/-/g,'');}
function nowIso(){return new Date().toISOString();}
function normalizeEmail(v){return String(v).trim().toLowerCase();}
function isEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
function clean(v,max=5000){return String(v??'').trim().slice(0,max);}
function onlyDigits(v){return String(v??'').replace(/\D/g,'');}
function formatCnpj(v){const d=onlyDigits(v).slice(0,14);return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');}
function isValidCnpj(v){
  const digits=onlyDigits(v);
  if(digits.length!==14||/^(\d)\1{13}$/.test(digits))return false;
  const check=(base,weights)=>{
    const sum=base.split('').reduce((total,digit,index)=>total+Number(digit)*weights[index],0);
    const remainder=sum%11;
    return remainder<2?0:11-remainder;
  };
  const first=check(digits.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]);
  const second=check(digits.slice(0,12)+first,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return digits.endsWith(`${first}${second}`);
}
function slugify(v){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70);}
function isExpired(iso){return !iso||new Date(iso).getTime()<Date.now();}
function byCreatedDesc(a,b){return new Date(b.createdAt||0)-new Date(a.createdAt||0);}
function randomToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));return b64url(bytes);}
async function sha256(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function b64urlJson(obj){return b64url(new TextEncoder().encode(JSON.stringify(obj)));}
function b64url(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function base64urlBytes(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
function base64urlText(s){return new TextDecoder().decode(base64urlBytes(s));}
function encPath(p){return p.split('/').map(encodeURIComponent).join('/');}
function htmlEscape(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
