import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  check,
  boolean,
  bigserial,
  jsonb,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Database schema shared by authentication, profiles, communities, and direct messages.
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  handle: varchar('handle', { length: 32 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  bio: text('bio'),
  avatarKey: text('avatar_key'),
  avatarUrl: text('avatar_url'),
  coverUrl: text('cover_url'),
  isPublic: boolean('is_public').default(true).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const communityVisibility = pgEnum('community_visibility', [
  'public', 'approval', 'private',
]);

export const communities = pgTable('communities', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  visibility: communityVisibility('visibility').notNull().default('public'),
  description: varchar('description', { length: 500 }),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const memberRole = pgEnum('member_role', [
  'owner', 'admin', 'moderator', 'member',
]);

export const communityMembers = pgTable('community_members', {
  communityId: uuid('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: memberRole('role').notNull().default('member'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.communityId, table.userId] }),
  index('community_members_user_idx').on(table.userId),
]);

export const directConversations = pgTable('direct_conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  participantAId: uuid('participant_a_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  participantBId: uuid('participant_b_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('direct_conversations_pair_idx').on(table.participantAId, table.participantBId),
  check('direct_conversations_distinct_members', sql`${table.participantAId} <> ${table.participantBId}`),
  // Application services must canonicalize participant ordering before insert.
]);

export const directMessages = pgTable('direct_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => directConversations.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  body: text('body').notNull(),
  clientId: uuid('client_id'),
  readAt: timestamp('read_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  forwardedFromId: uuid('forwarded_from_id'),
  replyToId: uuid('reply_to_id').references((): AnyPgColumn => directMessages.id, { onDelete: 'set null' }),
  attachmentId: uuid('attachment_id'),
  attachmentName: varchar('attachment_name', { length: 180 }),
  attachmentType: varchar('attachment_type', { length: 100 }),
  attachmentSize: integer('attachment_size'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('direct_messages_conversation_created_idx').on(table.conversationId, table.createdAt),
  uniqueIndex('direct_messages_client_id_idx').on(table.clientId),
  check('dm_attachment_consistency', sql.raw(
    '((attachment_id IS NULL AND attachment_name IS NULL AND attachment_type IS NULL AND attachment_size IS NULL) OR (attachment_id IS NOT NULL AND attachment_name IS NOT NULL AND attachment_type IS NOT NULL AND attachment_size > 0 AND attachment_size <= 52428800))'
  )),
]);

export const directMessageReactions = pgTable('direct_message_reactions', {
  messageId: uuid('message_id').notNull().references(() => directMessages.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji: varchar('emoji', { length: 16 }).notNull(),
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  readAt: timestamp('read_at', { withTimezone: true }),
}, (table) => [
  primaryKey({ columns: [table.messageId, table.userId] }),
]);
/** One friendship/request per canonical unordered pair. */
export const userFriendships = pgTable('user_friendships', {
  userAId: uuid('user_a_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  userBId: uuid('user_b_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  requestedById: uuid('requested_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 12 }).default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userAId, table.userBId] }),
  index('user_friendships_user_b_idx').on(table.userBId),
  check('user_friendships_canonical', sql`${table.userAId} < ${table.userBId}`),
  check('user_friendships_requester_member', sql`${table.requestedById} = ${table.userAId} OR ${table.requestedById} = ${table.userBId}`),
  check('user_friendships_valid_status', sql`${table.status} IN ('pending', 'accepted', 'declined', 'canceled')`),
]);
/** Directional account blocking: either direction disables messages and friend requests. */
export const userBlocks = pgTable('user_blocks', {
  blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.blockerId, table.blockedId] }),
  index('user_blocks_blocked_idx').on(table.blockedId),
  check('user_blocks_not_self', sql`${table.blockerId} <> ${table.blockedId}`),
]);

/** Hybrid social feed. Posts stay private drafts until all expected media are uploaded. */
export const feedPosts = pgTable('feed_posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull().default(''),
  mediaCount: integer('media_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [
  index('feed_posts_published_idx').on(table.publishedAt, table.id),
  index('feed_posts_author_idx').on(table.authorId),
  check('feed_posts_body_length', sql`length(${table.body}) <= 4000`),
  check('feed_posts_media_count', sql`${table.mediaCount} BETWEEN 0 AND 6`),
]);
export const feedMedia = pgTable('feed_media', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => feedPosts.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  type: varchar('type', { length: 80 }).notNull(),
  size: integer('size').notNull(),
}, table => [
  uniqueIndex('feed_media_post_position_idx').on(table.postId, table.position),
  check('feed_media_position', sql`${table.position} BETWEEN 0 AND 5`),
  check('feed_media_size', sql`${table.size} BETWEEN 1 AND 52428800`),
]);
/** Follow relationships are independent from mutual friendships and chat permissions. */
export const feedFollows = pgTable('feed_follows', {
  followerId: uuid('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followedId: uuid('followed_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.followerId, table.followedId] }),
  index('feed_follows_followed_idx').on(table.followedId),
  check('feed_follows_not_self', sql`${table.followerId} <> ${table.followedId}`),
]);
export const feedLikes = pgTable('feed_likes', {
  postId: uuid('post_id').notNull().references(() => feedPosts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.postId, table.userId] })]);
export const feedComments = pgTable('feed_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  postId: uuid('post_id').notNull().references(() => feedPosts.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedById: uuid('deleted_by_id').references(() => users.id, { onDelete: 'set null' }),
}, table => [
  index('feed_comments_post_created_idx').on(table.postId, table.createdAt),
  check('feed_comments_length', sql`length(${table.body}) BETWEEN 1 AND 1000`),
]);

/** Persistent community channels. Voice membership and RTC will follow separately. */
export const communityChannels = pgTable('community_channels', {
  id: uuid('id').defaultRandom().primaryKey(),
  communityId: uuid('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 64 }).notNull(),
  kind: varchar('kind', { length: 8 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex('community_channels_unique_name').on(table.communityId, table.name),
  index('community_channels_community_idx').on(table.communityId),
  check('community_channels_kind', sql`${table.kind} IN ('text', 'voice')`),
]);

export const communityMessages = pgTable('community_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  channelId: uuid('channel_id').notNull().references(() => communityChannels.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  clientId: uuid('client_id').notNull().unique(),
  body: text('body').notNull(),
  attachmentId: uuid('attachment_id'),
  attachmentName: varchar('attachment_name', { length: 180 }),
  attachmentType: varchar('attachment_type', { length: 100 }),
  attachmentSize: integer('attachment_size'),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedById: uuid('deleted_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index('community_messages_channel_created_idx').on(table.channelId, table.createdAt),
  check('community_messages_length', sql`(length(${table.body}) BETWEEN 1 AND 4000 OR (length(${table.body})=0 AND ${table.attachmentId} IS NOT NULL))`),
  check('community_message_attachment_consistency', sql.raw(
    '((attachment_id IS NULL AND attachment_name IS NULL AND attachment_type IS NULL AND attachment_size IS NULL) OR (attachment_id IS NOT NULL AND attachment_name IS NOT NULL AND attachment_type IS NOT NULL AND attachment_size > 0 AND attachment_size <= 52428800))'
  )),
]);

/** Per-user, per-channel read cursor so unread counts work across devices. */
export const communityChannelReads = pgTable('community_channel_reads', {
  channelId: uuid('channel_id').notNull().references(() => communityChannels.id, {onDelete:'cascade'}),
  userId: uuid('user_id').notNull().references(() => users.id, {onDelete:'cascade'}),
  lastReadAt: timestamp('last_read_at', {withTimezone:true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone:true}).defaultNow().notNull(),
}, table => [
  primaryKey({columns:[table.channelId,table.userId]}),
  index('community_channel_reads_user_idx').on(table.userId),
]);

/** Emoji reactions on community messages: each member can react once per emoji. */
export const communityMessageReactions = pgTable('community_message_reactions', {
  messageId: uuid('message_id').notNull().references(() => communityMessages.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji: varchar('emoji', { length: 16 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.messageId, table.userId, table.emoji] }),
  index('community_message_reactions_user_idx').on(table.userId),
]);

/** Approval requests and invites do not grant access until accepted. */
export const communityJoinRequests = pgTable('community_join_requests', {
  communityId: uuid('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 8 }).notNull(),
  status: varchar('status', { length: 10 }).notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.communityId, table.userId] }),
  index('community_join_requests_user_idx').on(table.userId),
  check('community_join_requests_kind', sql`${table.kind} IN ('join', 'invite')`),
  check('community_join_requests_status', sql`${table.status} IN ('pending', 'approved', 'declined')`),
]);

/** Active WebRTC room presence; sessions automatically expire without heartbeats. */
export const communityVoiceSessions = pgTable('community_voice_sessions', {
  id: uuid('id').primaryKey(),
  channelId: uuid('channel_id').notNull().references(() => communityChannels.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  muted: boolean('muted').notNull().default(false),
  deafened: boolean('deafened').notNull().default(false),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('community_voice_one_session_per_user_idx').on(table.channelId, table.userId),
  index('community_voice_sessions_last_seen_idx').on(table.lastSeenAt),
]);

/** Ephemeral, receiver-scoped WebRTC negotiation; no audio/media stored in PostgreSQL. */
export const communityVoiceSignals = pgTable('community_voice_signals', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  channelId: uuid('channel_id').notNull().references(() => communityChannels.id, { onDelete: 'cascade' }),
  senderSessionId: uuid('sender_session_id').notNull(),
  recipientSessionId: uuid('recipient_session_id').notNull(),
  kind: varchar('kind', { length: 12 }).notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('community_voice_signal_recipient_idx').on(table.channelId, table.recipientSessionId, table.id),
  index('community_voice_signal_created_idx').on(table.createdAt),
  check('community_voice_signal_kind', sql`${table.kind} IN ('offer', 'answer', 'candidate')`),
]);

/** Persistent community bans survive member removal and prevent rejoining. */
export const communityBans = pgTable('community_bans', {
  communityId: uuid('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bannedById: uuid('banned_by_id').references(() => users.id, { onDelete: 'set null' }),
  reason: varchar('reason', { length: 300 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.communityId, table.userId] }),
  index('community_bans_user_idx').on(table.userId),
]);

/** Shareable community invitations: random 128-bit UUID bearer tokens, revocable and expiring. */
export const communityInviteLinks = pgTable('community_invite_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  communityId: uuid('community_id').notNull().references(() => communities.id, { onDelete: 'cascade' }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, table => [
  index('community_invite_links_community_idx').on(table.communityId),
]);

/** Reports remain available for moderation when original content is removed. */
export const contentReports = pgTable('content_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetKind: varchar('target_kind', { length: 24 }).notNull(),
  targetId: uuid('target_id').notNull(),
  targetAuthorId: uuid('target_author_id').references(() => users.id, { onDelete: 'set null' }),
  reason: varchar('reason', { length: 24 }).notNull(),
  details: varchar('details', { length: 1000 }),
  evidence: jsonb('evidence').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('content_reports_reporter_target_idx').on(table.reporterId, table.targetKind, table.targetId),
  index('content_reports_status_created_idx').on(table.status, table.createdAt),
  index('content_reports_reporter_created_idx').on(table.reporterId, table.createdAt),
  check('content_reports_target_kind', sql`${table.targetKind} IN ('post','direct_message','community_message')`),
  check('content_reports_reason', sql`${table.reason} IN ('spam','harassment','hate','sexual','violence','scam','privacy','other')`),
  check('content_reports_status', sql`${table.status} IN ('pending','reviewing','resolved','dismissed')`),
]);
