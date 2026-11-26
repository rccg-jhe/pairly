// Remembers a participant's session in the browser, so refreshing the page
// (or the phone going to sleep) doesn't lose their place.
//
// localStorage = a small key/value store inside the browser that survives
// page reloads and restarts. It belongs to this website on this device only.
//
// Every access is wrapped in try/catch: in private browsing or with storage
// blocked, localStorage can throw, and the app should keep working anyway.
//
// (The presenter used to keep a secret key here. Presenters now log in, and
// their session lives in an httpOnly cookie that JavaScript can't touch.)

// ── Participant session ──────────────────────────────────────
// One phone = one participant, so we keep a single entry.
// Stored as JSON text, because localStorage can only hold strings.
const PARTICIPANT = 'pairly:participant'

// session = { token, roomCode, name, pin }
export function saveParticipant(session) {
  try {
    localStorage.setItem(PARTICIPANT, JSON.stringify(session))
  } catch {
    // storage unavailable: works until the page is refreshed
  }
}

export function getParticipant() {
  try {
    const raw = localStorage.getItem(PARTICIPANT)
    const session = raw ? JSON.parse(raw) : null
    // Only trust it if it has the shape we expect (it could be old or edited).
    return session && typeof session.token === 'string' ? session : null
  } catch {
    return null // missing, blocked, or not valid JSON
  }
}

export function clearParticipant() {
  try {
    localStorage.removeItem(PARTICIPANT)
  } catch {
    // nothing to clear
  }
}
