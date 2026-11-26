// "Who are you, and are you allowed?" checks, written as Express middleware.
// A route lists these BEFORE its handler, e.g.:
//   router.post('/:code/draw', requirePresenter, handler)
// If the check fails, the middleware responds with an error and the handler never runs.
import { Room } from '../models/Room.js';
import { Participant } from '../models/Participant.js';
import { findSession, SESSION_COOKIE } from '../services/presenterAuth.js';
import { readCookie } from '../utils/cookies.js';

// Reads a secret from the standard header:  Authorization: Bearer <secret>
// We use a header, not the URL (?key=...), because URLs end up in browser
// history, server logs and screenshots of the big screen.
function getBearerToken(req) {
  const header = req.get('Authorization') ?? '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

// Finds the presenter's login session from the cookie the browser sends
// automatically (see services/presenterAuth.js). null = not logged in.
export function getPresenterSession(req) {
  return findSession(readCookie(req.get('Cookie'), SESSION_COOKIE));
}

// The answer for "you need to log in". The `code` lets the React app tell this
// apart from other 401s and show the login form.
function loginRequired(res) {
  return res.status(401).json({ error: 'Please log in as the presenter.', code: 'LOGIN_REQUIRED' });
}

// Only a logged-in presenter gets through (e.g. to create or list rooms).
// On success it attaches the session to req.presenterSession.
export async function requireLogin(req, res, next) {
  const session = await getPresenterSession(req);
  if (!session) return loginRequired(res);
  req.presenterSession = session;
  next(); // checks passed: continue to the route handler
}

// For routes about ONE room (/api/rooms/:code/...): the presenter must be
// logged in, and the room must exist.
// On success it attaches the room to req.room so the handler doesn't load it again.
export async function requirePresenter(req, res, next) {
  const session = await getPresenterSession(req);
  if (!session) {
    // 401 = "Unauthorized": you didn't prove who you are
    return loginRequired(res);
  }

  const room = await Room.findOne({ code: req.params.code.toUpperCase() });
  if (!room) {
    return res.status(404).json({ error: 'Room not found.' });
  }

  req.presenterSession = session;
  req.room = room;
  next();
}

// Only a participant holding a valid token gets through.
// On success it attaches the participant to req.participant.
export async function requireParticipant(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Participant token required.' });
  }

  // The token field is unique and indexed, so this lookup is fast.
  const participant = await Participant.findOne({ token });
  if (!participant) {
    return res.status(401).json({ error: 'Unknown participant. Please join the room again.' });
  }

  req.participant = participant;
  next();
}
