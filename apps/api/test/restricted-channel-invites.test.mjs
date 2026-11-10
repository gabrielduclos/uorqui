import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const routes=readFileSync(new URL('../src/channel-invite-routes.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../drizzle/0044_restricted_channel_invites.sql',import.meta.url),'utf8');
const schema=readFileSync(new URL('../src/db/schema.ts',import.meta.url),'utf8');

test('authorization checks issuer role and current restricted channel access',()=>{
  assert.match(routes,/role==='owner'\|\|role==='admin'\|\|\(role==='moderator'&&grant\)/);
  assert.match(routes,/ch\.access_mode='restricted'/);
  assert.match(routes,/issuerAllowed\(row\.role,row\.granted\)/);
  assert.match(routes,/community_bans/);
  assert.match(routes,/validRequestOrigin\(request\)/);
});

test('unguessable single-use tokens are hashed, expiring and consumed inside a row lock',()=>{
  assert.match(routes,/randomBytes\(32\)\.toString\('base64url'\)/);
  assert.match(routes,/createHash\('sha256'\)/);
  assert.match(routes,/interval '24 hours'/);
  assert.match(routes,/FOR UPDATE OF li/);
  assert.match(routes,/redeemed_at IS NULL AND li\.expires_at>now\(\)/);
  assert.match(routes,/redeemed_at=now\(\),redeemed_by_id=\$2/);
  assert.match(routes,/row\.recipientId&&row\.recipientId!==me/);
  assert.match(routes,/INSERT INTO community_channel_member_access/);
  assert.doesNotMatch(routes,/INSERT INTO community_channel_password_access/);
  assert.doesNotMatch(routes,/meeting_access_requests.*approved/);
});

test('database keeps a minimal auditable token record, never its bearer secret',()=>{
  assert.match(schema,/communityChannelInviteLinks = pgTable\('community_channel_invite_links'/);
  assert.match(migration,/"token_hash" varchar\(64\) PRIMARY KEY NOT NULL/);
  assert.match(migration,/"redeemed_by_id" uuid/);
  assert.doesNotMatch(migration,/"token" (text|varchar)/);
});
