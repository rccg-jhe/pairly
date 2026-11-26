// Smoke test: runs a whole Pairly session against a RUNNING server and checks
// every rule along the way, including the security ones.
//
//   npm run dev            (terminal 1)
//   npm run smoke          (terminal 2)
//
// It logs in as the presenter (username from backend/.env; it asks for the
// password, or reads PRESENTER_PASSWORD if you set it), creates ONE test room
// in whatever database the server uses, and deletes that room (and everyone
// in it) at the end, even if a check fails.
// Exit code 0 = all good, 1 = something failed (handy for CI later).
import { io } from 'socket.io-client';
import { ask, closePrompt } from './prompt.js';

const API = process.env.API_URL || 'http://localhost:3000';
let failures = 0;

function check(condition, label) {
  console.log(condition ? `  ✓ ${label}` : `  ✗ FAIL ${label}`);
  if (!condition) failures++;
}

// Returns { status, body }. Kept separate on purpose: room bodies have their
// own "status" field ("open"/"drawn"), which must not be mixed up with HTTP's.
// cookie: send a presenter login cookie (a browser does this by itself).
async function call(method, path, { token, cookie, body } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(cookie && { Cookie: cookie }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})), setCookie: res.headers.get('set-cookie') };
}

const join = (code, name) => call('POST', `/rooms/${code}/join`, { body: { name } });

// Connects a socket and resolves with 'connected' or the refusal message.
function trySocket(auth, cookie) {
  return new Promise((resolve) => {
    const socket = io(API, { auth, reconnection: false, ...(cookie && { extraHeaders: { Cookie: cookie } }) });
    socket.on('connect', () => { socket.close(); resolve('connected'); });
    socket.on('connect_error', (err) => { socket.close(); resolve(err.message); });
  });
}

let room;
let presenter; // the login cookie (pairly_session=…)
try {
  console.log(`Smoke test against ${API}\n`);

  console.log('Server');
  const health = await call('GET', '/health');
  check(health.status === 200 && health.body.db === 'connected', 'server up, database connected');

  console.log('Presenter login');
  const username = process.env.PRESENTER_USERNAME || (await ask('Presenter username: '));
  const password = process.env.PRESENTER_PASSWORD || (await ask(`Password for ${username} (hidden): `, { hidden: true }));
  closePrompt();
  check((await call('GET', '/auth/me')).body.loggedIn === false, 'not logged in without a cookie');
  check((await call('POST', '/rooms', { body: { description: 'x' } })).body.code === 'LOGIN_REQUIRED', 'create room without logging in → 401');
  check((await call('GET', '/rooms')).status === 401, 'list rooms without logging in → 401');
  check((await call('POST', '/auth/login', { body: { username, password: { $ne: null } } })).status === 400, 'password as an object → 400');
  check((await call('POST', '/auth/login', { body: { username, password: password + 'x' } })).status === 401, 'wrong password → 401');
  const login = await call('POST', '/auth/login', { body: { username, password } });
  check(login.status === 200, 'right username and password → logged in');
  check(/HttpOnly/i.test(login.setCookie ?? '') && /SameSite=Strict/i.test(login.setCookie ?? ''), 'cookie is HttpOnly and SameSite=Strict');
  presenter = login.setCookie?.split(';')[0]; // "pairly_session=…": all a browser would send back
  if (login.status !== 200 || !presenter) throw new Error('Cannot continue without logging in.');
  check(!JSON.stringify(login.body).includes(presenter.split('=')[1]), 'session token is NOT in the JSON');
  check((await call('GET', '/auth/me', { cookie: presenter })).body.loggedIn === true, 'logged in with the cookie');
  check((await call('GET', '/auth/me', { cookie: 'pairly_session=forged' })).body.loggedIn === false, 'made-up cookie → not logged in');

  console.log('Create room');
  check((await call('POST', '/rooms', { cookie: presenter, body: {} })).status === 400, 'missing description → 400');
  const created = await call('POST', '/rooms', { cookie: presenter, body: { description: '  Smoke   test room  ' } });
  room = created.body;
  check(created.status === 201 && room.description === 'Smoke test room', 'created, description cleaned up');
  check((await call('GET', '/rooms', { cookie: presenter })).body.rooms?.[0]?.code === room.code, "room is first in the presenter's list");

  console.log('Join');
  const people = {};
  for (const name of ['Ada', 'Bo', 'Cy', 'Di']) people[name] = (await join(room.code, name)).body;
  check(Object.values(people).every((p) => /^\d{4}$/.test(p.pin) && p.token), '4 people joined with 4-digit PINs');
  check(new Set(Object.values(people).map((p) => p.pin)).size === 4, 'all PINs unique');
  check((await join(room.code, 'ADA')).status === 409, 'duplicate name (any case) → 409');
  check((await join(room.code, { $ne: null })).status === 400, 'name as an object → 400');
  check((await join('ZZZZ', 'Eve')).status === 404, 'unknown room → 404');

  console.log('Security');
  const key = presenter;
  check((await call('GET', `/rooms/${room.code}/presenter`)).status === 401, 'presenter view without logging in → 401');
  check((await call('GET', `/rooms/${room.code}/presenter`, { token: people.Ada.token })).status === 401, 'participant token instead of login → 401');
  check((await call('POST', `/rooms/${room.code}/draw`, { token: people.Ada.token })).status === 401, 'participant cannot shuffle → 401');
  check((await trySocket({ role: 'presenter', roomCode: room.code })) === 'login required', 'live link as presenter without logging in → refused');
  check((await trySocket({ role: 'presenter', roomCode: room.code }, key)) === 'connected', 'live link as presenter when logged in → connected');
  check((await call('GET', '/participants/me', { token: 'not-a-real-token' })).status === 401, 'fake participant token → 401');
  const view = (await call('GET', `/rooms/${room.code}/presenter`, { cookie: key })).body;
  check(view.participants.every((p) => Object.keys(p).sort().join() === 'assigned,id,name'), 'presenter view: only id, name, assigned');

  console.log('Shuffle');
  // Listen like a phone, to check what the storm broadcast contains.
  const phone = io(API, { auth: { role: 'participant', token: people.Bo.token }, reconnection: false });
  const storm = new Promise((resolve) => phone.on('room:shuffling', resolve));
  await new Promise((resolve) => phone.on('connect', resolve));
  await call('POST', `/rooms/${room.code}/shuffle-start`, { cookie: key, body: { durationMs: 0 } });
  const stormData = await storm;
  phone.close();
  check(Object.keys(stormData).sort().join() === 'durationMs,names' && stormData.names.length === 4, 'phones get only { names, durationMs }');
  check((await call('GET', `/rooms/${room.code}/presenter`, { cookie: key })).body.status === 'open', 'shuffle-start assigns nobody');

  check((await call('POST', `/rooms/${room.code}/draw`, { cookie: key })).body.assignedCount === 4, 'draw assigns all 4');
  const results = {};
  for (const [name, p] of Object.entries(people)) results[name] = (await call('GET', '/participants/me', { token: p.token })).body;
  const pins = Object.fromEntries(Object.entries(people).map(([n, p]) => [n, p.pin]));
  check(Object.entries(results).every(([n, r]) => r.assigned && r.assignedPin !== pins[n]), 'everyone assigned, nobody got themselves');
  check(new Set(Object.values(results).map((r) => r.assignedPin)).size === 4, 'every PIN picked exactly once');
  // Each person's response, minus their own name, must not mention anyone else's name.
  const noOtherNames = Object.entries(results).every(([me, result]) => {
    const { name: _ownName, ...rest } = result;
    const text = JSON.stringify(rest);
    return Object.keys(people).filter((other) => other !== me).every((other) => !text.includes(other));
  });
  check(noOtherNames, "no response contains another person's name");
  check((await call('POST', `/rooms/${room.code}/draw`, { cookie: key })).status === 409, 'second draw without redraw → 409');

  console.log("Presenter's PIN list");
  check((await call('GET', `/rooms/${room.code}/pins`)).status === 401, 'PIN list without logging in → 401');
  check((await call('GET', `/rooms/${room.code}/pins`, { token: people.Ada.token })).status === 401, 'participant token cannot read the PIN list → 401');
  const pinList = await call('GET', `/rooms/${room.code}/pins`, { cookie: key });
  check(
    pinList.body.participants?.every((p) => Object.keys(p).sort().join() === 'assigned,giftPin,id,name,pin'),
    'PIN list: only id, name, pin, assigned, giftPin (no tokens, no receiver names)'
  );
  check(
    pinList.body.participants.every((p) => p.pin === pins[p.name] && p.giftPin === results[p.name].assignedPin),
    "PIN list matches what each phone shows"
  );

  console.log('Late joiner + re-shuffle');
  people.Eve = (await join(room.code, 'Eve')).body;
  check((await call('GET', '/participants/me', { token: people.Eve.token })).body.assigned === false, 'late joiner: not assigned');
  check((await call('POST', `/rooms/${room.code}/draw`, { cookie: key, body: { redraw: true } })).body.assignedCount === 5, 're-shuffle includes all 5');
  check((await call('GET', '/participants/me', { token: people.Eve.token })).body.assigned === true, 'late joiner now assigned');

  console.log('Leaving and removing');
  const left = await call('DELETE', '/participants/me', { token: people.Eve.token });
  check(left.status === 200 && left.body.unassigned === 1, 'Eve leaves → the person looking for her becomes unassigned');
  check((await call('GET', '/participants/me', { token: people.Eve.token })).status === 401, "Eve's token stops working");
  const after = (await call('GET', `/rooms/${room.code}/presenter`, { cookie: key })).body;
  check(after.participantCount === 4 && after.participants.filter((p) => !p.assigned).length === 1, 'presenter: 4 left, 1 not assigned');
  const di = after.participants.find((p) => p.name === 'Di');
  check((await call('DELETE', `/rooms/${room.code}/participants/not-an-id`, { cookie: key })).status === 404, 'remove with a bad id → 404 (not a crash)');
  check((await call('DELETE', `/rooms/${room.code}/participants/${di.id}`, { token: people.Ada.token })).status === 401, 'participant cannot remove people → 401');
  check((await call('DELETE', `/rooms/${room.code}/participants/${di.id}`, { cookie: key })).status === 200, 'presenter removes Di');

  console.log('Limits');
  const huge = await call('POST', '/rooms', { cookie: key, body: { description: 'x'.repeat(20000) } });
  check(huge.status === 413, 'request body over 10 kb → 413');
} catch (err) {
  failures++;
  console.error('\nThe smoke test crashed:', err.message);
} finally {
  // Always clean up the test room, pass or fail.
  if (room?.code && presenter) {
    const deleted = await call('DELETE', `/rooms/${room.code}`, { cookie: presenter });
    console.log(`\nCleanup: test room ${room.code} ${deleted.status === 200 ? 'deleted' : `NOT deleted (HTTP ${deleted.status})`}`);
  }
  if (presenter) {
    await call('POST', '/auth/logout', { cookie: presenter });
    check((await call('GET', '/auth/me', { cookie: presenter })).body.loggedIn === false, 'after logging out, the old cookie no longer works');
  }
  console.log(failures === 0 ? '\nAll checks passed ✅' : `\n${failures} check(s) failed ❌`);
  process.exit(failures === 0 ? 0 : 1);
}
