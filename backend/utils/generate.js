// Small helpers that create random values.
// We use Node's `crypto` module instead of Math.random(), because crypto
// randomness is unpredictable. Math.random() is fine for games but can be guessed.
import crypto from 'node:crypto';

// Letters and digits that are easy to read on a big screen.
// Left out: 0/O, 1/I/L. They look alike and cause "room not found" errors.
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 characters

// e.g. "XK4P". 31^4 = ~920,000 possible codes.
export function generateRoomCode(length = 4) {
  let code = '';
  for (let i = 0; i < length; i++) {
    // crypto.randomInt(n) gives a random whole number from 0 to n-1.
    code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

// e.g. "0427". randomInt(0, 10000) gives 0..9999, and padStart adds leading
// zeros so we always get exactly 4 characters (7 → "0007").
export function generatePin() {
  return crypto.randomInt(0, 10000).toString().padStart(4, '0');
}

// A long secret, like a password the server hands out.
// 24 random bytes → 48 hex characters. Impossible to guess.
export function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

// MongoDB reports a broken unique index with error code 11000.
// We use this to detect "that code/PIN is already taken, try another".
export function isDuplicateKeyError(err) {
  return err?.code === 11000;
}

// Cleans up free text typed by a person (names, room descriptions):
//  - anything that isn't a string becomes ''      (blocks { "$ne": null } tricks)
//  - invisible control characters are removed     (tabs, newlines, \u0000…)
//  - runs of spaces become one space, ends trimmed ("  Ada   B " → "Ada B")
export function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
