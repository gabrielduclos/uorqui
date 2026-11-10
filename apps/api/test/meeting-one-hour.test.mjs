import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const voice=readFileSync(new URL('../src/community-voice-routes.ts',import.meta.url),'utf8');
const meeting=readFileSync(new URL('../src/community-meeting-routes.ts',import.meta.url),'utf8');
const schema=readFileSync(new URL('../src/db/schema.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../drizzle/0045_meeting_one_hour_deadline.sql',import.meta.url),'utf8');

test('one shared meeting expiry is persisted and migration is additive',()=>{
  assert.match(schema,/meetingExpiresAt: timestamp\('meeting_expires_at'/);
  assert.match(migration,/ALTER TABLE "community_channels" ADD COLUMN "meeting_expires_at" timestamptz;/);
  assert.match(voice,/pg_advisory_xact_lock/);
  assert.match(voice,/meeting_expires_at=now\(\)\+interval \\'1 hour\\'/);
  assert.match(voice,/meetingExpired\|\|seats\.rows\.length===0/);
  assert.match(voice,/expiresAt:meetingExpiresAt/);
});

test('expired rooms cannot keep signaling, heartbeats, presence or state',()=>{
  assert.match(voice,/ch\.meeting_expires_at>now\(\)/);
  assert.match(voice,/c\.meeting_expires_at>now\(\)/);
  assert.match(voice,/DELETE FROM community_voice_sessions WHERE channel_id=\$1/);
  assert.match(voice,/VOICE_SESSION_ENDED/);
});

test('meeting link does not bypass membership, channel ACL, password or admission policy',()=>{
  assert.match(voice,/const ok=await client\.query\(voiceAccess/);
  assert.match(voice,/MEETING_APPROVAL_REQUIRED/);
  assert.match(voice,/community_channel_password_access/);
  assert.match(voice,/community_channel_member_access/);
  assert.match(meeting,/context\(id,channelId,me\)/);
  assert.match(meeting,/expiresAt:room\.expiresAt/);
});
