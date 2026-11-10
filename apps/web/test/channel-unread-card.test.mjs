import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const channels=readFileSync(new URL('../src/LiveCommunities.tsx',import.meta.url),'utf8');
const shell=readFileSync(new URL('../src/SocialShell.tsx',import.meta.url),'utf8');

test('channel navigation has no unread message summary cards',()=>{
  assert.doesNotMatch(channels, /unreadLocations/);
  assert.doesNotMatch(channels, /openUnread\(/);
  assert.doesNotMatch(channels, />\{pt\?'Mensagens não lidas':'Unread messages'\}<\/p>/);
});

test('unread badges remain beside community and channel entries',()=>{
  assert.match(channels, /unreadCommunities\[group\.id\]/);
  assert.match(channels, /unreadChannels\[ch\.id\]/);
  assert.match(shell, /unreadCommunities=\{communityUnread\.communities\}/);
  assert.match(shell, /unreadChannels=\{communityUnread\.channels\}/);
});
