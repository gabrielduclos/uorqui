const FIREBASE_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let jwksCache = { expires: 0, keys: [] };
let googleTokenCache = { expires: 0, token: '' };

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

  if (method === 'GET' && path === '/bootstrap') return json(await bootstrap(env, identity, url.searchParams.get('companyId')));
  if (method === 'GET' && path === '/superadmin/overview') {
    return json(await getSuperadminOverview(env, identity));
  }
  if (method === 'PATCH' && /^\/superadmin\/companies\/[^/]+\/premium$/.test(path)) {
    const companyId = decodeURIComponent(path.split('/')[3]);
    return json(await updateSuperadminPremium(env, identity, companyId, await readJson(request)));
  }
  if (method === 'GET' && path === '/companies/summary') return json(await getCompaniesSummary(env, identity));
  if (method === 'PATCH' && path === '/me') return json(await updateMe(env, identity, await readJson(request)));
  if (method === 'POST' && path === '/push/register') {
    return json(await registerPushToken(env, identity, await readJson(request)), 201);
  }
  if (method === 'DELETE' && path === '/push/register') {
    return json(await unregisterPushToken(env, identity, await readJson(request)));
  }
  if (method === 'POST' && path === '/companies') return json(await createCompany(env, identity, await readJson(request)), 201);
  if (method === 'DELETE' && /^\/companies\/[^/]+$/.test(path)) {
    const companyId = decodeURIComponent(path.split('/')[2]);
    return json(await deleteCompany(env, identity, companyId, await readJson(request)));
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
  if (method === 'POST' && /^\/companies\/[^/]+\/invites$/.test(path)) {
    const companyId = decodeURIComponent(path.split('/')[2]);
    return json(await createCompanyInvite(env, identity, companyId, await readJson(request), env.APP_ORIGIN || url.origin), 201);
  }
  if (method === 'PATCH' && /^\/companies\/[^/]+\/members\/[^/]+$/.test(path)) {
    const parts = path.split('/');
    const companyId = decodeURIComponent(parts[2]);
    const targetUid = decodeURIComponent(parts[4]);
    return json(await updateCompanyMemberRole(env, identity, companyId, targetUid, await readJson(request)));
  }
  if (method === 'POST' && /^\/companies\/[^/]+\/communities$/.test(path)) {
    const companyId = decodeURIComponent(path.split('/')[2]);
    return json(await createCommunity(env, identity, companyId, await readJson(request)), 201);
  }
  if (method === 'POST' && /^\/communities\/[^/]+\/invites$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await createCommunityInvite(env, identity, communityId, await readJson(request)), 201);
  }
  if (method === 'GET' && /^\/communities\/[^/]+\/members$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await getCommunityMembers(env, identity, communityId));
  }
  if (method === 'POST' && /^\/communities\/[^/]+\/members$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await addCommunityMember(env, identity, communityId, await readJson(request)), 201);
  }
  if (method === 'DELETE' && /^\/communities\/[^/]+\/members\/[^/]+$/.test(path)) {
    const parts = path.split('/');
    const communityId = decodeURIComponent(parts[2]);
    const targetUid = decodeURIComponent(parts[4]);
    return json(await removeCommunityMember(env, identity, communityId, targetUid));
  }
  if (method === 'GET' && /^\/communities\/[^/]+\/posts$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await getCommunityPosts(env, identity, communityId));
  }
  if (method === 'DELETE' && /^\/communities\/[^/]+$/.test(path)) {
    const communityId = decodeURIComponent(path.split('/')[2]);
    return json(await deleteCommunity(env, identity, communityId));
  }
  if (method === 'POST' && path === '/invites/accept') return json(await acceptInvite(env, identity, await readJson(request)));
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
    return json(await getComments(env, identity, postId));
  }
  if (method === 'POST' && /^\/posts\/[^/]+\/comments$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await addComment(env, identity, postId, await readJson(request), ctx), 201);
  }
  if (method === 'POST' && /^\/posts\/[^/]+\/reaction$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await toggleReaction(env, identity, postId, ctx));
  }
  if (method === 'POST' && /^\/posts\/[^/]+\/read$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await confirmRead(env, identity, postId));
  }
  if (method === 'POST' && /^\/posts\/[^/]+\/solution$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await acceptSolution(env, identity, postId, await readJson(request)));
  }
  if (method === 'POST' && /^\/posts\/[^/]+\/resolve$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await setPostResolved(env, identity, postId, await readJson(request)));
  }
  if (method === 'POST' && /^\/posts\/[^/]+\/poll-vote$/.test(path)) {
    const postId = decodeURIComponent(path.split('/')[2]);
    return json(await votePoll(env, identity, postId, await readJson(request)));
  }
  if (method === 'GET' && path === '/search') return json(await searchPosts(env, identity, url.searchParams));
  if (method === 'POST' && path === '/media/upload') return json(await uploadMedia(request, env, identity, url.searchParams), 201);
  if (method === 'GET' && /^\/media\/[^/]+$/.test(path)) {
    const mediaId = decodeURIComponent(path.split('/')[2]);
    return await getMedia(env, identity, mediaId);
  }
  if (method === 'POST' && /^\/notifications\/[^/]+\/read$/.test(path)) {
    const notificationId = decodeURIComponent(path.split('/')[2]);
    return json(await markNotificationRead(env, identity, notificationId));
  }
  throw httpError(404, 'Rota não encontrada.');
}

const FREE_PLAN_LIMITS = Object.freeze({ members: 5, communities: 2 });

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
    communities
  };
}

async function assertCommunityCapacity(env, companyId) {
  const company = await fsGetRequired(env, 'companies', companyId, 'Empresa não encontrada.');
  if (hasPremiumAccess(company)) return;
  const communities = await fsWhere(env, 'communities', 'companyId', companyId, 10);
  if (communities.length >= FREE_PLAN_LIMITS.communities) {
    throw httpError(402, 'O plano Free permite até 2 comunidades. Ative o Uorqui Premium para criar mais comunidades.');
  }
}

async function assertMemberCapacity(env, companyId, includePendingInvites = false) {
  const company = await fsGetRequired(env, 'companies', companyId, 'Empresa não encontrada.');
  if (hasPremiumAccess(company)) return;

  const active = (await fsWhere(env, 'companyMembers', 'companyId', companyId, 20))
    .filter(member => member.status === 'active').length;

  let reserved = 0;
  if (includePendingInvites) {
    const pending = await fsWhere(env, 'invites', 'companyId', companyId, 30);
    reserved = pending.filter(invite =>
      invite.type === 'company' &&
      invite.status === 'pending' &&
      !isExpired(invite.expiresAt)
    ).length;
  }

  if (active + reserved >= FREE_PLAN_LIMITS.members) {
    throw httpError(402, 'O plano Free permite até 5 membros na empresa. Ative o Uorqui Premium para aumentar a equipe.');
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
      communities: visibleCommunities
        .map(c => ({
          id: c.id,
          name: c.name,
          description: c.description || '',
          memberCount: Number(counts[c.id] || 0)
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    }));
  }

  companies.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return { companies };
}

async function getSuperadminOverview(env, identity) {
  requireSuperadmin(env, identity);

  const [users, companies, memberships, communities, posts, comments] = await Promise.all([
    fsListCollection(env, 'users', 5000),
    fsListCollection(env, 'companies', 2500),
    fsListCollection(env, 'companyMembers', 10000),
    fsListCollection(env, 'communities', 10000),
    fsListCollection(env, 'posts', 15000),
    fsListCollection(env, 'comments', 20000)
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
      premiumMonthlyPrice: premiumMonthlyPrice(env)
    },
    companies: rows,
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

async function bootstrap(env, identity, requestedCompanyId) {
  const me = await ensureUser(env, identity);
  await exposePendingEmailInvites(env, identity);

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
  const companyCommunities = rawCompanyCommunities.map(c => ({ ...c, memberCount: Number(memberCountByCommunity[c.id] || 0) }));
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

  let allCompanyCommunities = communities;
  let members = [];
  if (selectedCompanyId && canAdmin) {
    allCompanyCommunities = companyCommunities.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
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

async function exposePendingEmailInvites(env, identity) {
  if (!identity.email || !identity.email_verified) return;
  const email = normalizeEmail(identity.email);
  const invites = await fsWhere(env, 'invites', 'email', email, 10);
  for (const invite of invites) {
    if (invite.status !== 'pending' || isExpired(invite.expiresAt)) continue;
    const nid = `invite_${invite.id}_${identity.uid}`;
    const existingNotification = await fsGet(env, 'notifications', nid);
    if (!existingNotification) await fsPut(env, 'notifications', nid, {
      recipientUid: identity.uid,
      type: invite.type === 'company' ? 'company_invite' : 'community_invite',
      title: invite.type === 'company' ? `${invite.companyName} convidou você` : `Convite para ${invite.communityName}`,
      body: invite.type === 'company' ? 'Aceite para entrar no ambiente privado da empresa.' : `Entre na comunidade ${invite.communityName}.`,
      data: { inviteId: invite.id, companyId: invite.companyId, communityId: invite.communityId || '' },
      read: false, status: 'pending', createdAt: invite.createdAt
    });
    if (!invite.targetUid) await fsPut(env, 'invites', invite.id, { ...invite, targetUid: identity.uid, updatedAt: nowIso() });
  }
}

async function createCompany(env, identity, body) {
  const name = clean(body.name, 120);
  if (!name) throw httpError(400, 'Informe o nome da empresa.');
  await ensureUser(env, identity);
  const companyId = id();
  const company = {
    id: companyId,
    name,
    slug: slugify(name),
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
  await fsPut(env, 'companies', companyId, company);
  const creator = await fsGet(env,'users',identity.uid);
  await fsPut(env, 'companyMembers', `${companyId}_${identity.uid}`, {
    id:`${companyId}_${identity.uid}`,
    companyId,
    uid: identity.uid,
    displayName:creator?.displayName||identity.name||'',
    email:normalizeEmail(identity.email||''),
    role:'owner',
    status:'active',
    joinedAt:nowIso()
  });
  // Comunidades agora sao sempre criadas manualmente pelo administrador.
  // Publicacoes para toda a empresa continuam usando scope === 'company'.
  return { company };
}

async function deleteCompany(env, identity, companyId, body) {
  const company = await fsGetRequired(env, 'companies', companyId, 'Empresa não encontrada.');
  const membership = await fsGet(env, 'companyMembers', `${companyId}_${identity.uid}`);
  if (!membership || membership.status !== 'active' || membership.role !== 'owner' || company.ownerUid !== identity.uid) {
    throw httpError(403, 'Somente o proprietário pode excluir esta empresa.');
  }

  const confirmation = clean(body.confirmation || '', 160);
  if (confirmation !== company.name) {
    throw httpError(400, 'Digite exatamente o nome da empresa para confirmar a exclusão.');
  }

  if (company.billingSubscriptionId && env.ASAAS_API_KEY) {
    try {
      await asaasRequest(env, `/subscriptions/${encodeURIComponent(company.billingSubscriptionId)}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'INACTIVE' })
      });
    } catch (error) {
      console.warn('Não foi possível inativar a assinatura Asaas antes de excluir a empresa:', error?.message || error);
    }
  }

  // Remove as publicações da empresa e seus dados vinculados.
  const posts = await fsWhere(env, 'posts', 'companyId', companyId, 500);
  for (const post of posts) {
    const comments = await fsWhere(env, 'comments', 'postId', post.id, 500);
    for (const comment of comments) await fsDelete(env, 'comments', comment.id);

    const reactions = await fsWhere(env, 'reactions', 'postId', post.id, 500);
    for (const reaction of reactions) await fsDelete(env, 'reactions', reaction.id);

    const pollVotes = await fsWhere(env, 'pollVotes', 'postId', post.id, 500);
    for (const vote of pollVotes) await fsDelete(env, 'pollVotes', vote.id);

    const receipts = await fsWhere(env, 'readReceipts', 'postId', post.id, 500);
    for (const receipt of receipts) await fsDelete(env, 'readReceipts', receipt.id);

    for (const attachment of (post.attachments || [])) {
      const media = await fsGet(env, 'media', attachment.id);
      if (!media) continue;
      try { await env.MEDIA.delete(media.key); } catch {}
      try { await fsDelete(env, 'media', media.id); } catch {}
    }

    await fsDelete(env, 'posts', post.id);
  }

  // Limpa uploads ainda não vinculados a publicações.
  const remainingMedia = await fsWhere(env, 'media', 'companyId', companyId, 500);
  for (const media of remainingMedia) {
    try { await env.MEDIA.delete(media.key); } catch {}
    try { await fsDelete(env, 'media', media.id); } catch {}
  }

  const communityMembers = await fsWhere(env, 'communityMembers', 'companyId', companyId, 500);
  for (const item of communityMembers) await fsDelete(env, 'communityMembers', item.id);

  const communities = await fsWhere(env, 'communities', 'companyId', companyId, 250);
  for (const community of communities) await fsDelete(env, 'communities', community.id);

  const invites = await fsWhere(env, 'invites', 'companyId', companyId, 500);
  for (const invite of invites) await fsDelete(env, 'invites', invite.id);

  const companyMembers = await fsWhere(env, 'companyMembers', 'companyId', companyId, 500);
  for (const item of companyMembers) await fsDelete(env, 'companyMembers', item.id);

  // Notificações antigas não devem continuar apontando para uma empresa apagada.
  try {
    const notifications = await fsWhere(env, 'notifications', 'data.companyId', companyId, 500);
    for (const notification of notifications) await fsDelete(env, 'notifications', notification.id);
  } catch {}

  await fsDelete(env, 'companies', companyId);
  return { ok: true, deletedCompanyId: companyId };
}


async function updateCompanyMemberRole(env, identity, companyId, targetUid, body) {
  const actor = await requireCompanyAdmin(env, identity.uid, companyId);
  if (actor.role !== 'owner') throw httpError(403, 'Somente o proprietário pode alterar níveis de acesso.');

  const target = await fsGetRequired(env, 'companyMembers', `${companyId}_${targetUid}`, 'Colaborador não encontrado.');
  if (target.status !== 'active') throw httpError(400, 'Este colaborador não está ativo.');
  if (target.role === 'owner') throw httpError(400, 'O nível do proprietário não pode ser alterado.');

  const role = body.role === 'admin' ? 'admin' : body.role === 'member' ? 'member' : null;
  if (!role) throw httpError(400, 'Escolha Administrador ou Usuário.');

  const updated = { ...target, role, updatedAt: nowIso() };
  await fsPut(env, 'companyMembers', target.id || `${companyId}_${targetUid}`, updated);

  await fsPut(env, 'notifications', `role_${companyId}_${targetUid}_${Date.now()}`, {
    recipientUid: targetUid,
    type: 'role_changed',
    title: 'Seu nível de acesso foi alterado',
    body: role === 'admin' ? 'Você agora é Administrador desta empresa no Uorqui.' : 'Seu nível agora é Usuário.',
    data: { companyId },
    read: false,
    status: 'new',
    createdAt: nowIso()
  });

  return { member: updated };
}

async function createCompanyInvite(env, identity, companyId, body, origin) {
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
  if (invite.targetUid) await createInviteNotification(env, invite, invite.targetUid);
  const inviteUrl = `${origin.replace(/\/$/,'')}/?invite=${encodeURIComponent(token)}`;
  const emailSent = await maybeSendInviteEmail(env, email, company.name, inviteUrl);
  return { inviteId, inviteUrl, emailSent };
}

async function createCommunity(env, identity, companyId, body) {
  await requireCompanyAdmin(env, identity.uid, companyId);
  await assertCommunityCapacity(env, companyId);
  const name=clean(body.name,90), description=clean(body.description||'',280);
  if(!name)throw httpError(400,'Informe o nome da comunidade.');
  const communityId=id(); const community={id:communityId,companyId,name,description,visibility:'invite',isDefault:false,createdBy:identity.uid,createdAt:nowIso()};
  await fsPut(env,'communities',communityId,community);
  await fsPut(env,'communityMembers',`${communityId}_${identity.uid}`,{id:`${communityId}_${identity.uid}`,companyId,communityId,uid:identity.uid,role:'moderator',joinedAt:nowIso()});
  return { community };
}

async function deleteCommunity(env, identity, communityId) {
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
  await requireCompanyAdmin(env, identity.uid, community.companyId);

  const posts = await fsWhere(env, 'posts', 'communityId', communityId, 1);
  if (posts.length) {
    throw httpError(409, 'Esta comunidade possui publicações. Exclua ou mova o conteúdo antes de removê-la.');
  }

  const members = await fsWhere(env, 'communityMembers', 'communityId', communityId, 250);
  for (const member of members) await fsDelete(env, 'communityMembers', member.id);

  const invites = await fsWhere(env, 'invites', 'communityId', communityId, 100);
  for (const invite of invites) {
    if (invite.status === 'pending') await fsDelete(env, 'invites', invite.id);
  }

  await fsDelete(env, 'communities', communityId);
  return { ok: true };
}

async function requireCommunityAccess(env, uid, community) {
  const companyMember = await requireCompanyMember(env, uid, community.companyId);
  if (companyMember.role === 'owner' || companyMember.role === 'admin') return companyMember;
  await requireCommunityMember(env, uid, community.id);
  return companyMember;
}

async function getCommunityMembers(env, identity, communityId) {
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
  await requireCommunityAccess(env, identity.uid, community);

  const docs = await fsWhere(env, 'communityMembers', 'communityId', communityId, 250);
  const members = [];
  for (const membership of docs) {
    const user = await fsGet(env, 'users', membership.uid);
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
  }
  members.sort((a,b) => (a.displayName || a.email).localeCompare(b.displayName || b.email, 'pt-BR'));
  return { community: { ...community, memberCount: members.length }, members, count: members.length };
}

async function addCommunityMember(env, identity, communityId, body) {
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

  await fsPut(env, 'notifications', `community_added_${communityId}_${targetUid}_${Date.now()}`, {
    recipientUid: targetUid,
    type: 'community_added',
    title: `Você foi adicionado a ${community.name}`,
    body: 'Um administrador adicionou você a esta comunidade.',
    data: { companyId: community.companyId, communityId },
    read: false,
    status: 'new',
    createdAt: nowIso()
  });

  return { member: membership };
}

async function removeCommunityMember(env, identity, communityId, targetUid) {
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
  await requireCompanyAdmin(env, identity.uid, community.companyId);

  const memberId = `${communityId}_${targetUid}`;
  const existing = await fsGet(env, 'communityMembers', memberId);
  if (!existing) return { ok: true, alreadyRemoved: true };

  await fsDelete(env, 'communityMembers', memberId);
  await fsPut(env, 'notifications', `community_removed_${communityId}_${targetUid}_${Date.now()}`, {
    recipientUid: targetUid,
    type: 'community_removed',
    title: `Você foi removido de ${community.name}`,
    body: 'Seu acesso a esta comunidade foi removido por um administrador.',
    data: { companyId: community.companyId, communityId },
    read: false,
    status: 'new',
    createdAt: nowIso()
  });

  return { ok: true };
}

async function createCommunityInvite(env, identity, communityId, body) {
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
  await fsPut(env,'invites',inviteId,invite); await createInviteNotification(env,invite,target.uid);
  return { inviteId };
}

async function createInviteNotification(env, invite, uid) {
  await fsPut(env,'notifications',`invite_${invite.id}_${uid}`,{recipientUid:uid,type:invite.type==='company'?'company_invite':'community_invite',title:invite.type==='company'?`${invite.companyName} convidou você`:`Convite para ${invite.communityName}`,body:invite.type==='company'?'Aceite para entrar no ambiente privado da empresa.':`A empresa convidou você para ${invite.communityName}.`,data:{inviteId:invite.id,companyId:invite.companyId,communityId:invite.communityId||''},read:false,status:'pending',createdAt:invite.createdAt});
}

async function acceptInvite(env, identity, body) {
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
    if(invite.targetUid&&invite.targetUid!==identity.uid)throw httpError(403,'Este convite pertence a outro usuário.');
  } else if (invite.email && email && invite.email !== email) {
    throw httpError(403,'Crie ou entre com a conta do e-mail que recebeu o convite.');
  }
  await ensureUser(env,identity);
  if(invite.type==='company'){
    const existingMember = await fsGet(env,'companyMembers',`${invite.companyId}_${identity.uid}`);
    if(!existingMember || existingMember.status!=='active') await assertMemberCapacity(env, invite.companyId, false);
    const joiningUser=await fsGet(env,'users',identity.uid);
    await fsPut(env,'companyMembers',`${invite.companyId}_${identity.uid}`,{id:`${invite.companyId}_${identity.uid}`,companyId:invite.companyId,uid:identity.uid,displayName:joiningUser?.displayName||identity.name||'',email:normalizeEmail(identity.email||''),role:'member',status:'active',joinedAt:nowIso()});
  } else {
    const member=await fsGet(env,'companyMembers',`${invite.companyId}_${identity.uid}`);if(!member||member.status!=='active')throw httpError(403,'Você precisa fazer parte da empresa antes de entrar na comunidade.');
    await fsPut(env,'communityMembers',`${invite.communityId}_${identity.uid}`,{id:`${invite.communityId}_${identity.uid}`,companyId:invite.companyId,communityId:invite.communityId,uid:identity.uid,role:'member',joinedAt:nowIso()});
  }
  invite.status='accepted';invite.acceptedBy=identity.uid;invite.acceptedAt=nowIso();await fsPut(env,'invites',invite.id,invite);
  const nid=`invite_${invite.id}_${identity.uid}`;const n=await fsGet(env,'notifications',nid);if(n)await fsPut(env,'notifications',nid,{...n,read:true,status:'accepted'});
  return {ok:true,companyId:invite.companyId,communityId:invite.communityId||null};
}

async function getCommunityPosts(env, identity, communityId) {
  const community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
  await requireCommunityAccess(env, identity.uid, community);

  let posts = await fsWhere(env, 'posts', 'communityId', communityId, 120);
  posts = posts.filter(p => p.scope === 'community');

  const reactions = await fsWhere(env, 'reactions', 'uid', identity.uid, 250);
  const likedIds = new Set(reactions.map(r => r.postId));
  const receipts = await fsWhere(env, 'readReceipts', 'uid', identity.uid, 250);
  const readIds = new Set(receipts.map(r => r.postId));
  const pollVotes = await fsWhere(env, 'pollVotes', 'uid', identity.uid, 250);
  const pollVoteMap = new Map(pollVotes.map(vote => [vote.postId, vote.optionId]));

  return {
    community,
    posts: enrichPosts(posts, likedIds, readIds, pollVoteMap).slice(0, 100)
  };
}


async function interestedPostRecipients(env, post, authorUid) {
  if (!post || post.scope === 'world') return [];

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

function deferPushes(ctx, promises) {
  if (!promises?.length) return;
  const task = Promise.allSettled(promises).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(task);
}

async function registerPushToken(env, identity, body) {
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

  const data = {};
  for (const [key, value] of Object.entries({
    notificationId: payload.notificationId || '',
    type: payload.type || '',
    postId: payload.postId || '',
    companyId: payload.companyId || '',
    communityId: payload.communityId || '',
    openComments: payload.openComments || '',
    url: payload.postId
      ? `/?post=${encodeURIComponent(payload.postId)}${payload.companyId ? `&company=${encodeURIComponent(payload.companyId)}` : ''}${payload.openComments ? '&comments=1' : ''}`
      : '/'
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
  let company = null;
  let community = null;

  if (scope !== 'world') {
    if (!companyId) throw httpError(400, 'Empresa obrigatória.');
    await requireCompanyMember(env, identity.uid, companyId);
    company = await fsGet(env, 'companies', companyId);
  }

  if (scope === 'community') {
    if (!communityId) throw httpError(400, 'Escolha a comunidade.');
    community = await fsGetRequired(env, 'communities', communityId, 'Comunidade não encontrada.');
    if (community.companyId !== companyId) throw httpError(400, 'Comunidade inválida.');
    await requireCommunityMember(env, identity.uid, communityId);
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
      ((scope !== 'world') && m.companyId !== companyId) ||
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

  const interestedRecipients = await interestedPostRecipients(env, post, identity.uid);

  if (interestedRecipients.length) {
    const persistent = post.type === 'announcement' && Boolean(post.requiresReadReceipt);
    const notificationType = persistent ? 'read_required' : type === 'announcement' ? 'announcement' : 'new_post';
    const notificationTitle = persistent
      ? 'Confirmação de leitura pendente'
      : type === 'announcement'
        ? post.title || 'Novo comunicado'
        : post.scope === 'community'
          ? `Nova publicação em ${post.communityName || 'uma comunidade'}`
          : `Nova publicação em ${post.companyName || 'sua empresa'}`;

    const notificationBody = persistent
      ? `${post.authorName} publicou um comunicado que precisa da sua confirmação de leitura.`
      : `${post.authorName} publicou ${type === 'poll' ? 'uma enquete' : type === 'event' ? 'um evento' : type === 'question' ? 'uma pergunta' : 'uma nova mensagem'}.`;

    const docs = interestedRecipients.map(uid => ({
      collection: 'notifications',
      id: persistent ? `read_${postId}_${uid}` : `post_${postId}_${uid}`,
      data: {
        recipientUid: uid,
        type: notificationType,
        title: notificationTitle,
        body: notificationBody,
        data: {
          postId,
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
    deferPushes(ctx, docs.map(doc => sendPushToUser(env, doc.data.recipientUid, {
      title: doc.data.title,
      body: doc.data.body,
      notificationId: doc.id,
      type: doc.data.type,
      postId,
      companyId: post.companyId || '',
      communityId: post.communityId || ''
    })));
  }

  return { post };
}

async function cleanupDeletedPost(env, post, keepNotifications) {
  const postId = post.id;
  try {
    const [comments, reactions, pollVotes, receipts, notifications] = await Promise.all([
      fsWhere(env, 'comments', 'postId', postId, 250),
      fsWhere(env, 'reactions', 'postId', postId, 250),
      fsWhere(env, 'pollVotes', 'postId', postId, 250),
      fsWhere(env, 'readReceipts', 'postId', postId, 250),
      fsWhere(env, 'notifications', 'data.postId', postId, 250).catch(() => [])
    ]);

    await fsBatchDelete(env, [
      ...comments.map(item => ({ collection: 'comments', id: item.id })),
      ...reactions.map(item => ({ collection: 'reactions', id: item.id })),
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
    return { ok: true, tombstone: true, post: tombstone };
  }

  await fsDelete(env, 'posts', postId);
  const cleanup = cleanupDeletedPost(env, post, false);
  if (ctx?.waitUntil) ctx.waitUntil(cleanup);
  else await cleanup;
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

async function getComments(env, identity, postId) {
  const [post, commentsResult] = await Promise.all([
    fsGetRequired(env, 'posts', postId, 'Publicação não encontrada.'),
    fsWhere(env, 'comments', 'postId', postId, 100)
  ]);
  await requirePostAccess(env, identity.uid, post);
  const comments = commentsResult.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
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
        communityId: post.communityId || ''
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
      companyId: post.companyId || '',
      communityId: post.communityId || ''
    })]);
  }

  return { comment };
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

  return { liked, reactionCount: post.reactionCount };
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

async function acceptSolution(env, identity, postId, body) {
  const post = await fsGetRequired(env, 'posts', postId, 'Publicação não encontrada.');
  if (post.type !== 'question') throw httpError(400, 'Esta publicação não é uma pergunta.');

  if (post.authorUid !== identity.uid) {
    if (!post.companyId) throw httpError(403, 'Sem permissão.');
    await requireCompanyAdmin(env, identity.uid, post.companyId);
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
  return { ok: true, isResolved: true };
}

async function setPostResolved(env, identity, postId, body) {
  const post = await fsGetRequired(env, 'posts', postId, 'Publicação não encontrada.');
  if (!['post', 'question'].includes(post.type)) {
    throw httpError(400, 'Somente posts e perguntas podem ser marcados como resolvidos.');
  }
  await requirePostAccess(env, identity.uid, post);

  if (post.authorUid !== identity.uid) {
    if (!post.companyId) throw httpError(403, 'Somente o autor pode alterar este status.');
    await requireCompanyAdmin(env, identity.uid, post.companyId);
  }

  const resolved = body.resolved !== false;
  post.isResolved = resolved;
  post.resolvedAt = resolved ? nowIso() : '';
  post.resolvedByUid = resolved ? identity.uid : '';
  if (!resolved && post.type === 'question') post.acceptedCommentId = '';
  post.followUpReminderFor = post.lastCommentAt || post.followUpReminderFor || '';
  post.updatedAt = nowIso();

  await fsPut(env, 'posts', postId, post);
  return { ok: true, isResolved: resolved };
}

async function votePoll(env, identity, postId, body) {
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

  return { ok: true, optionId, pollOptions: options, pollTotalVotes: total };
}

async function searchPosts(env, identity, params) {
  const q = String(params.get('q') || '').trim().toLocaleLowerCase('pt-BR');
  if (q.length < 2) throw httpError(400, 'Digite ao menos 2 caracteres.');

  const companyId = params.get('companyId') || '';
  let posts = [];

  if (companyId) {
    const companyMember = await requireCompanyMember(env, identity.uid, companyId);
    const isAdmin = companyMember.role === 'owner' || companyMember.role === 'admin';
    const cms = await fsWhere(env, 'communityMembers', 'uid', identity.uid, 150);
    const allowed = new Set(cms.filter(m => m.companyId === companyId).map(m => m.communityId));
    const raw = await fsWhere(env, 'posts', 'companyId', companyId, 160);

    posts = raw.filter(post =>
      (
        post.scope === 'company' ||
        (post.scope === 'community' && (isAdmin || allowed.has(post.communityId)))
      ) &&
      `${post.title || ''} ${post.text || ''} ${post.communityName || ''} ${post.eventLocation || ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(q)
    );
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

async function uploadMedia(request, env, identity, params) {
  const scope=params.get('scope');
  if(!['world','company','community','avatar'].includes(scope))throw httpError(400,'Audiência inválida.');
  const companyId=params.get('companyId')||'';const communityId=params.get('communityId')||'';
  if(scope!=='world'&&scope!=='avatar')await requireCompanyMember(env,identity.uid,companyId);
  if(scope==='community')await requireCommunityMember(env,identity.uid,communityId);

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
      : scope==='company'
        ? `companies/${companyId}/general/${identity.uid}/${mediaId}-${safeName}`
        : `companies/${companyId}/communities/${communityId}/${identity.uid}/${mediaId}-${safeName}`;

  await env.MEDIA.put(key,body,{httpMetadata:{contentType},customMetadata:{ownerUid:identity.uid,scope,companyId,communityId,mediaId}});
  const media={id:mediaId,key,ownerUid:identity.uid,scope,companyId,communityId,name,contentType,size:body.byteLength,createdAt:nowIso()};
  await fsPut(env,'media',mediaId,media);
  return {media};
}
async function getMedia(env, identity, mediaId) {
  const media=await fsGetRequired(env,'media',mediaId,'Arquivo não encontrado.');
  if(media.scope==='company')await requireCompanyMember(env,identity.uid,media.companyId);
  else if(media.scope==='community')await requireCommunityMember(env,identity.uid,media.communityId);
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

async function requirePostAccess(env, uid, post) {
  if(post.scope==='world')return true;
  if(post.scope==='company')return requireCompanyMember(env,uid,post.companyId);
  if(post.scope==='community'){
    const companyMember=await requireCompanyMember(env,uid,post.companyId);
    if(companyMember.role==='owner'||companyMember.role==='admin')return companyMember;
    return requireCommunityMember(env,uid,post.communityId);
  }
  throw httpError(403,'Sem permissão.');
}
async function requireCompanyMember(env, uid, companyId) {if(!companyId)throw httpError(400,'Empresa inválida.');const m=await fsGet(env,'companyMembers',`${companyId}_${uid}`);if(!m||m.status!=='active')throw httpError(403,'Você não faz parte desta empresa.');return m;}
async function requireCompanyAdmin(env, uid, companyId) {const m=await requireCompanyMember(env,uid,companyId);if(!['owner','admin'].includes(m.role))throw httpError(403,'Somente administradores podem fazer isso.');return m;}
async function requireCommunityMember(env, uid, communityId) {const m=await fsGet(env,'communityMembers',`${communityId}_${uid}`);if(!m)throw httpError(403,'Você não participa desta comunidade.');return m;}

async function maybeSendInviteEmail(env,email,companyName,inviteUrl){
  if(!env.RESEND_API_KEY||!env.INVITE_FROM_EMAIL)return false;
  try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:env.INVITE_FROM_EMAIL,to:[email],subject:`${companyName} convidou você para o Uorqui`,html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>Você foi convidado para ${htmlEscape(companyName)}</h2><p>Crie ou entre na sua conta Uorqui para acessar o ambiente privado da empresa.</p><p><a href="${htmlEscape(inviteUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px">Aceitar convite</a></p><p style="color:#777;font-size:12px">Este convite expira em 7 dias.</p></div>`})});return r.ok;}catch{return false;}
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
async function fsRequest(env,path,options={}){const token=await getGoogleAccessToken(env);const headers=new Headers(options.headers||{});headers.set('Authorization',`Bearer ${token}`);if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');const r=await fetch(`${fsBase(env)}${path}`,{...options,headers});if(r.status===404)return null;const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!r.ok)throw httpError(500,`Firestore: ${data?.error?.message||r.statusText}`);return data;}
async function fsGet(env,collection,docId){const d=await fsRequest(env,`/documents/${encPath(collection)}/${encodeURIComponent(docId)}`);return d?fromDoc(d):null;}
async function fsGetRequired(env,c,idValue,message){const d=await fsGet(env,c,idValue);if(!d)throw httpError(404,message);return d;}
async function fsPut(env,collection,docId,obj){const d=await fsRequest(env,`/documents/${encPath(collection)}/${encodeURIComponent(docId)}`,{method:'PATCH',body:JSON.stringify({fields:toFields({...obj,id:obj.id||docId})})});return fromDoc(d);}
async function fsDelete(env,collection,docId){await fsRequest(env,`/documents/${encPath(collection)}/${encodeURIComponent(docId)}`,{method:'DELETE'});}
async function fsBatchPut(env,docs){
  if(!docs.length)return;
  const project=encodeURIComponent(env.FIREBASE_PROJECT_ID);
  const prefix=`projects/${project}/databases/(default)/documents/`;
  const writes=docs.slice(0,450).map(d=>({update:{name:`${prefix}${encPath(d.collection)}/${encodeURIComponent(d.id)}`,fields:toFields({...d.data,id:d.data.id||d.id})}}));
  await fsRequest(env,'/documents:commit',{method:'POST',body:JSON.stringify({writes})});
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
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-File-Name');
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
