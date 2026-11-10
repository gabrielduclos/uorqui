import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const shell=readFileSync(new URL('../src/SocialShell.tsx',import.meta.url),'utf8');
const channels=readFileSync(new URL('../src/LiveCommunities.tsx',import.meta.url),'utf8');
const notifications=readFileSync(new URL('../src/ActivityNotifications.tsx',import.meta.url),'utf8');

test('community optimistic bubble uses the current profile before the send completes',()=>{
  assert.match(shell,/myName=\{account\.profile\?\.displayName\?\?account\.user\.name\}/);
  assert.match(shell,/myAvatar=\{account\.profile\?\.avatarUrl\?\?null\}/);
  assert.match(channels,/authorHandle:myHandle,authorName:myName,authorAvatar:myAvatar/);
  assert.match(channels,/UserAvatar name=\{message\.authorName\} image=\{message\.authorAvatar\}/);
});

test('email notifications show only events that are still unread',()=>{
  assert.match(notifications,/const emails=inboxEvents\.filter\(item=>item\.kind==='email'&&!item\.readAt\)/);
  assert.match(notifications,/setInboxEvents\(old=>old\.map\(item=>item\.id===id\?\{\.\.\.item,readAt:new Date\(\)\.toISOString\(\)\}:item\)\)/);
});
