import assert from 'node:assert/strict';
import { test } from 'node:test';
import { delayToNextLocalDay, formatMessageTimestamp, localDayKey } from '../src/messageTimestamp.ts';

const date = (year, month, day, hour, minute) => new Date(year, month - 1, day, hour, minute);
const iso = value => value.toISOString();

test('today displays only hour and minute in the current locale', () => {
  const today = localDayKey(date(2026, 11, 9, 23, 59));
  const text = formatMessageTimestamp(iso(date(2026, 11, 9, 0, 1)), 'pt-BR', today);
  assert.equal(text, date(2026, 11, 9, 0, 1).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }));
  assert.doesNotMatch(text, /09\/11/);
});

test('after local midnight yesterday’s message gains a date without losing its time', () => {
  const message = iso(date(2026, 11, 9, 23, 58));
  const before = formatMessageTimestamp(message, 'pt-BR', localDayKey(date(2026, 11, 9, 23, 59)));
  const after = formatMessageTimestamp(message, 'pt-BR', localDayKey(date(2026, 11, 10, 0, 1)));
  assert.doesNotMatch(before, /09\/11/);
  assert.match(after, /09\/11/);
  assert.ok(after.endsWith(before));
});

test('messages from earlier years include their year', () => {
  const value = iso(date(2025, 12, 31, 23, 30));
  const result = formatMessageTimestamp(value, 'pt-BR', localDayKey(date(2026, 1, 1, 0, 0)));
  assert.match(result, /31\/12\/2025/);
  assert.match(result, /23:30/);
});

test('local calendar boundary is not determined by ISO UTC date', () => {
  const yesterday = date(2026, 11, 9, 23, 59);
  const today = date(2026, 11, 10, 0, 0);
  assert.notEqual(localDayKey(yesterday), localDayKey(today));
  const old = formatMessageTimestamp(iso(yesterday), 'en', localDayKey(today));
  assert.ok(old.includes(yesterday.toLocaleDateString('en', { day:'2-digit', month:'2-digit' })));
});

test('invalid or absent timestamps produce an empty label', () => {
  const today = localDayKey(new Date());
  assert.equal(formatMessageTimestamp(null, 'pt-BR', today), '');
  assert.equal(formatMessageTimestamp('invalid', 'pt-BR', today), '');
});

test('date refresh happens at the next local midnight', () => {
  const late = delayToNextLocalDay(date(2026, 11, 9, 23, 59));
  assert.ok(late >= 60000 && late <= 60100);
  const morning = delayToNextLocalDay(date(2026, 11, 9, 11, 30));
  assert.ok(morning > 0 && morning < 24*60*60*1000);
});
