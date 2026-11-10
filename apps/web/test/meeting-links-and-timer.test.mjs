import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMeetingLink, isMeetingLink } from '../src/meetingLink.ts';
import { meetingSecondsLeft, formatMeetingCountdown } from '../src/meetingCountdown.ts';

const community='123e4567-e89b-42d3-a456-426614174000';
const channel='123e4567-e89b-42d3-a456-426614174001';

test('meeting link is reusable navigation and never a channel invitation token',()=>{
  const url=new URL(buildMeetingLink('https://uorqui.app',community,channel));
  assert.equal(url.origin,'https://uorqui.app');
  assert.equal(url.pathname,'/');
  assert.equal(url.searchParams.get('community'),community);
  assert.equal(url.searchParams.get('channel'),channel);
  assert.equal(url.searchParams.get('meeting'),'1');
  assert.ok(!url.href.includes('/channel-invite'));
  assert.ok(!url.searchParams.has('token'));
  assert.ok(isMeetingLink(url.searchParams));
  assert.equal(buildMeetingLink('https://uorqui.app',community,channel),url.toString());
});

test('other navigation links and invalid IDs never open a meeting',()=>{
  assert.equal(isMeetingLink(new URLSearchParams('community='+community+'&channel='+channel)),false);
  assert.equal(isMeetingLink(new URLSearchParams('community='+community+'&channel=invalid&meeting=1')),false);
  assert.throws(()=>buildMeetingLink('https://uorqui.app','bad',channel),/INVALID_MEETING_ROOM/);
});

test('one shared absolute deadline counts down instead of restarting per viewer',()=>{
  const expires='2026-11-10T17:00:00.000Z';
  const base=Date.parse(expires)-60*60*1000;
  assert.equal(meetingSecondsLeft(expires,base),3600);
  assert.equal(formatMeetingCountdown(3600),'60:00');
  assert.equal(meetingSecondsLeft(expires,base+30*60*1000),1800);
  assert.equal(formatMeetingCountdown(1800),'30:00');
  assert.equal(meetingSecondsLeft(expires,base+60*60*1000),0);
  assert.equal(formatMeetingCountdown(0),'00:00');
  assert.equal(meetingSecondsLeft(expires,base+70*60*1000),0);
  assert.equal(meetingSecondsLeft('invalid',base),null);
});
