// Unit tests for cleanText(), which cleans every name and room description.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText } from '../utils/generate.js';

test('trims the ends and squashes repeated spaces', () => {
  assert.equal(cleanText('   Ada    Lovelace  '), 'Ada Lovelace');
});

test('removes invisible control characters (tabs, newlines, null bytes)', () => {
  assert.equal(cleanText('Ada\tB\n'), 'Ada B');
  assert.equal(cleanText('Ad\u0000a'), 'Ad a');
});

test('anything that is not a string becomes an empty string', () => {
  for (const value of [undefined, null, 42, true, ['Ada'], { $ne: null }]) {
    assert.equal(cleanText(value), '', `for ${JSON.stringify(value)}`);
  }
});

test('leaves normal text, accents and emoji alone', () => {
  assert.equal(cleanText('Zoë 🎄 Ó Briain'), 'Zoë 🎄 Ó Briain');
});

test('only spaces becomes empty (so "required" checks catch it)', () => {
  assert.equal(cleanText('     '), '');
});
