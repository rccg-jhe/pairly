// Presenter login. There is deliberately NO sign-up route: the only account
// is the one in backend/.env (see services/presenterAuth.js).
import { Router } from 'express';
import {
  isLoginConfigured,
  checkCredentials,
  createSession,
  deleteSession,
  sessionCookieOptions,
  SESSION_COOKIE,
} from '../services/presenterAuth.js';
import { getPresenterSession } from '../middleware/auth.js';
import { readCookie } from '../utils/cookies.js';
import { disconnectPresenterSession } from '../realtime/socket.js';

const router = Router();

// ── Slowing down password guessing ──
// Each device (IP address) gets MAX_FAILURES wrong tries per LOCK_MINUTES.
// After that, every attempt from it is refused until the time is up, even with
// the right password, so guessing becomes hopelessly slow.
// Kept in memory: simple, and it resets when the server restarts.
const MAX_FAILURES = 10;
const LOCK_MINUTES = 15;
const failures = new Map(); // ip → { count, resetAt }

function failuresFor(ip) {
  const entry = failures.get(ip);
  if (entry && entry.resetAt <= Date.now()) {
    failures.delete(ip); // the time is up: start again
    return null;
  }
  return entry;
}

function recordFailure(ip) {
  const entry = failuresFor(ip) ?? { count: 0, resetAt: Date.now() + LOCK_MINUTES * 60 * 1000 };
  entry.count++;
  failures.set(ip, entry);
}

// ─────────────────────────────────────────────────────────────
// POST /api/auth/login   Body: { "username": "…", "password": "…" }
// On success, sets the httpOnly session cookie.
// ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  if (!isLoginConfigured()) {
    // 503 = "Service Unavailable": the server isn't set up for this yet
    return res.status(503).json({
      error: 'Presenter login is not set up on the server yet. Run `npm run set-password` in the backend folder.',
    });
  }

  const locked = failuresFor(req.ip);
  if (locked && locked.count >= MAX_FAILURES) {
    const minutes = Math.ceil((locked.resetAt - Date.now()) / 60000);
    res.set('Retry-After', String(minutes * 60)); // the standard "try again in N seconds" header
    // 429 = "Too Many Requests"
    return res.status(429).json({
      error: `Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    });
  }

  const { username, password } = req.body ?? {};
  // Type and size checks first (same reasons as everywhere else). The size cap
  // also stops someone making scrypt hash a huge "password".
  if (
    typeof username !== 'string' || typeof password !== 'string' ||
    !username.trim() || !password ||
    username.length > 100 || password.length > 200
  ) {
    return res.status(400).json({ error: 'Enter your username and password.' });
  }

  if (!(await checkCredentials(username.trim(), password))) {
    recordFailure(req.ip);
    // Never say WHICH one was wrong: that would confirm a correct username.
    return res.status(401).json({ error: 'Wrong username or password.' });
  }

  failures.delete(req.ip); // a successful login wipes the slate clean
  const { token, expiresAt } = await createSession(process.env.PRESENTER_USERNAME);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  // The token goes ONLY in the cookie, never in the JSON, so page scripts never see it.
  res.json({ loggedIn: true, username: process.env.PRESENTER_USERNAME });
});

// ─────────────────────────────────────────────────────────────
// GET /api/auth/me  →  "am I logged in?"
// Always 200, so the app can ask on every page load without errors in the console.
// ─────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const session = await getPresenterSession(req);
  res.json(session ? { loggedIn: true, username: session.username } : { loggedIn: false });
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/logout  →  end this session (safe to call when logged out)
// ─────────────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  const session = await getPresenterSession(req);
  if (session) {
    await deleteSession(readCookie(req.get('Cookie'), SESSION_COOKIE));
    disconnectPresenterSession(session._id); // any open big screens stop getting live updates
  }
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions()); // same options, or the browser keeps it
  res.json({ loggedIn: false });
});

export default router;
