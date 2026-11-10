import assert from 'node:assert/strict';
import test from 'node:test';
import { compactUserName } from '../src/userDisplayName.ts';

test('uses first and last name, preserving the full value on profile data', () => {
  const full = 'Gabriel Axel Fernando de Oliveira Duclos';
  assert.equal(compactUserName(full), 'Gabriel Duclos');
  assert.equal(full, 'Gabriel Axel Fernando de Oliveira Duclos');
});

test('handles a single name, extra whitespace, accents and empty values', () => {
  assert.equal(compactUserName('Maria'), 'Maria');
  assert.equal(compactUserName('  Ana  Beatriz  Souza  '), 'Ana Souza');
  assert.equal(compactUserName('João   d’Ávila'), 'João d’Ávila');
  assert.equal(compactUserName(''), '');
  assert.equal(compactUserName(null), '');
  assert.equal(compactUserName(undefined), '');
});
