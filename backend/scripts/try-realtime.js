// A playground that acts out a whole Pairly session, so you can SEE the
// real-time messages before we build the React screens.
// Start the server first (npm run dev), then in another terminal: npm run try-realtime
import { io } from 'socket.io-client';
import { ask, closePrompt } from './prompt.js';

const API = process.env.API_URL || 'http://localhost:3000';

// Small helper for HTTP calls.
// cookie: the presenter's login cookie (a browser sends it by itself).
async function call(method, path, { token, cookie, body } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(cookie && { Cookie: cookie }),
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
  });
  if (path === '/auth/login') return res.headers.get('set-cookie')?.split(';')[0]; // "pairly_session=…"
  return res.json();
}

// Connects a socket and resolves once it's in (or rejects if refused).
function connect(auth, cookie) {
  return new Promise((resolve, reject) => {
    const socket = io(API, { auth, reconnection: false, ...(cookie && { extraHeaders: { Cookie: cookie } }) });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => {
      socket.close();
      reject(err);
    });
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 0. The presenter logs in (username from .env; set PRESENTER_PASSWORD to skip the question).
const username = process.env.PRESENTER_USERNAME || (await ask('Presenter username: '));
const password = process.env.PRESENTER_PASSWORD || (await ask(`Password for ${username} (hidden): `, { hidden: true }));
closePrompt();
const cookie = await call('POST', '/auth/login', { body: { username, password } });
if (!cookie) {
  console.error('Login failed: check the username and password.');
  process.exit(1);
}

// 1. The presenter creates a room and opens a live connection.
const room = await call('POST', '/rooms', { cookie, body: { description: 'Try-realtime demo room' } });
console.log(`Room ${room.code} created`);
const presenter = await connect({ role: 'presenter', roomCode: room.code }, cookie);
console.log('📺 Presenter connected\n');

presenter.on('participant:joined', (p) => console.log(`📺 Presenter screen: "${p.name}" joined`));
presenter.on('room:drawn', (data) => console.log(`📺 Presenter screen: shuffle done!`, data));

// 2. Three people join, one at a time. Each phone also opens a live connection.
const phones = [];
for (const name of ['Ada', 'Bo', 'Cy']) {
  const me = await call('POST', `/rooms/${room.code}/join`, { body: { name } });
  const socket = await connect({ role: 'participant', token: me.token });

  // When the shuffle happens, the phone receives a ping with NO data,
  // then fetches its own result over HTTP using its own token.
  socket.on('room:drawn', async (data) => {
    const result = await call('GET', '/participants/me', { token: me.token });
    console.log(`📱 ${name}'s phone: ping received (data: ${JSON.stringify(data)}) → I must find PIN ${result.assignedPin}`);
  });
  // Phones should NEVER hear presenter-only events.
  socket.on('participant:joined', () => console.log(`🚨 ${name}'s phone heard a presenter-only event!`));

  phones.push(socket);
  await wait(300);
}

// 3. Someone tries to connect as the presenter without logging in. They should be refused.
try {
  await connect({ role: 'presenter', roomCode: room.code });
  console.log('🚨 Fake presenter got in!');
} catch (err) {
  console.log(`\n🔒 Fake presenter refused: ${err.message}`);
}

// 4. The presenter clicks Shuffle.
console.log('\n📺 Presenter clicks Shuffle…');
await call('POST', `/rooms/${room.code}/draw`, { cookie });

// Give the messages a moment to arrive, then hang up everything.
await wait(1000);
presenter.close();
phones.forEach((s) => s.close());

// Tidy up: delete the demo room, then log out.
await call('DELETE', `/rooms/${room.code}`, { cookie });
await call('POST', '/auth/logout', { cookie });
console.log(`\nDemo room ${room.code} deleted, logged out.`);
