type BootstrapPayload = {
  isSuperadmin?: boolean;
  me?: { uid?: string; displayName?: string; email?: string; avatarMediaId?: string };
  communities?: Array<Record<string, any>>;
  allCompanyCommunities?: Array<Record<string, any>>;
  communityMap?: Record<string, Record<string, any>>;
};

const upstreamFetch = globalThis.fetch.bind(globalThis);
const officialCommunityIds = new Set<string>();
let superadminUser: BootstrapPayload['me'] | null = null;

function requestUrl(input: RequestInfo | URL) {
  try {
    if (input instanceof Request) return new URL(input.url, location.origin);
    return new URL(String(input), location.origin);
  } catch {
    return null;
  }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  return String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
}

function patchOfficialCommunity(community: Record<string, any> | null | undefined, uid: string) {
  if (!community || community.officialUorqui !== true || !community.id) return community;
  officialCommunityIds.add(String(community.id));
  return {
    ...community,
    // A tela já reconhece o criador como gestor. Para o superadmin esta é uma
    // projeção somente no cliente; o papel persistente continua sendo admin.
    createdBy: uid,
    superadminOfficialAccess: true
  };
}

function jsonResponse(response: Response, payload: unknown) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function patchBootstrap(payload: BootstrapPayload) {
  if (!payload?.isSuperadmin || !payload.me?.uid) return payload;
  const uid = String(payload.me.uid);
  superadminUser = payload.me;

  if (Array.isArray(payload.communities)) {
    payload.communities = payload.communities.map(community => patchOfficialCommunity(community, uid) || community);
  }
  if (Array.isArray(payload.allCompanyCommunities)) {
    payload.allCompanyCommunities = payload.allCompanyCommunities.map(community => patchOfficialCommunity(community, uid) || community);
  }
  if (payload.communityMap && typeof payload.communityMap === 'object') {
    payload.communityMap = Object.fromEntries(
      Object.entries(payload.communityMap).map(([id, community]) => [id, patchOfficialCommunity(community, uid) || community])
    );
  }
  return payload;
}

function patchMemberList(payload: any, communityId: string) {
  if (!superadminUser?.uid || !officialCommunityIds.has(communityId) || !payload || !Array.isArray(payload.members)) return payload;
  const uid = String(superadminUser.uid);
  const index = payload.members.findIndex((member: any) => String(member?.uid || '') === uid);
  const adminMember = {
    ...(index >= 0 ? payload.members[index] : {}),
    uid,
    displayName: (index >= 0 ? payload.members[index]?.displayName : '') || superadminUser.displayName || '',
    email: (index >= 0 ? payload.members[index]?.email : '') || superadminUser.email || '',
    avatarMediaId: (index >= 0 ? payload.members[index]?.avatarMediaId : '') || superadminUser.avatarMediaId || '',
    companyRole: '',
    communityRole: index >= 0 && payload.members[index]?.communityRole === 'owner' ? 'owner' : 'admin'
  };

  if (index >= 0) payload.members[index] = adminMember;
  else payload.members = [adminMember, ...payload.members];
  payload.count = payload.members.length;
  if (payload.community) payload.community.memberCount = payload.members.length;
  return payload;
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const response = await upstreamFetch(input, init);
  const url = requestUrl(input);
  const method = requestMethod(input, init);
  if (!url || method !== 'GET' || !response.ok) return response;

  try {
    if (url.pathname === '/api/bootstrap') {
      const payload = patchBootstrap(await response.clone().json());
      return jsonResponse(response, payload);
    }

    const membersMatch = url.pathname.match(/^\/api\/communities\/([^/]+)\/members$/);
    if (membersMatch) {
      const communityId = decodeURIComponent(membersMatch[1]);
      if (!officialCommunityIds.has(communityId) || !superadminUser?.uid) return response;
      const payload = patchMemberList(await response.clone().json(), communityId);
      return jsonResponse(response, payload);
    }
  } catch (error) {
    console.warn('Uorqui superadmin official community projection failed:', error);
  }

  return response;
};
