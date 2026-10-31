import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendAccountEmail } from '../dist/auth/email.js';

test('logs Resend acceptance safely without leaking user email or confirmation URL', async (t) => {
  const prevKey = process.env.RESEND_API_KEY;
  const prevFrom = process.env.AUTH_EMAIL_FROM;
  process.env.RESEND_API_KEY = 'key-for-unit-test-only';
  process.env.AUTH_EMAIL_FROM = 'Uorqui <no-reply@uorqui.app>';
  t.after(() => {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.AUTH_EMAIL_FROM;
    else process.env.AUTH_EMAIL_FROM = prevFrom;
  });
  const logs = [];
  t.mock.method(console, 'info', line => logs.push(String(line)));
  t.mock.method(globalThis, 'fetch', async (endpoint, init) => {
    assert.equal(endpoint, 'https://api.resend.com/emails');
    assert.ok(init.body.includes('secret-link-token'));
    return Response.json({ id: 'safe123-confirmed-abc' }, { status: 200 });
  });
  await sendAccountEmail('member@example.test', 'Verify email', 'secret-link-token', 'verify_email');
  assert.equal(logs.length, 1);
  const entry = JSON.parse(logs[0]);
  assert.equal(entry.event, 'auth_email_accepted');
  assert.equal(entry.providerId, 'safe123-confirmed-abc');
  assert.equal(entry.purpose, 'verify_email');
  assert.ok(!logs[0].includes('member@example.test'));
  assert.ok(!logs[0].includes('secret-link-token'));
});

test('logs safe provider error category without exposing rejected payload', async (t) => {
  const prevKey = process.env.RESEND_API_KEY;
  const prevFrom = process.env.AUTH_EMAIL_FROM;
  process.env.RESEND_API_KEY = 'key-for-unit-test-only';
  process.env.AUTH_EMAIL_FROM = 'Uorqui <no-reply@uorqui.app>';
  t.after(() => {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.AUTH_EMAIL_FROM;
    else process.env.AUTH_EMAIL_FROM = prevFrom;
  });
  const logs = [];
  t.mock.method(console, 'error', line => logs.push(String(line)));
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    name: 'validation_error', message: 'member@example.test and secret-link-token',
  }, { status: 403 }));
  await assert.rejects(
    sendAccountEmail('member@example.test', 'Verify email', 'secret-link-token', 'verify_email'),
    /Transactional email delivery failed/,
  );
  assert.equal(logs.length, 1);
  const entry = JSON.parse(logs[0]);
  assert.equal(entry.event, 'auth_email_rejected');
  assert.equal(entry.httpStatus, 403);
  assert.equal(entry.category, 'validation_error');
  assert.ok(!logs[0].includes('member@example.test'));
  assert.ok(!logs[0].includes('secret-link-token'));
});
