// Real-time layer: pushes updates to browsers the moment something happens,
// instead of browsers asking "anything new?" over and over.
import { Server } from 'socket.io';
import { Room } from '../models/Room.js';
import { Participant } from '../models/Participant.js';
import { findSession, SESSION_COOKIE } from '../services/presenterAuth.js';
import { readCookie } from '../utils/cookies.js';

// The Socket.io server. Set once by initSocket(), used by the emit helpers below.
let io = null;

// Socket.io "rooms" are named channels. We have two per Pairly room:
//   presenter:<roomId>  → only the presenter's screen listens here
//   room:<roomId>       → every participant's phone listens here
// (Don't mix up Socket.io "rooms" (channels) with our Pairly Room model!)
const presenterChannel = (roomId) => `presenter:${roomId}`;
const participantsChannel = (roomId) => `room:${roomId}`;
// One private channel per participant, so the server can talk to ONE phone
// (e.g. "you have been removed") without telling anyone else.
const personalChannel = (participantId) => `participant:${participantId}`;
// One channel per presenter login, so logging out can disconnect its screens.
const sessionChannel = (sessionId) => `session:${sessionId}`;

export function initSocket(httpServer) {
  io = new Server(httpServer);

  // ── Connection middleware: runs ONCE when a browser tries to connect. ──
  // Same idea as Express middleware: check who they are, or refuse.
  // The browser says who it is in `auth` when connecting, e.g.
  //   io(url, { auth: { role: 'presenter', roomCode: 'XK4P' } })
  //   io(url, { auth: { role: 'participant', token: '…' } })
  // A presenter proves it with the login cookie, which the browser sends
  // with the connection automatically (it's the same website).
  io.use(async (socket, next) => {
    try {
      const { role, roomCode, token } = socket.handshake.auth ?? {};

      if (role === 'presenter') {
        const session = await findSession(readCookie(socket.handshake.headers.cookie, SESSION_COOKIE));
        if (!session) {
          // A different message from 'unauthorized', so the page can show the login form.
          return next(new Error('login required'));
        }
        // typeof checks matter! The client controls this data. Without them,
        // someone could send { roomCode: { $ne: null } } and try to trick
        // the database query (a "NoSQL injection").
        if (typeof roomCode !== 'string') {
          return next(new Error('unauthorized'));
        }
        const room = await Room.findOne({ code: roomCode.toUpperCase() });
        if (!room) {
          return next(new Error('unauthorized'));
        }
        // socket.data is a place to remember things about this connection.
        socket.data = { role, roomId: room._id.toString(), sessionId: session._id.toString() };
      } else if (role === 'participant') {
        if (typeof token !== 'string') {
          return next(new Error('unauthorized'));
        }
        const participant = await Participant.findOne({ token });
        if (!participant) {
          return next(new Error('unauthorized'));
        }
        socket.data = {
          role,
          roomId: participant.room.toString(),
          participantId: participant._id.toString(),
        };
      } else {
        return next(new Error('unauthorized'));
      }

      next(); // allowed: the connection opens
    } catch (err) {
      console.error('Socket auth error:', err);
      next(new Error('server error'));
    }
  });

  // ── Runs after a connection passes the check above. ──
  io.on('connection', (socket) => {
    const { role, roomId, participantId, sessionId } = socket.data;
    // Put this connection in the right channel(s), so it ONLY hears messages
    // meant for it. A phone never joins the presenter channel.
    if (role === 'presenter') {
      // The session channel lets "Log out" hang up this screen's live link too.
      socket.join([presenterChannel(roomId), sessionChannel(sessionId)]);
    } else {
      socket.join([participantsChannel(roomId), personalChannel(participantId)]);
    }
  });
}

// ── Helpers the HTTP routes call after they change something. ──
// The `io?.` means "do nothing if sockets aren't set up". That keeps
// scripts and tests that don't start the socket server working.

// Someone joined → tell the presenter's screen, so the name appears instantly.
export function emitParticipantJoined(roomId, participant) {
  io?.to(presenterChannel(roomId.toString())).emit('participant:joined', {
    id: participant._id,
    name: participant.name,
    assigned: false, // a new joiner never has an assignment yet
  });
}

// The draw happened → tell everyone in the room.
// IMPORTANT: the message to phones carries NO assignment data. A broadcast goes
// to many devices, so it must never contain anyone's secret. Each phone reacts
// by calling GET /api/participants/me with its OWN token to fetch its own PIN.
export function emitRoomDrawn(roomId, assignedCount) {
  const id = roomId.toString();
  io?.to(presenterChannel(id)).emit('room:drawn', { assignedCount });
  io?.to(participantsChannel(id)).emit('room:drawn');
}

// The presenter clicked Shuffle → start the name storm on every phone.
// What phones receive: ONLY the list of names (already on the big screen for
// everyone to see) and how long the storm lasts. No ids, no PINs, no pairs,
// and at this moment no pairs even exist yet.
export function emitRoomShuffling(roomId, names, durationMs) {
  io?.to(participantsChannel(roomId.toString())).emit('room:shuffling', { names, durationMs });
}

// The presenter deleted the room → tell every screen, then hang up on them.
// Order matters: send the message FIRST, then disconnect, or nobody hears it.
export function emitRoomDeleted(roomId) {
  const id = roomId.toString();
  for (const channel of [presenterChannel(id), participantsChannel(id)]) {
    io?.to(channel).emit('room:deleted');
    io?.in(channel).disconnectSockets(); // their tokens no longer work anyway
  }
}

// A participant left (or was removed by the presenter).
//  - The presenter's list drops their name.
//  - Their own phone(s) are told, then disconnected: the token no longer works.
export function emitParticipantRemoved(roomId, participantId) {
  const id = participantId.toString();
  io?.to(presenterChannel(roomId.toString())).emit('participant:left', { id });
  io?.to(personalChannel(id)).emit('participant:removed');
  io?.in(personalChannel(id)).disconnectSockets();
}

// The presenter logged out → hang up every live connection made with that login.
export function disconnectPresenterSession(sessionId) {
  io?.in(sessionChannel(sessionId.toString())).disconnectSockets();
}
