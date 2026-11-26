// Presenter login: checking the password, and the sessions that follow.
//
// There is no sign-up. The ONE presenter account is set in backend/.env:
//   PRESENTER_USERNAME=…
//   PRESENTER_PASSWORD_HASH=scrypt:…   ← made by `npm run set-password`
//
// The .env file holds a HASH of the password, not the password. A hash is a
// one-way scramble: easy to check a guess against, but there is no way to turn
// it back into the password.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { PresenterSession } from '../models/PresenterSession.js';
import { generateToken } from '../utils/generate.js';

// scrypt is a password hash that is deliberately SLOW (tens of milliseconds).
// Unnoticeable for one login, but it makes trying millions of guesses against
// a stolen hash take far too long. promisify turns its callback into a promise.
const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export const SESSION_COOKIE = 'pairly_session';
const SESSION_HOURS = 12; // long enough for any event, then you log in again

const sha256 = (text) => crypto.createHash('sha256').update(text).digest();
const sha256Hex = (text) => sha256(text).toString('hex');

// Turns a password into "scrypt:<salt>:<hash>" for the .env file.
// The salt is random, so two people with the same password get different hashes.
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split(':');
  const expected = Buffer.from(hashHex ?? '', 'hex');
  if (scheme !== 'scrypt' || !saltHex || expected.length !== KEY_LENGTH) return false;
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH);
  return crypto.timingSafeEqual(actual, expected); // "constant time": the time taken doesn't hint at how close a guess was
}

// Is the presenter account set up in .env?
export function isLoginConfigured() {
  return Boolean(process.env.PRESENTER_USERNAME && process.env.PRESENTER_PASSWORD_HASH);
}

// true only if BOTH the username and the password are right.
// We always check the password, even when the username is wrong, so the time
// taken doesn't reveal whether the username was correct.
export async function checkCredentials(username, password) {
  const usernameOk = crypto.timingSafeEqual(
    sha256(username.toLowerCase()),
    sha256(process.env.PRESENTER_USERNAME.toLowerCase()) // usernames ignore case
  );
  const passwordOk = await verifyPassword(password, process.env.PRESENTER_PASSWORD_HASH);
  return usernameOk && passwordOk;
}

// The fingerprint of the current password (see credentialsVersion in the model).
const credentialsVersion = () => sha256Hex(process.env.PRESENTER_PASSWORD_HASH ?? '').slice(0, 16);

// After a successful login: make a session and return its secret token.
export async function createSession(username) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await PresenterSession.create({
    tokenHash: sha256Hex(token),
    username,
    credentialsVersion: credentialsVersion(),
    expiresAt,
  });
  return { token, expiresAt };
}

// Token (from the cookie) → the session, or null if it's missing, unknown,
// expired, or from before a password change.
export async function findSession(token) {
  if (typeof token !== 'string' || !token || !isLoginConfigured()) return null;
  return PresenterSession.findOne({
    tokenHash: sha256Hex(token),
    credentialsVersion: credentialsVersion(),
    expiresAt: { $gt: new Date() },
  });
}

export async function deleteSession(token) {
  if (typeof token !== 'string' || !token) return;
  await PresenterSession.deleteOne({ tokenHash: sha256Hex(token) });
}

// The cookie settings. Each one closes a door:
//  httpOnly  → JavaScript in the page can't read it, so a malicious script
//              (XSS) can't steal the session.
//  sameSite  → the browser won't send it with requests started by OTHER
//              websites, so they can't press buttons on your behalf (CSRF).
//  secure    → only sent over HTTPS. On in production; off in development,
//              where we use plain http://localhost.
export function sessionCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/', // the API (/api) AND the live connection (/socket.io) both need it
    ...(expiresAt && { expires: expiresAt }),
  };
}
