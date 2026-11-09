import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { acquireDocumentLock, anotherDocumentPresent, persistentInstanceId } from '../src/appInstanceIdentity.ts';

class FakeStorage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, value); }
}

class FakeLocks {
  active = new Map();
  async request(name, options, callback) {
    if (this.active.has(name) && !options.steal) return callback(null);
    const token = {};
    this.active.set(name, token);
    try { return await callback({ name, mode: 'exclusive' }); }
    finally { if (this.active.get(name) === token) this.active.delete(name); }
  }
}

class FakeBroadcastChannel {
  static rooms = new Map();
  listeners = new Set();
  constructor(name) {
    this.name = name;
    const room = FakeBroadcastChannel.rooms.get(name) ?? new Set();
    room.add(this);
    FakeBroadcastChannel.rooms.set(name, room);
  }
  addEventListener(name, listener) { if (name === 'message') this.listeners.add(listener); }
  removeEventListener(name, listener) { if (name === 'message') this.listeners.delete(listener); }
  postMessage(data) {
    for (const other of FakeBroadcastChannel.rooms.get(this.name) ?? []) {
      if (other !== this) queueMicrotask(() => {
        for (const listener of other.listeners) listener({ data });
      });
    }
  }
  close() { FakeBroadcastChannel.rooms.get(this.name)?.delete(this); }
}

test('same browser/PWA and account category reuses identity across simulated reload/relaunch', () => {
  const store = new FakeStorage();
  let created = 0;
  const generate = () => { created++; return randomUUID(); };
  const desktopFirst = persistentInstanceId(store, 'account-A', 'desktop', generate);
  assert.equal(persistentInstanceId(store, 'account-A', 'desktop', generate), desktopFirst);
  const mobileFirst = persistentInstanceId(store, 'account-A', 'mobile', generate);
  assert.equal(persistentInstanceId(store, 'account-A', 'mobile', generate), mobileFirst);
  assert.notEqual(desktopFirst, mobileFirst);
  assert.notEqual(persistentInstanceId(store, 'account-B', 'desktop', generate), desktopFirst);
  assert.equal(created, 3);
});

test('corrupt IDs are discarded; private browsing storage denial fails safely', () => {
  const store = new FakeStorage();
  store.setItem('uorqui:instance-browser:v2:account-A:mobile', 'not-an-identifier');
  const id = persistentInstanceId(store, 'account-A', 'mobile', randomUUID);
  assert.match(id, /^[0-9a-f]{8}-/i);
  assert.equal(persistentInstanceId(store, 'account-A', 'mobile', randomUUID), id);
  const forbidden = { getItem() { throw Error('disabled'); }, setItem() { throw Error('disabled'); } };
  assert.match(persistentInstanceId(forbidden, 'account-A', 'desktop', randomUUID), /^[0-9a-f]{8}-/i);
});

test('Web Locks enforce one live tab per account; reopening reuses the browser identity', async () => {
  const locks = new FakeLocks();
  const key = 'uorqui:instance-lock:v2:account-A:desktop';
  const first = await acquireDocumentLock(locks, key, false);
  assert.equal(typeof first, 'function');
  const second = await acquireDocumentLock(locks, key, false);
  assert.equal(second, null, 'another open tab must remain blocked');
  const mobile = await acquireDocumentLock(locks, 'uorqui:instance-lock:v2:account-A:mobile', false);
  assert.equal(typeof mobile, 'function', 'mobile slot independent');
  first();
  await Promise.resolve();
  const reopened = await acquireDocumentLock(locks, key, false);
  assert.equal(typeof reopened, 'function', 'closed tab releases lock on its own');
  reopened();
  mobile();
});

test('explicit takeover steals only the local tab lock, not the mobile category', async () => {
  const locks = new FakeLocks();
  const key = 'uorqui:instance-lock:v2:account-A:desktop';
  const original = await acquireDocumentLock(locks, key, false);
  const mobile = await acquireDocumentLock(locks, 'uorqui:instance-lock:v2:account-A:mobile', false);
  const successor = await acquireDocumentLock(locks, key, true);
  assert.equal(typeof successor, 'function');
  original();
  await Promise.resolve();
  assert.equal(await acquireDocumentLock(locks, key, false), null,
    'a late release by the displaced document must not clear the successor lock');
  assert.equal(await acquireDocumentLock(locks, 'uorqui:instance-lock:v2:account-A:mobile', false), null);
  successor();
  mobile();
});

test('BroadcastChannel fallback detects an actively open peer but not a closed one', async () => {
  const first = new FakeBroadcastChannel('uorqui-identity-test');
  const second = new FakeBroadcastChannel('uorqui-identity-test');
  first.addEventListener('message', event => {
    if (event.data.type === 'probe') first.postMessage({
      type: 'present', accountId: event.data.accountId, kind: event.data.kind,
      pageId: 'existing-page', replyTo: event.data.probeId,
    });
  });
  assert.equal(await anotherDocumentPresent(second, 'account-A', 'mobile', 'new-page', 40), true);
  first.close();
  assert.equal(await anotherDocumentPresent(second, 'account-A', 'mobile', 'new-page', 15), false);
  second.close();
});
