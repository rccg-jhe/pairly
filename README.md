# Pairly

A live room app for secret pairings, like Secret Santa with a big screen.

1. The **presenter** logs in, creates a room with a short description and shows the room code on a big screen.
2. **Participants** join on their phones with the code and their name. Each gets a unique random 4-digit PIN.
3. Names appear live on the big screen.
4. The presenter clicks **Shuffle**. A "name storm" swirls on the big screen and on every phone, then each person is assigned exactly one other person: nobody gets themselves and nobody is picked twice.
5. Each participant sees **only the PIN** of the person they must find, never a name. Assignments never leave the server.

Stack: React (Vite) · Node.js + Express · MongoDB (Mongoose) · Socket.io

---

## Getting started

### 1. Requirements
- **Node.js 22 or newer** (the backend reads `.env` with Node's built-in `--env-file` flag)
- **MongoDB Atlas** (the free tier is fine): [mongodb.com/atlas](https://www.mongodb.com/atlas). Pairly saves each shuffle in a **transaction** (all matches or none), and MongoDB only allows transactions on a replica set, which every Atlas cluster is. A plain local `mongod` is refused at start-up with a clear message.

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env      # then edit .env
npm run dev               # http://localhost:3000
```
`backend/.env`:
```
PORT=3000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/pairly
PRESENTER_USERNAME=…        ← filled in by npm run set-password
PRESENTER_PASSWORD_HASH=…   ← filled in by npm run set-password
```
Use your cluster's connection string (Atlas → Connect → Drivers) and **put a database name after the host**, e.g. `…mongodb.net/pairly`. Without one, MongoDB uses a database called `test`.

Expected output:
```
MongoDB connected: pairly
Pairly server listening on http://localhost:3000
```

### 2b. The presenter login
There is **no sign-up page**: the one presenter account is set on the server.
```bash
cd backend
npm run set-password      # asks for a username and a password (hidden), saves them to .env
```
Then restart the backend. It saves a **hash** of the password (scrypt), never the password itself. Run it again to change the password: that logs out every device that was logged in with the old one. If it isn't set up, the server prints a warning and the login form says so.

### 3. Frontend (in a second terminal)
```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```
Vite forwards `/api` and `/socket.io` to the backend (see `frontend/vite.config.js`), so the browser only ever talks to one address. If the backend runs somewhere else: `BACKEND_URL=http://localhost:4000 npm run dev`.

### 4. Using it with real phones
Phones must be on the **same Wi-Fi** as the computer running Pairly.

1. Vite prints a **Network** address, e.g. `http://192.168.1.20:5173`.
2. Open the presenter screen with that address: `http://192.168.1.20:5173/present`. The "Join at" link on the big screen then works from phones. (`localhost` on a phone means the phone itself.)
3. If phones can't connect, allow incoming connections for Node when macOS or your firewall asks.

---

## Scripts

| Where | Command | What it does |
|---|---|---|
| backend | `npm run dev` | Start the API, restarting when files change |
| backend | `npm start` | Start the API (no auto-restart) |
| backend | `npm run set-password` | Set or change the presenter's username and password |
| backend | `npm test` | Unit tests: the draw algorithm and text cleaning (no database needed) |
| backend | `npm run smoke` | Full end-to-end check against a **running** server (see below) |
| backend | `npm run try-realtime` | Acts out a whole session in the terminal, printing the live events |
| backend | `npm run try-models` | Playground for the database models |
| frontend | `npm run dev` | Start the React app |
| frontend | `npm run build` | Production build into `frontend/dist` |
| frontend | `npm run lint` | Check the code with ESLint |

### The smoke test
```bash
cd backend
npm run dev            # terminal 1
npm run smoke          # terminal 2
```
It runs about 45 checks against the server: the presenter login, creating and joining, duplicate names, every security rule, the shuffle rules, re-shuffle, leaving and removing, and the request-size limit. It logs in with the username from `.env` and asks for the password (or set `PRESENTER_PASSWORD=… npm run smoke`). It creates **one** room in whatever database the server uses and **deletes it at the end**, even if a check fails. Exit code `0` means everything passed. To point it at another server: `API_URL=http://host:port npm run smoke`.

---

## How it works

### Pages

| URL | Who | What |
|---|---|---|
| `/` | everyone | Home: host or join |
| `/present` | presenter 🔒 | Describe and create a room, or reopen one of your rooms |
| `/present/:code` | presenter 🔒 | The big screen: QR code, join link, room code, description, a live word cloud of names with Shuffle / Re-shuffle in the middle (click a name to remove that person), delete room |
| `/present/:code/pins` | presenter 🔒 | **Private** help desk: every name, their own PIN, the PIN for their gift, and Assigned / Not assigned. PINs hidden until clicked; searchable. Opens in a new tab from the big screen; never project it |
| `/join` or `/join/:code` | participant | Enter the code (pre-filled from a link) and a name |
| `/result` | participant | Your PIN, then the PIN you need to find (tap to reveal) |

🔒 = shows the login form until you log in. Participants never need to log in.

### API

🔑 = logged-in presenter (the `pairly_session` cookie, which the browser sends by itself) · 🎟 = participant token, sent as `Authorization: Bearer <token>` (returned once, when joining)

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | Server and database status |
| `POST /api/auth/login` | none | Body `{ username, password }`. Sets the session cookie. 10 wrong tries per device → locked for 15 minutes |
| `GET /api/auth/me` | none | `{ loggedIn, username }` |
| `POST /api/auth/logout` | none | Ends the session and disconnects its live screens |
| `GET /api/rooms` | 🔑 | The 50 newest rooms, with descriptions and head counts |
| `POST /api/rooms` | 🔑 | Create a room. Body `{ description }` (1–120 characters). Returns its `code` |
| `POST /api/rooms/:code/join` | none | Join. Body `{ name }` (1–40 characters, unique in the room ignoring case). Returns your `pin` and `token` |
| `GET /api/rooms/:code/presenter` | 🔑 | Names with Assigned / Not assigned. No PINs, no pairs |
| `GET /api/rooms/:code/pins` | 🔑 | For the private PIN list: each person's `name`, `pin`, `assigned` and `giftPin`. No tokens, no receiver names. Sent with `Cache-Control: no-store` |
| `POST /api/rooms/:code/shuffle-start` | 🔑 | Starts the name storm on every phone. Assigns nobody. Body `{ durationMs?, redraw? }` |
| `POST /api/rooms/:code/draw` | 🔑 | The real shuffle. Body `{ redraw: true }` to shuffle an already-shuffled room again |
| `DELETE /api/rooms/:code/participants/:id` | 🔑 | Remove one person |
| `DELETE /api/rooms/:code` | 🔑 | Delete the room and everyone in it |
| `GET /api/participants/me` | 🎟 | Your own status and, once shuffled, only your match's PIN |
| `DELETE /api/participants/me` | 🎟 | Leave the room |

### Live events (Socket.io)

Connections authenticate when they connect: `auth: { role: 'presenter', roomCode }` plus the login cookie, or `auth: { role: 'participant', token }`. Each connection only joins the channels it's allowed to hear.

| Event | Sent to | Contains |
|---|---|---|
| `participant:joined` | presenter | `{ id, name, assigned: false }` |
| `participant:left` | presenter | `{ id }` |
| `room:shuffling` | phones | `{ names, durationMs }` (names only) |
| `room:drawn` | presenter, phones | presenter: `{ assignedCount }`. Phones: **nothing**, so each phone fetches `/participants/me` with its own token |
| `participant:removed` | that one phone | nothing |
| `room:deleted` | presenter, phones | nothing |

### The draw
`backend/services/draw.js` shuffles everyone (Fisher–Yates with `crypto.randomInt`) and joins the line into **one circle**: each person finds the next. That guarantees no self-matches and no one picked twice, and it never needs a retry. `npm test` checks the rules over thousands of runs, plus statistical tests that the result is fair.

### Security model
- **Presenter login, no sign-up:** one account, set on the server with `npm run set-password`. Only a scrypt **hash** of the password is stored. Logging in creates a session that lasts 12 hours; the database stores only a hash of its token.
- **The session cookie** is `httpOnly` (page JavaScript can't read it, so injected scripts can't steal it), `SameSite=Strict` (other websites can't make requests with it), and `Secure` in production (HTTPS only).
- **Guessing is slowed down:** 10 wrong passwords from one device lock it out for 15 minutes. The error never says whether the username or the password was wrong.
- **The page guard is only for comfort.** Hiding the presenter pages in React isn't what protects them: every presenter API call and live connection is checked on the server.
- **Participant tokens** are long random values, sent only once when joining and hidden from database queries by default (`select: false`).
- **PINs are not secrets.** They're for finding people, never for proving identity.
- **Least privilege:** the projected presenter screen gets names and statuses only. PINs and gift PINs are only on the separate, private PIN list page, so the host can help people, and are never on the big screen. A participant gets their own data plus one PIN. Broadcasts never carry assignments.
- **No IDs in "me" URLs:** `/participants/me` works out who you are from your token, so nobody can read another person's result by changing a URL.
- **Validation everywhere:** types are checked before any database query, which blocks `{ "$ne": null }`-style injection. Text is cleaned and length-limited, request bodies are capped at 10 kb, and rooms at 500 people.
- **Races are handled by the database:** unique indexes and conditional updates, not "check, then save".
- **All or nothing:** a shuffle (claiming the room + writing every match) and removing a person (clearing their finder's match + deleting them) each run in one MongoDB transaction. If anything fails, nothing is saved, so a failed re-shuffle can't leave a mix of old and new matches. A shuffle and a removal at the same moment can't leave someone matched to a person who has gone: MongoDB detects the clash and retries one of them.

---

## Project structure
```
backend/
  app.js                 Express + Socket.io server, error handling
  config/db.js           MongoDB connection
  models/                Room, Participant (Mongoose schemas)
  routes/                rooms.js, participants.js (the API)
  middleware/auth.js     requireLogin / requirePresenter / requireParticipant
  routes/auth.js         presenter login, logout, "am I logged in?"
  services/              draw.js (the algorithm), participants.js (remove logic),
                         presenterAuth.js (password hashing, sessions, cookie settings)
  realtime/socket.js     Socket.io auth, channels and events
  utils/generate.js      codes, PINs, tokens, text cleaning
  tests/                 unit tests (node --test)
  scripts/               smoke test and playgrounds
frontend/src/
  pages/                 one component per URL
  components/            Layout, NameStorm, ConfirmDialog, ErrorBoundary, …
  hooks/                 usePresenterRoom, useParticipantStatus (fetch + live updates)
  auth/                  AuthProvider + useAuth: "is the presenter logged in?"
  api.js                 one fetch helper for the whole app
  storage.js             the participant's session in localStorage
```

---

## Known limitations / before going to production
- **One presenter account.** Everyone who knows the password sees every room. Separate accounts would need a users collection.
- **Log out on shared computers.** A session lasts 12 hours on the device that logged in.
- **The login attempt counter lives in memory**, so restarting the server resets it.
- **No rate limiting yet.** Only the login is limited. Add limits to the other routes (e.g. `express-rate-limit`) before putting Pairly on the public internet. Be careful: at an event, every phone on the venue Wi-Fi may share **one** IP address, so per-IP limits on joining must be generous.
- **Needs MongoDB Atlas (or another replica set).** Shuffles use transactions, which a standalone local MongoDB doesn't support. The server checks this when it starts.
- **One server only.** Socket.io keeps its channels in memory. Running several backend servers would need a shared adapter (e.g. Redis).
- **Old rooms are never cleaned up automatically.** Presenters can delete rooms. A scheduled clean-up (or a MongoDB TTL index) would tidy up forgotten ones.
- **HTTPS:** serve it over HTTPS in production (and set `NODE_ENV=production` so the cookie is `Secure`), because passwords, cookies and tokens travel with each request.
- **Behind a real proxy** (nginx, a hosting platform), update `trust proxy` in `backend/app.js`, which currently trusts only Vite on the same computer, or the login limit will see one address for everyone.
