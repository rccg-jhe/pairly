import { Router } from 'express';
import mongoose from 'mongoose';
import { Room } from '../models/Room.js';
import { Participant } from '../models/Participant.js';
import {
  generateRoomCode,
  generatePin,
  generateToken,
  isDuplicateKeyError,
  cleanText,
} from '../utils/generate.js';
import { requireLogin, requirePresenter } from '../middleware/auth.js';
import { createDraw } from '../services/draw.js';
import { removeParticipant } from '../services/participants.js';
import {
  emitParticipantJoined,
  emitRoomDrawn,
  emitRoomShuffling,
  emitRoomDeleted,
} from '../realtime/socket.js';

// A Router is a mini-app holding a group of related routes.
// app.js mounts it at /api/rooms, so `router.post('/')` here means POST /api/rooms.
const router = Router();

// The biggest room we allow. Plenty for an event, and it keeps the shuffle,
// the storm and the presenter's list fast (there are 10,000 PINs in total).
const MAX_PARTICIPANTS = 500;

// ─────────────────────────────────────────────────────────────
// GET /api/rooms  →  the presenter's list of rooms, newest first
// Needs: presenter login (the session cookie)
// Lets the presenter reopen a room from ANY device after logging in.
// ─────────────────────────────────────────────────────────────
router.get('/', requireLogin, async (req, res) => {
  const rooms = await Room.find().sort({ createdAt: -1 }).limit(50);

  // How many people are in each room, counted by the database in ONE query
  // (an "aggregation": group the participants by room, count each group),
  // instead of one count query per room.
  const counts = await Participant.aggregate([
    { $match: { room: { $in: rooms.map((r) => r._id) } } },
    { $group: { _id: '$room', count: { $sum: 1 } } },
  ]);
  const countByRoom = new Map(counts.map((c) => [c._id.toString(), c.count]));

  res.json({
    rooms: rooms.map((r) => ({
      code: r.code,
      description: r.description,
      status: r.status,
      participantCount: countByRoom.get(r._id.toString()) ?? 0,
      createdAt: r.createdAt,
    })),
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/rooms  →  presenter creates a new room
// ─────────────────────────────────────────────────────────────
// Needs: presenter login (the session cookie)
// Body: { "description": "Youth Group Christmas: Secret Santa" }
router.post('/', requireLogin, async (req, res) => {
  // Validate the description, exactly like the participant's name in /join.
  const description = cleanText(req.body?.description);
  if (description.length < 1 || description.length > 120) {
    return res
      .status(400)
      .json({ error: 'Please describe the room (1–120 characters), so people know it is the right one.' });
  }

  // A random code might already be in use. Rare, but possible. We let the
  // database's unique index catch it, then try again with a new code.
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const room = await Room.create({
        code: generateRoomCode(),
        description,
      });

      // 201 = "Created"
      return res.status(201).json({
        code: room.code,
        description: room.description,
        status: room.status,
      });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err; // a real error: let the error handler deal with it
      // otherwise: code collision → loop and try a new code
    }
  }
  throw new Error('Could not generate a unique room code');
});

// ─────────────────────────────────────────────────────────────
// POST /api/rooms/:code/join  →  participant joins with their name
// Body: { "name": "Ada" }
// ─────────────────────────────────────────────────────────────
router.post('/:code/join', async (req, res) => {
  // 1. Validate input. Never trust what the client sends.
  //    req.body can be undefined if no JSON was sent, hence the ?.
  const name = cleanText(req.body?.name);
  if (name.length < 1 || name.length > 40) {
    // 400 = "Bad Request": the client sent something invalid
    return res.status(400).json({ error: 'Please enter a name (1–40 characters).' });
  }

  // 2. Find the room. :code in the path is available as req.params.code.
  const room = await Room.findOne({ code: req.params.code.toUpperCase() });
  if (!room) {
    // 404 = "Not Found"
    return res.status(404).json({ error: 'Room not found. Check the code and try again.' });
  }

  // Room size limit. (Two people joining at the very same moment could take it
  // to 501. That's fine: the limit is about keeping things fast, not exact.)
  if ((await Participant.countDocuments({ room: room._id })) >= MAX_PARTICIPANTS) {
    return res.status(409).json({ error: `This room is full (${MAX_PARTICIPANTS} people).` });
  }

  // 3. Create the participant with a random PIN. Same retry idea as above:
  //    if the PIN is taken in this room, the unique index rejects it and we retry.
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const participant = await Participant.create({
        room: room._id,
        name,
        pin: generatePin(),
        token: generateToken(), // the participant's secret "ticket" for Step 5
      });

      // Real-time: make the name pop up on the presenter's screen right now.
      emitParticipantJoined(room._id, participant);

      return res.status(201).json({
        participantId: participant._id,
        roomCode: room.code,
        roomDescription: room.description,
        name: participant.name,
        pin: participant.pin,     // their OWN pin, so others can find them
        token: participant.token, // sent once; the phone stores it
      });
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      // Two different unique rules can be broken here. err.keyPattern says which.
      if (err.keyPattern?.nameKey) {
        // Same name already in this room → ask for something to tell them apart.
        return res.status(409).json({
          error: `Someone called "${name}" has already joined. Add an initial, e.g. "${name} B".`,
        });
      }
      // Otherwise it was the PIN: loop round and try another one.
    }
  }

  // 20 collisions in a row means the room is (nearly) out of PINs.
  // 409 = "Conflict"
  return res.status(409).json({ error: 'This room is full.' });
});

// ─────────────────────────────────────────────────────────────
// GET /api/rooms/:code/presenter  →  the presenter's big-screen view
// Needs: presenter login (the session cookie)
// ─────────────────────────────────────────────────────────────
router.get('/:code/presenter', requirePresenter, async (req, res) => {
  const room = req.room; // loaded and checked by requirePresenter

  const participants = await Participant.find({ room: room._id }).sort({ createdAt: 1 });

  res.json({
    code: room.code,
    description: room.description,
    status: room.status,
    drawnAt: room.drawnAt,
    participantCount: participants.length,
    // We build each object BY HAND, picking only the fields the screen needs.
    // No PINs, no tokens, no assignedTo. Even the presenter must not see who
    // got whom: the screen is shown to the whole room.
    participants: participants.map((p) => ({
      id: p._id,
      name: p.name,
      assigned: p.assignedTo !== null, // true → "Assigned", false → "Not assigned"
    })),
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/rooms/:code/pins  →  the presenter's PRIVATE help desk list
// Needs: presenter login (the session cookie)
//
// Unlike /presenter (made for the projected screen), this DOES include PINs:
// each person's own PIN and the PIN they're getting a gift for, so the host can
// help someone who lost their phone or forgot their PIN. It is only ever shown
// on its own page, hidden until clicked, never on the big screen.
// It still leaves out the gift receiver's NAME and every token: the host
// needs a PIN to pass on, not "who got whom".
// ─────────────────────────────────────────────────────────────
router.get('/:code/pins', requirePresenter, async (req, res) => {
  const room = req.room;
  const participants = await Participant.find({ room: room._id }).sort({ createdAt: 1 });

  // Look up each person's own PIN by id, to turn assignedTo into the gift PIN
  // without another database query per person.
  const pinById = new Map(participants.map((p) => [p._id.toString(), p.pin]));

  // Secrets: tell browsers and proxies not to keep a copy.
  res.set('Cache-Control', 'no-store');
  res.json({
    code: room.code,
    description: room.description,
    status: room.status,
    participants: participants.map((p) => {
      const giftPin = p.assignedTo ? pinById.get(p.assignedTo.toString()) ?? null : null;
      return {
        id: p._id,
        name: p.name,
        pin: p.pin, // their own PIN (others look for this)
        assigned: giftPin !== null,
        giftPin, // the PIN they write on their gift, or null
      };
    }),
  });
});

// ─────────────────────────────────────────────────────────────
// POST /api/rooms/:code/shuffle-start  →  presenter clicked "Shuffle"
// Needs: presenter login (the session cookie)
// Body (optional): { "durationMs": 5000, "redraw": true }
//
// Starts the name storm on every phone. It does NOT assign anyone: the
// presenter's screen calls POST /draw when the storm ends, and THAT is the
// moment everyone's match is created and revealed.
// ─────────────────────────────────────────────────────────────
router.post('/:code/shuffle-start', requirePresenter, async (req, res) => {
  const room = req.room;

  // Shuffling an already-shuffled room replaces everyone's match, so the
  // presenter must say so explicitly. A stray double-click can't do it.
  if (room.status === 'drawn' && req.body?.redraw !== true) {
    return res
      .status(409)
      .json({ error: 'This room has already been shuffled. Send { "redraw": true } to shuffle again.' });
  }

  const participants = await Participant.find({ room: room._id })
    .sort({ createdAt: 1 })
    .select('name'); // names only: that's all the storm needs
  if (participants.length < 2) {
    return res.status(400).json({ error: 'At least 2 people must join before shuffling.' });
  }

  // Accept a duration from the presenter, but only a sensible one (0–10 s).
  // Anything else (missing, text, negative, huge) falls back to 5 seconds.
  const requested = req.body?.durationMs;
  const durationMs =
    Number.isInteger(requested) && requested >= 0 && requested <= 10000 ? requested : 5000;

  emitRoomShuffling(room._id, participants.map((p) => p.name), durationMs);

  res.json({ durationMs, participantCount: participants.length });
});

// ─────────────────────────────────────────────────────────────
// POST /api/rooms/:code/draw  →  the real shuffle (called when the storm ends)
// Needs: presenter login (the session cookie)
// Body (optional): { "redraw": true } to shuffle an already-shuffled room again.
//   A re-draw gives EVERYONE currently in the room a fresh match, including
//   late joiners, and replaces all the old matches.
// ─────────────────────────────────────────────────────────────
router.post('/:code/draw', requirePresenter, async (req, res) => {
  const room = req.room;

  if (room.status === 'drawn' && req.body?.redraw !== true) {
    return res
      .status(409)
      .json({ error: 'This room has already been shuffled. Send { "redraw": true } to shuffle again.' });
  }

  // Everything below happens in ONE MongoDB transaction: claiming the room AND
  // writing every assignment. Either all of it is saved, or none of it is.
  // Without this, a failure halfway through a re-shuffle could leave a mix of
  // old and new matches: two people with the same PIN to find, and someone
  // nobody is looking for. (Transactions need a replica set, which MongoDB
  // Atlas always has. See connectDB in config/db.js.)
  //
  // The function may run more than once: MongoDB retries it on a temporary
  // clash (e.g. someone being removed at the same moment), so every variable
  // it fills in is reset at the start.
  let outcome; // 'drawn' | 'too-few' | 'busy'
  let pairs;
  await mongoose.connection.transaction(async (session) => {
    outcome = undefined;
    pairs = undefined;

    const participants = await Participant.find({ room: room._id }).select('_id').session(session);
    if (participants.length < 2) {
      outcome = 'too-few';
      return; // nothing written; the empty transaction just ends
    }

    // "Claim" the draw. The update only succeeds if the room is EXACTLY as we
    // read it (same status, same drawnAt). If two shuffle requests arrive at
    // once, only the first update matches; the second sees modifiedCount 0.
    // Same idea as the unique index in Step 3: let the database be the referee.
    const claim = await Room.updateOne(
      { _id: room._id, status: room.status, drawnAt: room.drawnAt },
      { status: 'drawn', drawnAt: new Date() },
      { session }
    );
    if (claim.modifiedCount === 0) {
      outcome = 'busy';
      return;
    }

    // Our tested pure function from Step 4 decides who gets whom.
    pairs = createDraw(participants.map((p) => p._id.toString()));

    // Save all assignments in ONE round trip, inside the transaction.
    // Each operation: "set this giver's assignedTo to their receiver".
    await Participant.bulkWrite(
      pairs.map(({ giver, receiver }) => ({
        updateOne: {
          filter: { _id: giver, room: room._id },
          update: { assignedTo: receiver },
        },
      })),
      { session }
    );
    outcome = 'drawn';
  });
  // If anything above threw, MongoDB has already undone ALL of it (room status
  // included) and the error goes to the error handler in app.js (a 500).
  // The room is exactly as it was, so the presenter can simply try again.

  if (outcome === 'too-few') {
    return res.status(400).json({ error: 'At least 2 people must join before shuffling.' });
  }
  if (outcome === 'busy') {
    return res.status(409).json({ error: 'A shuffle is already happening. Please wait a moment.' });
  }

  // Real-time: tell the presenter and all phones "the shuffle is done".
  emitRoomDrawn(room._id, pairs.length);

  // Report only HOW MANY were assigned. Never the pairs themselves.
  res.json({ status: 'drawn', assignedCount: pairs.length });
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/rooms/:code/participants/:id  →  presenter removes one person
// Needs: presenter login (the session cookie)
// ─────────────────────────────────────────────────────────────
router.delete('/:code/participants/:id', requirePresenter, async (req, res) => {
  // A malformed id (e.g. "abc") would make MongoDB throw a CastError → 500.
  // It's the client's mistake, so answer 404 instead.
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Participant not found.' });
  }

  // `room: req.room._id` matters: a presenter can only remove people from
  // THEIR OWN room, even if they somehow know an id from another room.
  const participant = await Participant.findOne({ _id: req.params.id, room: req.room._id });
  if (!participant) {
    return res.status(404).json({ error: 'Participant not found.' });
  }

  const { unassigned } = await removeParticipant(participant);
  res.json({ removed: true, unassigned });
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/rooms/:code  →  presenter permanently deletes the room
// Needs: presenter login (the session cookie)
//
// Deletes EVERYTHING: every participant (names, PINs, tokens, matches)
// and then the room itself. There is no undo; the frontend asks first.
// ─────────────────────────────────────────────────────────────
router.delete('/:code', requirePresenter, async (req, res) => {
  const room = req.room;

  // Participants first, then the room. If the server crashed in between, we'd
  // be left with an empty room (harmless, the presenter can delete it again),
  // never with participants pointing at a room that no longer exists.
  const { deletedCount } = await Participant.deleteMany({ room: room._id });
  await Room.deleteOne({ _id: room._id });

  // Tell every connected phone and presenter screen, then disconnect them.
  emitRoomDeleted(room._id);

  res.json({ deleted: true, code: room.code, participantsDeleted: deletedCount });
});

export default router;
