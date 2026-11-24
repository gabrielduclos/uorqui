import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Services } from './database.js'
import { RequestError } from './routes.js'
import { channelMembers, channels, directConversations, invitations, memberships, profiles, teams, users } from './schema.js'

const uuid = z.uuid()
const userIdInput = z.string().min(1).max(128)
const handleInput = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/)

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new RequestError(400, 'INVALID_INPUT')
  return result.data
}

type Access = {
  requireUser: (request: FastifyRequest) => Promise<{ id: string; name: string; email: string }>
  requireOwner: (teamId: string, userId: string) => Promise<void>
}

export function registerWorkplaceRoutes(app: FastifyInstance, { db }: Pick<Services, 'db'>, access: Access) {
  const publicFields = { id: users.id, name: users.name, image: users.image, handle: users.handle, bio: profiles.bio }

  app.get('/api/profile', async (request) => {
    const user = await access.requireUser(request)
    const [profile] = await db.select(publicFields).from(users)
      .leftJoin(profiles, eq(users.id, profiles.userId)).where(eq(users.id, user.id))
    return profile
  })

  app.post('/api/profile', async (request) => {
    const user = await access.requireUser(request)
    const input = parse(z.object({
      name: z.string().trim().min(1).max(80),
      handle: handleInput,
      bio: z.string().trim().max(500),
    }), request.body)
    await db.transaction(async (tx) => {
      try {
        await tx.update(users).set({ name: input.name, handle: input.handle, updatedAt: new Date() }).where(eq(users.id, user.id))
        await tx.insert(profiles).values({ userId: user.id, handle: input.handle, bio: input.bio })
          .onConflictDoUpdate({ target: profiles.userId, set: { handle: input.handle, bio: input.bio } })
      } catch (error) {
        const failure = error as { code?: string; cause?: { code?: string } }
        if ((failure.cause?.code ?? failure.code) === '23505') throw new RequestError(409, 'HANDLE_TAKEN')
        throw error
      }
    })
    return { id: user.id, ...input }
  })

  app.get('/api/profiles/:handle', async (request) => {
    const { handle } = parse(z.object({ handle: handleInput }), request.params)
    const [profile] = await db.select(publicFields).from(users)
      .leftJoin(profiles, eq(users.id, profiles.userId)).where(eq(users.handle, handle))
    if (!profile) throw new RequestError(404, 'PROFILE_NOT_FOUND')
    return profile
  })

  app.get('/api/people/:userId', async (request) => {
    await access.requireUser(request)
    const { userId } = parse(z.object({ userId: userIdInput }), request.params)
    const [profile] = await db.select(publicFields).from(users)
      .leftJoin(profiles, eq(users.id, profiles.userId)).where(eq(users.id, userId))
    if (!profile) throw new RequestError(404, 'PROFILE_NOT_FOUND')
    return profile
  })

  app.get('/api/teams/:teamId/members', async (request) => {
    const user = await access.requireUser(request)
    const { teamId } = parse(z.object({ teamId: uuid }), request.params)
    await access.requireOwner(teamId, user.id)
    const members = await db.select({ ...publicFields, role: memberships.role }).from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(profiles, eq(profiles.userId, users.id)).where(eq(memberships.teamId, teamId)).orderBy(asc(users.name))
    const guests = await db.selectDistinct({ ...publicFields, role: sql<string>`'guest'` }).from(channelMembers)
      .innerJoin(channels, eq(channels.id, channelMembers.channelId))
      .innerJoin(users, eq(users.id, channelMembers.userId))
      .leftJoin(profiles, eq(profiles.userId, users.id)).where(eq(channels.teamId, teamId))
    const included = new Set(members.map((member) => member.id))
    return [...members, ...guests.filter((guest) => !included.has(guest.id))]
  })

  app.post('/api/teams/:teamId/update', async (request) => {
    const user = await access.requireUser(request)
    const { teamId } = parse(z.object({ teamId: uuid }), request.params)
    const { name } = parse(z.object({ name: z.string().trim().min(2).max(80) }), request.body)
    await access.requireOwner(teamId, user.id)
    const [team] = await db.update(teams).set({ name }).where(and(eq(teams.id, teamId), isNull(teams.deletedAt)))
      .returning({ id: teams.id, name: teams.name })
    if (!team) throw new RequestError(404, 'TEAM_NOT_FOUND')
    return team
  })

  app.post('/api/teams/:teamId/remove-member', async (request) => {
    const user = await access.requireUser(request)
    const { teamId } = parse(z.object({ teamId: uuid }), request.params)
    const { userId } = parse(z.object({ userId: userIdInput }), request.body)
    await access.requireOwner(teamId, user.id)
    if (userId === user.id) throw new RequestError(400, 'OWNER_REQUIRED')
    await db.transaction(async (tx) => {
      const [target] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId))
      await tx.delete(channelMembers).where(and(eq(channelMembers.userId, userId),
        inArray(channelMembers.channelId, tx.select({ id: channels.id }).from(channels).where(eq(channels.teamId, teamId)))))
      await tx.delete(memberships).where(and(eq(memberships.teamId, teamId), eq(memberships.userId, userId)))
      if (target) await tx.delete(invitations).where(and(eq(invitations.teamId, teamId), eq(invitations.email, target.email)))
    })
    return { removed: true }
  })

  app.post('/api/teams/:teamId/delete', async (request) => {
    const user = await access.requireUser(request)
    const { teamId } = parse(z.object({ teamId: uuid }), request.params)
    const { name } = parse(z.object({ name: z.string() }), request.body)
    await access.requireOwner(teamId, user.id)
    const [team] = await db.update(teams).set({ deletedAt: new Date() })
      .where(and(eq(teams.id, teamId), eq(teams.name, name), isNull(teams.deletedAt))).returning({ id: teams.id })
    if (!team) throw new RequestError(400, 'TEAM_NAME_MISMATCH')
    return { deleted: true }
  })

  app.get('/api/direct', async (request) => {
    const user = await access.requireUser(request)
    return db.select({
      id: channels.id, name: users.name, image: users.image, description: sql<string>`coalesce(${users.handle}, '')`,
      visibility: channels.visibility, peerId: users.id,
    }).from(directConversations).innerJoin(channels, eq(channels.id, directConversations.channelId))
      .innerJoin(users, eq(users.id, sql`case when ${directConversations.userA} = ${user.id} then ${directConversations.userB} else ${directConversations.userA} end`))
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(or(eq(directConversations.userA, user.id), eq(directConversations.userB, user.id)))
      .orderBy(asc(users.name))
  })

  app.post('/api/direct', async (request) => {
    const user = await access.requireUser(request)
    const input = parse(z.union([z.object({ userId: userIdInput }), z.object({ handle: z.string().trim().transform((value) => value.replace(/^@/, '')).pipe(handleInput) })]), request.body)
    const [peer] = await db.select({ id: users.id, name: users.name, handle: users.handle })
      .from(users).leftJoin(profiles, eq(profiles.userId, users.id))
      .where('userId' in input ? eq(users.id, input.userId) : eq(users.handle, input.handle))
    if (!peer) throw new RequestError(404, 'PROFILE_NOT_FOUND')
    if (peer.id === user.id) throw new RequestError(400, 'DIRECT_SELF')
    const [userA, userB] = [user.id, peer.id].sort() as [string, string]
    const channelId = await db.transaction(async (tx) => {
      // Serializes pair creation, including concurrent requests from both participants.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([userA, userB])}, 0))`)
      const [existing] = await tx.select().from(directConversations)
        .where(and(eq(directConversations.userA, userA), eq(directConversations.userB, userB)))
      if (existing) return existing.channelId
      const [channel] = await tx.insert(channels).values({ name: 'direct', visibility: 'private' }).returning({ id: channels.id })
      if (!channel) throw new Error('Channel insert returned no row')
      await tx.insert(directConversations).values({ channelId: channel.id, userA, userB })
      await tx.insert(channelMembers).values([{ channelId: channel.id, userId: userA }, { channelId: channel.id, userId: userB }])
      return channel.id
    })
    return { id: channelId, name: peer.name, description: peer.handle ?? '', visibility: 'private', peerId: peer.id }
  })
}
