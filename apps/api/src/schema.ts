import { sql } from 'drizzle-orm'
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

export const namespace = 'uorqui_workplace'
export const workplace = pgSchema(namespace)
const time = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const users = workplace.table('user', {
  id: text().primaryKey(),
  name: text().notNull(),
  handle: text().unique(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull(),
  image: text(),
  createdAt: time('createdAt').notNull(),
  updatedAt: time('updatedAt').notNull(),
})

export const sessions = workplace.table('session', {
  id: text().primaryKey(),
  token: text().notNull().unique(),
  expiresAt: time('expiresAt').notNull(),
  createdAt: time('createdAt').notNull(),
  updatedAt: time('updatedAt').notNull(),
  ipAddress: text(),
  userAgent: text(),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (table) => [index('session_user_idx').on(table.userId)])

export const accounts = workplace.table('account', {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text().notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: time('accessTokenExpiresAt'),
  refreshTokenExpiresAt: time('refreshTokenExpiresAt'),
  scope: text(),
  password: text(),
  createdAt: time('createdAt').notNull(),
  updatedAt: time('updatedAt').notNull(),
}, (table) => [index('account_user_idx').on(table.userId)])

export const verifications = workplace.table('verification', {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: time('expiresAt').notNull(),
  createdAt: time('createdAt').notNull(),
  updatedAt: time('updatedAt').notNull(),
}, (table) => [index('verification_identifier_idx').on(table.identifier)])

export const teams = workplace.table('team', {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  deletedAt: time('deleted_at'),
  createdAt: time('created_at').defaultNow().notNull(),
})

export const memberships = workplace.table('team_member', {
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text({ enum: ['owner', 'member'] }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.teamId, table.userId] }),
  index('team_member_user_idx').on(table.userId),
  check('valid_team_role', sql`${table.role} in ('owner', 'member')`),
])

export const channels = workplace.table('channel', {
  id: uuid().defaultRandom().primaryKey(),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  description: text().notNull().default(''),
  visibility: text({ enum: ['team', 'private'] }).notNull(),
  createdAt: time('created_at').defaultNow().notNull(),
}, (table) => [
  unique('unique_channel_name').on(table.teamId, table.name),
  unique('unique_channel_team').on(table.id, table.teamId),
  check('valid_channel_visibility', sql`${table.visibility} in ('team', 'private')`),
])

export const channelMembers = workplace.table('channel_member', {
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.channelId, table.userId] }),
  index('channel_member_user_idx').on(table.userId),
])

export const messages = workplace.table('message', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => users.id),
  parentId: bigint('parent_id', { mode: 'number' }),
  body: text().notNull(),
  location: jsonb().$type<{ latitude: number; longitude: number }>(),
  clientId: uuid('client_id'),
  editedAt: time('edited_at'),
  cancelledAt: time('cancelled_at'),
  createdAt: time('created_at').defaultNow().notNull(),
}, (table) => [
  unique('message_author_client').on(table.authorId, table.clientId),
  unique('unique_message_channel').on(table.id, table.channelId),
  foreignKey({ columns: [table.parentId, table.channelId], foreignColumns: [table.id, table.channelId] }).onDelete('cascade'),
  index('message_channel_thread_idx').on(table.channelId, table.parentId, table.id),
  index('message_channel_cursor_idx').on(table.channelId, table.id),
])

export const channelReads = workplace.table('channel_read', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  lastMessageId: bigint('last_message_id', { mode: 'number' }).notNull().default(0),
}, (table) => [primaryKey({ columns: [table.userId, table.channelId] })])

export const invitations = workplace.table('invitation', {
  tokenHash: text('token_hash').primaryKey(),
  email: text().notNull(),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id'),
  expiresAt: time('expires_at').notNull(),
  acceptedAt: time('accepted_at'),
}, (table) => [
  foreignKey({ columns: [table.channelId, table.teamId], foreignColumns: [channels.id, channels.teamId] }).onDelete('cascade'),
])


export const profiles = workplace.table('profile', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  handle: text().notNull().unique(),
  bio: text().notNull().default(''),
})

export const directConversations = workplace.table('direct_conversation', {
  channelId: uuid('channel_id').primaryKey().references(() => channels.id, { onDelete: 'cascade' }),
  userA: text('user_a').notNull().references(() => users.id, { onDelete: 'cascade' }),
  userB: text('user_b').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (table) => [
  unique('direct_pair_unique').on(table.userA, table.userB),
  check('direct_pair_order', sql`${table.userA} < ${table.userB}`),
])

export const attachments = workplace.table('attachment', {
  id: uuid().primaryKey(),
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  messageId: bigint('message_id', { mode: 'number' }).references(() => messages.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  mime: text().notNull(),
  size: integer().notNull(),
  ready: boolean().notNull().default(false),
  createdAt: time('created_at').defaultNow().notNull(),
}, (table) => [index('attachment_message_idx').on(table.messageId)])

export const messageReactions = workplace.table('message_reaction', {
  messageId: bigint('message_id', { mode: 'number' }).notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  emoji: text().notNull(),
}, (table) => [
  primaryKey({ columns: [table.messageId, table.userId, table.emoji] }),
  check('reaction_emoji_valid', sql`${table.emoji} in ('👍', '❤️', '😂', '😮', '😢', '🎉')`),
])
