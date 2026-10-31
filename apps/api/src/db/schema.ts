import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  check,
  boolean,
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
