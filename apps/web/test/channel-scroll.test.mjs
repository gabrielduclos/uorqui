import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChannelScrollBehavior } from '../src/channelScrollBehavior.ts';

test('opening pins newest message even after programmatic early scroll events', () => {
  const s = new ChannelScrollBehavior(), key='group/channel';
  assert.equal(s.open(key), true);
  assert.equal(s.open(key), false);
  s.onScroll(key, false); // browser restores scroll while page is still sizing
  assert.equal(s.isOpening(key), true);
  assert.equal(s.shouldFollow(key), true);
  assert.equal(s.shouldPinOnResize(key, true, false), true);
  assert.equal(s.shouldPinOnResize(key, false, false), true);
});

test('reader scrolling upwards stops auto-follow but returning to bottom resumes it', () => {
  const s = new ChannelScrollBehavior(), key='group/channel';
  s.open(key);
  s.interrupt(key);
  s.onScroll(key, false);
  assert.equal(s.isOpening(key), false);
  assert.equal(s.shouldFollow(key), false);
  assert.equal(s.shouldPinOnResize(key, true, false), false);
  s.onScroll(key, true);
  assert.equal(s.shouldFollow(key), true);
  assert.equal(s.shouldPinOnResize(key, true, false), true);
});

test('reopening channel, switching rooms and expanding voice chat reset initial anchor', () => {
  const s = new ChannelScrollBehavior();
  s.open('group/old'); s.interrupt('group/old'); s.onScroll('group/old', false);
  assert.equal(s.open('group/new'), true);
  s.onScroll('group/old', false);
  assert.equal(s.shouldFollow('group/new'), true);
  s.reset(); // leave channel / collapse voice text
  assert.equal(s.open('group/new'), true);
  assert.equal(s.shouldFollow('group/new'), true);
});

test('media layout growth honors opening anchor and manual reading position', () => {
  const s = new ChannelScrollBehavior(), key='group/channel';
  s.open(key);
  assert.equal(s.shouldPinOnResize(key, true, false), true);
  s.interrupt(key); s.onScroll(key, false);
  assert.equal(s.shouldPinOnResize(key, true, false), false);
  assert.equal(s.shouldPinOnResize(key, true, true), true);
  assert.equal(s.shouldPinOnResize('group/other', true, true), false);
});
