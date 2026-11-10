import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const routes=readFileSync(new URL('../src/mail-routes.ts',import.meta.url),'utf8');
const poller=readFileSync(new URL('../src/mail-poller.ts',import.meta.url),'utf8');
const inbox=readFileSync(new URL('../src/notification-routes.ts',import.meta.url),'utf8');

test('provider mail read and batch read dismiss corresponding notification events',()=>{
  assert.match(routes,/async function acknowledgeMailEvents\(accountId: string, messageIds: string\[\]\)/);
  assert.match(routes,/mail_message_id=ANY\(\$2::text\[\]\)/);
  assert.match(routes,/await markMailRead\(connection\.provider, token, messageId\);\s*await acknowledgeMailEvents\(accountId, \[messageId\]\)/);
  assert.match(routes,/if \(read\.length\) \{\s*await acknowledgeMailEvents\(accountId, read\)/);
  assert.match(routes,/if \(moved\.moved\.length\) \{\s*await acknowledgeMailEvents\(accountId, moved\.moved\)/);
});

test('provider scan only creates unread alerts and reconciles external reads',()=>{
  assert.match(poller,/snapshot\.messages\.filter\(message => !message\.unread\)/);
  assert.match(poller,/message\.unread && unseen\.has\(message\.id\)/);
  assert.match(inbox,/n\.kind='email' AND mc\.id IS NOT NULL AND n\.read_at IS NULL/);
});
