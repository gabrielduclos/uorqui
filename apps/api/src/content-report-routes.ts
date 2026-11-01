import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getPool } from './db/client.js';

type SessionReader = (request: FastifyRequest) => Promise<{user:{id:string}} | null>;
type TargetKind = 'post' | 'direct_message' | 'community_message';
type ReportReason = 'spam' | 'harassment' | 'hate' | 'sexual' | 'violence' | 'scam' | 'privacy' | 'other';

const reportBody = {
  type: 'object',
  required: ['targetKind', 'targetId', 'reason'],
  additionalProperties: false,
  properties: {
    targetKind: { type: 'string', enum: ['post', 'direct_message', 'community_message'] },
    targetId: { type: 'string', format: 'uuid' },
    reason: { type: 'string', enum: ['spam', 'harassment', 'hate', 'sexual', 'violence', 'scam', 'privacy', 'other'] },
    details: { type: 'string', maxLength: 1000 },
  },
} as const;
const originValid = (request: FastifyRequest) =>
  request.headers.origin === (process.env.WEB_ORIGIN ?? 'http://localhost:5173');

type Evidence = { author_id: string; body: string; attachment_id?: string | null; media_ids?: string[] };

export function registerContentReportRoutes(app: FastifyInstance, readSession: SessionReader) {
  app.post('/api/v1/reports', { schema: { body: reportBody } }, async (request, reply) => {
    if (!originValid(request)) return reply.code(403).send({ error: 'Invalid origin' });
    try {
      const session = await readSession(request);
      if (!session) return reply.code(401).send({ error: 'Unauthorized' });
      const reporter = session.user.id;
      const user = await getPool().query('SELECT 1 FROM users WHERE id=$1', [reporter]);
      if (!user.rowCount) return reply.code(401).send({ error: 'Unauthorized' });
      const { targetKind, targetId, reason, details } = request.body as {
        targetKind: TargetKind; targetId: string; reason: ReportReason; details?: string;
      };

      // Never trust a target ID submitted by the browser. Re-check the same
      // access rules used for reading each target, and forbid self-reporting.
      let evidence: Evidence | null = null;
      if (targetKind === 'post') {
        const found = await getPool().query(
          "SELECT p.author_id,p.body,COALESCE((SELECT json_agg(m.id) FROM feed_media m WHERE m.post_id=p.id),'[]'::json) AS media_ids " +
          'FROM feed_posts p JOIN profiles prof ON prof.user_id=p.author_id ' +
          'WHERE p.id=$2 AND p.author_id<>$1 AND p.deleted_at IS NULL AND p.published_at IS NOT NULL ' +
          "AND (prof.is_public=true OR EXISTS (SELECT 1 FROM user_friendships f WHERE f.user_a_id=LEAST(p.author_id,$1::uuid) " +
          "AND f.user_b_id=GREATEST(p.author_id,$1::uuid) AND f.status='accepted')) " +
          'AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE ' +
          '(b.blocker_id=$1 AND b.blocked_id=p.author_id) OR (b.blocker_id=p.author_id AND b.blocked_id=$1))',
          [reporter, targetId]);
        evidence = found.rows[0] ?? null;
      } else if (targetKind === 'direct_message') {
        const found = await getPool().query(
          'SELECT m.author_id,m.body,m.attachment_id FROM direct_messages m ' +
          'JOIN direct_conversations c ON c.id=m.conversation_id ' +
          'WHERE m.id=$2 AND m.author_id<>$1 AND m.deleted_at IS NULL ' +
          'AND (c.participant_a_id=$1 OR c.participant_b_id=$1)',
          [reporter, targetId]);
        evidence = found.rows[0] ?? null;
      } else {
        const found = await getPool().query(
          'SELECT m.author_id,m.body,m.attachment_id FROM community_messages m ' +
          'JOIN community_channels ch ON ch.id=m.channel_id AND ch.kind=\'text\' ' +
          'JOIN community_members member ON member.community_id=ch.community_id AND member.user_id=$1 ' +
          'WHERE m.id=$2 AND m.author_id<>$1 AND m.deleted_at IS NULL ' +
          'AND NOT EXISTS (SELECT 1 FROM community_bans ban WHERE ban.community_id=ch.community_id AND ban.user_id=$1)',
          [reporter, targetId]);
        evidence = found.rows[0] ?? null;
      }
      if (!evidence) return reply.code(404).send({ error: 'Content unavailable' });

      const description = details?.trim() || null;
      // Evidence is kept server-side for later moderator review, even when
      // the author edits/deletes the original. No public listing exposes it.
      const snapshot = {
        body: evidence.body,
        attachmentId: evidence.attachment_id ?? null,
        mediaIds: evidence.media_ids ?? [],
      };
      const inserted = await getPool().query(
        'INSERT INTO content_reports (reporter_id,target_kind,target_id,target_author_id,reason,details,evidence) ' +
        'SELECT $1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7::jsonb ' +
        'WHERE (SELECT count(*) FROM content_reports WHERE reporter_id=$1 AND created_at>now()-interval \'24 hours\') < 10 ' +
        'ON CONFLICT (reporter_id,target_kind,target_id) DO NOTHING RETURNING id',
        [reporter, targetKind, targetId, evidence.author_id, reason, description, JSON.stringify(snapshot)]);
      if (!inserted.rowCount) {
        const previous = await getPool().query(
          'SELECT 1 FROM content_reports WHERE reporter_id=$1 AND target_kind=$2 AND target_id=$3',
          [reporter, targetKind, targetId]);
        return reply.code(previous.rowCount ? 409 : 429).send({
          error: previous.rowCount ? 'ALREADY_REPORTED' : 'REPORT_LIMIT_REACHED',
        });
      }
      return reply.code(201).header('Cache-Control', 'private, no-store')
        .send({ id: inserted.rows[0].id, status: 'pending' });
    } catch (error) {
      request.log.error({ err: error }, 'Content report failed');
      return reply.code(503).send({ error: 'REPORTS_UNAVAILABLE' });
    }
  });
}
