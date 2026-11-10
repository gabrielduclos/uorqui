import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const messageText=readFileSync(new URL('../src/MessageText.tsx',import.meta.url),'utf8');
const channels=readFileSync(new URL('../src/LiveCommunities.tsx',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8');
const wrangler=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');

test('landing in the default desktop General channel anchors the newest message',()=>{
  assert.match(channels,/channelHistoryVisible=channelOpen\|\|desktopChannelVisible/);
  assert.match(channels,/if\(!active\|\|!channelHistoryVisible\|\|!element/);
  assert.match(channels,/if\(!active\|\|!channelHistoryVisible\|\|!element\|\|!content/);
  assert.match(channels,/matchMedia\('\(min-width: 768px\)'\)/);
  assert.match(channels,/channelScrollRef\.current\.open\(key\)/);
});

test('restricted invitations do not reuse broad community links',()=>{
  assert.match(channels,/if\(activeChannel\.accessMode==='restricted'\)/);
  assert.match(channels,/\+activeChannel\.id\+'\/invites',body\(\{\}\)/);
  assert.match(channels,/\+activeChannel\.id\+'\/invites',body\(\{handle\}\)/);
  assert.match(channels,/mayInviteRestricted\(community\)/);
  assert.match(channels,/channelInviteToken&&<Button/);
  assert.match(channels,/\/api\/v1\/channel-invites\/revoke/);
});

test('channel secret is kept in URL hash/session storage until explicit account acceptance',()=>{
  assert.match(app,/const CHANNEL_INVITE_KEY='uorqui:pending-restricted-channel-invite'/);
  assert.match(app,/sessionStorage\.setItem\(CHANNEL_INVITE_KEY,secret\)/);
  assert.match(app,/history\.replaceState\(null,'','\/channel-invite'\)/);
  assert.match(app,/\/api\/v1\/channel-invites\/preview/);
  assert.match(app,/async function acceptRestrictedChannelInvite\(/);
  assert.match(app,/\/api\/v1\/channel-invites\/redeem/);
  assert.match(worker,/channelInviteNavigation/);
  assert.match(wrangler,/"\/channel-invite"/);
});

test('restricted links open through internal navigation without a new browser tab',()=>{
  assert.match(messageText,/restrictedToken=new URLSearchParams\(url\.hash\.slice\(1\)\)\.get\('token'\)/);
  assert.match(messageText,/url\.pathname\+url\.hash/);
  assert.match(messageText,/window\.dispatchEvent\(new PopStateEvent\('popstate'\)\)/);
  assert.match(app,/setRestrictedInviteToken\(pendingRestrictedChannelInvite\(\)\)/);
});
