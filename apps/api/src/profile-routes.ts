import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq, ilike, or } from 'drizzle-orm';
import { createDatabase, getPool } from './db/client.js';
import { profiles, users } from './db/schema.js';

type SessionReader = (request: FastifyRequest) => Promise<{ user: { id: string } } | null>;

const forbiddenHandles = new Set(['admin', 'support', 'uorqui', 'system', 'moderator', 'root', 'api', 'auth', 'settings', 'help', 'privacy']);
const profileFields = {
  id: users.id, handle: users.handle, displayName: profiles.displayName,
  bio: profiles.bio, avatarUrl: profiles.avatarUrl, coverUrl: profiles.coverUrl,
  isPublic: profiles.isPublic, createdAt: users.createdAt,
};

const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const mediaPath = new RegExp('^/media/profile/(' + UUID_RE + ')/(avatar|cover)/(' + UUID_RE + ')\\.(webp|jpg|png)$');

function sanitizedImageUrl(value: unknown, ownerId: string, kind: 'avatar' | 'cover'): string | null | undefined {
  if (value === undefined || value === null || value === '') return value === undefined ? undefined : null;
  if (typeof value !== 'string' || value.length > 2000) throw new Error('INVALID_IMAGE_URL');
  const match = mediaPath.exec(value);
  if (match) {
    if (match[1] !== ownerId || match[2] !== kind) throw new Error('INVALID_IMAGE_URL');
    return value;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) throw new Error();
    return parsed.toString();
  } catch { throw new Error('INVALID_IMAGE_URL'); }
}

/** Profile-only endpoints. No public API ever returns email, sessions or private details. */
export function registerProfileRoutes(app: FastifyInstance, readSession: SessionReader) {
  app.get('/api/v1/profiles/search', {
    schema: {
      querystring: {
        type: 'object', additionalProperties: false,
        required: ['q'],
        properties: { q: { type: 'string', minLength: 2, maxLength: 40 } },
      },
    },
  }, async (request, reply) => {
    const { q } = request.query as { q: string };
    const search = q.trim().replace(/^@/, '');
    if (search.length < 2) return reply.status(400).send({ error: 'Search term is too short' });
    // Escape LIKE wildcard characters so search input cannot expand to an unbounded match.
    const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
    try {
      const session = await readSession(request);
      const matches = await createDatabase()
        .select({ id: users.id, handle: users.handle, displayName: profiles.displayName, avatarUrl: profiles.avatarUrl })
        .from(users).innerJoin(profiles, eq(users.id, profiles.userId))
        .where(and(eq(profiles.isPublic, true),
          or(ilike(users.handle, pattern), ilike(profiles.displayName, pattern))))
        .orderBy(users.handle).limit(15);
      const excluded = new Set<string>();
      if (session) {
        const blocked = await getPool().query(
          'SELECT CASE WHEN blocker_id=$1 THEN blocked_id ELSE blocker_id END AS user_id FROM user_blocks WHERE blocker_id=$1 OR blocked_id=$1',
          [session.user.id],
        );
        for (const row of blocked.rows) excluded.add(row.user_id as string);
      }
      return reply.header('Cache-Control', 'no-store').send({
        results: matches.filter(person => !excluded.has(person.id)).map(({ id: _id, ...person }) => person),
      });
    } catch (error) {
      request.log.error({ err: error }, 'Profile search failed');
      return reply.status(503).send({ error: 'Service unavailable' });
    }
  });

  app.get('/api/v1/profiles/:handle', {
    schema: {
      params: {
        type: 'object', additionalProperties: false,
        required: ['handle'],
        properties: { handle: { type: 'string', pattern: '^@?[a-zA-Z][a-zA-Z0-9_]{2,31}$' } },
      },
    },
  }, async (request, reply) => {
    const { handle } = request.params as { handle: string };
    try {
      const [record] = await createDatabase()
        .select(profileFields).from(users)
        .innerJoin(profiles, eq(users.id, profiles.userId))
        .where(eq(users.handle, handle.replace(/^@/, '').toLowerCase()))
        .limit(1);
      if (!record) return reply.status(404).send({ error: 'Profile not found' });
      // A block always overrides public visibility, profile URLs and friendship.
      const requester = await readSession(request);
      if (requester && requester.user.id !== record.id) {
        const blocked = await getPool().query(
          'SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',
          [requester.user.id,record.id]);
        if (blocked.rowCount) return reply.status(404).send({ error: 'Profile not found' });
      }
      const audience=requester?.user.id??null;
      const counts=await getPool().query(
        'SELECT (SELECT COUNT(*)::int FROM feed_follows WHERE followed_id=$1) AS "followersCount", '+
        '(SELECT COUNT(*)::int FROM feed_follows WHERE follower_id=$1) AS "followingCount", '+
        'EXISTS(SELECT 1 FROM feed_follows WHERE followed_id=$1 AND follower_id=$2::uuid) AS following',
        [record.id,audience]
      );
      const { isPublic: _visibility, ...publicData } = record;
      const isPrivate=!record.isPublic;
      let canViewDetails=!isPrivate || audience===record.id;
      if(isPrivate && audience && audience!==record.id){
        const friend=await getPool().query(
          "SELECT 1 FROM user_friendships WHERE user_a_id=LEAST($1::uuid,$2::uuid) " +
          "AND user_b_id=GREATEST($1::uuid,$2::uuid) AND status='accepted'",[record.id,audience]);
        canViewDetails=!!friend.rowCount;
      }
      // Private profiles expose their totals, never the identity of followed accounts
      // or private photos/bio to strangers. Blocks still return 404 above.
      const safeProfile=canViewDetails?publicData:{
        ...publicData, bio:null, avatarUrl:null, coverUrl:null, createdAt:null,
      };
      return reply.header('Cache-Control','no-store').send({profile:{
        ...safeProfile,isPrivate,following:!!counts.rows[0]?.following,
        mine:audience===record.id,followersCount:counts.rows[0]?.followersCount??0,
        followingCount:counts.rows[0]?.followingCount??0,
      }});
    } catch (error) {
      request.log.error({ err: error }, 'Get public profile failed');
      return reply.status(503).send({ error: 'Service unavailable' });
    }
  });

  app.get('/api/v1/profiles/:handle/follows/:kind', {
    schema:{
      params:{type:'object',additionalProperties:false,required:['handle','kind'],properties:{
        handle:{type:'string',pattern:'^@?[a-zA-Z][a-zA-Z0-9_]{2,31}
    schema: { params: {
      type: 'object', additionalProperties: false,
      required: ['userId', 'kind', 'asset'],
      properties: {
        userId: { type: 'string', format: 'uuid' },
        kind: { type: 'string', enum: ['avatar', 'cover'] },
        asset: { type: 'string', pattern: '^' + UUID_RE + '\\.(webp|jpg|png)$' },
      },
    } },
  }, async (request, reply) => {
    const { userId, kind, asset } = request.params as { userId: string; kind: 'avatar' | 'cover'; asset: string };
    const expected = '/media/profile/' + userId + '/' + kind + '/' + asset;
    try {
      const [record] = await createDatabase().select({
        isPublic: profiles.isPublic, avatarUrl: profiles.avatarUrl, coverUrl: profiles.coverUrl,
      }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
      if (!record || (kind === 'avatar' ? record.avatarUrl : record.coverUrl) !== expected) {
        return reply.status(404).send({ allowed: false });
      }
      const requester = await readSession(request);
      // Even images of publicly visible profiles are restricted after blocking.
      if (requester && requester.user.id !== userId) {
        const blocked = await getPool().query(
          'SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',
          [requester.user.id,userId]);
        if (blocked.rowCount) return reply.status(404).send({ allowed: false });
      }
      if (!record.isPublic) {
        const session = requester;
        if (!session) return reply.status(404).send({ allowed: false });
        if (session.user.id !== userId) {
          const friendship = await getPool().query(
            "SELECT 1 FROM user_friendships WHERE user_a_id=LEAST($1::uuid,$2::uuid) " +
            "AND user_b_id=GREATEST($1::uuid,$2::uuid) AND status='accepted'",
            [session.user.id,userId],
          );
          if (!friendship.rowCount) return reply.status(404).send({ allowed: false });
        }
      }
      return reply.header('Cache-Control', 'no-store').send({ allowed: true });
    } catch (error) {
      request.log.error({ err: error }, 'Media access validation failed');
      return reply.status(503).send({ allowed: false });
    }
  });

  app.patch('/api/v1/me/profile', {
    schema: {
      body: {
        type: 'object', additionalProperties: false, minProperties: 1,
        properties: {
          handle: { type: 'string', pattern: '^[a-z][a-z0-9_]{2,31}$', maxLength: 32 },
          displayName: { type: 'string', minLength: 2, maxLength: 120 },
          bio: { anyOf: [{ type: 'string', maxLength: 500 }, { type: 'null' }] },
          avatarUrl: { anyOf: [{ type: 'string', maxLength: 2000 }, { type: 'null' }] },
          coverUrl: { anyOf: [{ type: 'string', maxLength: 2000 }, { type: 'null' }] },
          isPublic: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    let session: Awaited<ReturnType<SessionReader>>;
    try { session = await readSession(request); }
    catch (error) {
      request.log.error({ err: error }, 'Profile session validation failed');
      return reply.status(503).send({ error: 'Service unavailable' });
    }
    if (!session) return reply.status(401).send({ error: 'Unauthorized' });

    const body = request.body as {
      handle?: string; displayName?: string; bio?: string | null;
      avatarUrl?: string | null; coverUrl?: string | null; isPublic?: boolean;
    };
    if (body.handle && forbiddenHandles.has(body.handle)) return reply.status(400).send({ error: 'Handle unavailable' });
    const displayName = body.displayName?.trim();
    if (displayName !== undefined && displayName.length < 2) return reply.status(400).send({ error: 'Invalid display name' });
    const bio = body.bio === undefined ? undefined : body.bio?.trim() || null;
    let avatarUrl: string | null | undefined;
    let coverUrl: string | null | undefined;
    try {
      avatarUrl = sanitizedImageUrl(body.avatarUrl, session.user.id, 'avatar');
      coverUrl = sanitizedImageUrl(body.coverUrl, session.user.id, 'cover');
    } catch {
      return reply.status(400).send({ error: 'Image URL must be a valid HTTPS address' });
    }

    try {
      const record = await createDatabase().transaction(async (tx) => {
        const [owner] = await tx.select({ id: users.id })
          .from(users).where(eq(users.id, session.user.id)).limit(1);
        if (!owner) return null;
        if (body.handle !== undefined) {
          await tx.update(users).set({ handle: body.handle }).where(eq(users.id, session.user.id));
        }
        const changes = {
          ...(displayName !== undefined ? { displayName } : {}),
          ...(body.bio !== undefined ? { bio } : {}),
          ...(body.avatarUrl !== undefined ? { avatarUrl } : {}),
          ...(body.coverUrl !== undefined ? { coverUrl } : {}),
          ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
          updatedAt: new Date(),
        };
        await tx.update(profiles).set(changes).where(eq(profiles.userId, session.user.id));
        const [updated] = await tx.select(profileFields)
          .from(users).innerJoin(profiles, eq(users.id, profiles.userId))
          .where(eq(users.id, session.user.id)).limit(1);
        return updated ?? null;
      });
      if (!record) return reply.status(404).send({ error: 'Profile not found' });
      return reply.header('Cache-Control', 'no-store').send({
        profile: {
          handle: record.handle, displayName: record.displayName, bio: record.bio,
          avatarUrl: record.avatarUrl, coverUrl: record.coverUrl, isPublic: record.isPublic,
        },
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        return reply.status(409).send({ error: 'Handle unavailable' });
      }
      request.log.error({ err: error }, 'Update profile failed');
      return reply.status(503).send({ error: 'Service unavailable' });
    }
  });
}
},
        kind:{type:'string',enum:['followers','following']}
      }},
      querystring:{type:'object',additionalProperties:false,properties:{
        offset:{type:'integer',minimum:0,maximum:1000}
      }}
    }
  },async(request,reply)=>{
    const {handle,kind}=request.params as {handle:string;kind:'followers'|'following'};
    const {offset=0}=request.query as {offset?:number};
    try{
      const requester=await readSession(request);
      const result=await getPool().query(
        'SELECT u.id,p.is_public FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.handle=$1',
        [handle.replace(/^@/,'').toLowerCase()]
      );
      const target=result.rows[0] as {id:string;is_public:boolean}|undefined;
      if(!target)return reply.code(404).send({error:'Profile unavailable'});
      if(requester){
        const blocked=await getPool().query(
          'SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',
          [requester.user.id,target.id]
        );
        if(blocked.rowCount)return reply.code(404).send({error:'Profile unavailable'});
      }
      // Private-account relationship identities must not be enumerable even by friends.
      if(!target.is_public)return reply.code(403).send({error:'PRIVATE_FOLLOW_LIST'});
      const role=kind==='followers'?'follower_id':'followed_id';
      const match=kind==='followers'?'followed_id':'follower_id';
      const me=requester?.user.id??null;
      const people=await getPool().query(
        'SELECT u.handle,p.display_name AS "displayName",p.avatar_url AS "avatarUrl" '+
        'FROM feed_follows f JOIN users u ON u.id=f.'+role+' JOIN profiles p ON p.user_id=u.id '+
        'WHERE f.'+match+'=$1 AND p.is_public=true '+
        'AND ($2::uuid IS NULL OR NOT EXISTS (SELECT 1 FROM user_blocks b WHERE '+
        '(b.blocker_id=$2::uuid AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$2::uuid))) '+
        'ORDER BY f.created_at DESC,f.'+role+' DESC LIMIT 21 OFFSET $3',
        [target.id,me,offset]
      );
      return reply.header('Cache-Control','no-store').send({
        users:people.rows.slice(0,20),nextOffset:people.rows.length>20?offset+20:null,
      });
    }catch(error){
      request.log.error({err:error},'List profile follows failed');
      return reply.code(503).send({error:'Service unavailable'});
    }
  });

  app.get('/api/v1/media/access/:userId/:kind/:asset', {
    schema: { params: {
      type: 'object', additionalProperties: false,
      required: ['userId', 'kind', 'asset'],
      properties: {
        userId: { type: 'string', format: 'uuid' },
        kind: { type: 'string', enum: ['avatar', 'cover'] },
        asset: { type: 'string', pattern: '^' + UUID_RE + '\\.(webp|jpg|png)$' },
      },
    } },
  }, async (request, reply) => {
    const { userId, kind, asset } = request.params as { userId: string; kind: 'avatar' | 'cover'; asset: string };
    const expected = '/media/profile/' + userId + '/' + kind + '/' + asset;
    try {
      const [record] = await createDatabase().select({
        isPublic: profiles.isPublic, avatarUrl: profiles.avatarUrl, coverUrl: profiles.coverUrl,
      }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
      if (!record || (kind === 'avatar' ? record.avatarUrl : record.coverUrl) !== expected) {
        return reply.status(404).send({ allowed: false });
      }
      const requester = await readSession(request);
      // Even images of publicly visible profiles are restricted after blocking.
      if (requester && requester.user.id !== userId) {
        const blocked = await getPool().query(
          'SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',
          [requester.user.id,userId]);
        if (blocked.rowCount) return reply.status(404).send({ allowed: false });
      }
      if (!record.isPublic) {
        const session = requester;
        if (!session) return reply.status(404).send({ allowed: false });
        if (session.user.id !== userId) {
          const friendship = await getPool().query(
            "SELECT 1 FROM user_friendships WHERE user_a_id=LEAST($1::uuid,$2::uuid) " +
            "AND user_b_id=GREATEST($1::uuid,$2::uuid) AND status='accepted'",
            [session.user.id,userId],
          );
          if (!friendship.rowCount) return reply.status(404).send({ allowed: false });
        }
      }
      return reply.header('Cache-Control', 'no-store').send({ allowed: true });
    } catch (error) {
      request.log.error({ err: error }, 'Media access validation failed');
      return reply.status(503).send({ allowed: false });
    }
  });

  app.patch('/api/v1/me/profile', {
    schema: {
      body: {
        type: 'object', additionalProperties: false, minProperties: 1,
        properties: {
          handle: { type: 'string', pattern: '^[a-z][a-z0-9_]{2,31}$', maxLength: 32 },
          displayName: { type: 'string', minLength: 2, maxLength: 120 },
          bio: { anyOf: [{ type: 'string', maxLength: 500 }, { type: 'null' }] },
          avatarUrl: { anyOf: [{ type: 'string', maxLength: 2000 }, { type: 'null' }] },
          coverUrl: { anyOf: [{ type: 'string', maxLength: 2000 }, { type: 'null' }] },
          isPublic: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    let session: Awaited<ReturnType<SessionReader>>;
    try { session = await readSession(request); }
    catch (error) {
      request.log.error({ err: error }, 'Profile session validation failed');
      return reply.status(503).send({ error: 'Service unavailable' });
    }
    if (!session) return reply.status(401).send({ error: 'Unauthorized' });

    const body = request.body as {
      handle?: string; displayName?: string; bio?: string | null;
      avatarUrl?: string | null; coverUrl?: string | null; isPublic?: boolean;
    };
    if (body.handle && forbiddenHandles.has(body.handle)) return reply.status(400).send({ error: 'Handle unavailable' });
    const displayName = body.displayName?.trim();
    if (displayName !== undefined && displayName.length < 2) return reply.status(400).send({ error: 'Invalid display name' });
    const bio = body.bio === undefined ? undefined : body.bio?.trim() || null;
    let avatarUrl: string | null | undefined;
    let coverUrl: string | null | undefined;
    try {
      avatarUrl = sanitizedImageUrl(body.avatarUrl, session.user.id, 'avatar');
      coverUrl = sanitizedImageUrl(body.coverUrl, session.user.id, 'cover');
    } catch {
      return reply.status(400).send({ error: 'Image URL must be a valid HTTPS address' });
    }

    try {
      const record = await createDatabase().transaction(async (tx) => {
        const [owner] = await tx.select({ id: users.id })
          .from(users).where(eq(users.id, session.user.id)).limit(1);
        if (!owner) return null;
        if (body.handle !== undefined) {
          await tx.update(users).set({ handle: body.handle }).where(eq(users.id, session.user.id));
        }
        const changes = {
          ...(displayName !== undefined ? { displayName } : {}),
          ...(body.bio !== undefined ? { bio } : {}),
          ...(body.avatarUrl !== undefined ? { avatarUrl } : {}),
          ...(body.coverUrl !== undefined ? { coverUrl } : {}),
          ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
          updatedAt: new Date(),
        };
        await tx.update(profiles).set(changes).where(eq(profiles.userId, session.user.id));
        const [updated] = await tx.select(profileFields)
          .from(users).innerJoin(profiles, eq(users.id, profiles.userId))
          .where(eq(users.id, session.user.id)).limit(1);
        return updated ?? null;
      });
      if (!record) return reply.status(404).send({ error: 'Profile not found' });
      return reply.header('Cache-Control', 'no-store').send({
        profile: {
          handle: record.handle, displayName: record.displayName, bio: record.bio,
          avatarUrl: record.avatarUrl, coverUrl: record.coverUrl, isPublic: record.isPublic,
        },
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        return reply.status(409).send({ error: 'Handle unavailable' });
      }
      request.log.error({ err: error }, 'Update profile failed');
      return reply.status(503).send({ error: 'Service unavailable' });
    }
  });
}
