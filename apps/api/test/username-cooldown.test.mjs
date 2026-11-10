import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { nextUsernameChangeAt, USERNAME_COOLDOWN_DAYS } from '../src/username-cooldown.ts';

test('username cooldown lasts exactly 15 days and begins only after first change', () => {
  assert.equal(USERNAME_COOLDOWN_DAYS, 15);
  assert.equal(nextUsernameChangeAt(null), null);
  assert.equal(nextUsernameChangeAt(undefined), null);
  assert.equal(nextUsernameChangeAt('2026-11-10T10:00:00.000Z'), '2026-11-25T10:00:00.000Z');
  assert.equal(nextUsernameChangeAt('not-a-date'), null);
});

test('server enforces an atomic conditional update and does not refresh unchanged handles', () => {
  const routes = readFileSync(new URL('../src/profile-routes.ts', import.meta.url), 'utf8');
  assert.match(routes, /body\.handle !== undefined && body\.handle !== owner\.handle/);
  assert.match(routes, /handleChangedAt: sql`now\(\)`/);
  assert.match(routes, /handleChangedAt\} <= now\(\) - interval '15 days'/);
  assert.match(routes, /status\(423\)/);
  assert.match(routes, /USERNAME_CHANGE_COOLDOWN/);
});

test('private account profile includes the eligibility date without exposing it on public profiles', () => {
  const routes = readFileSync(new URL('../src/profile-routes.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
  assert.match(server, /handleChangeAvailableAt: nextUsernameChangeAt/);
  assert.match(routes, /privateProfileFields = \{ \.\.\.profileFields, handleChangedAt: users\.handleChangedAt \}/);
  assert.match(routes, /handleChangeAvailableAt: nextUsernameChangeAt\(record\.handleChangedAt\)/);
  assert.match(routes, /\.select\(profileFields\)\.from\(users\)/);
});
