import { Router } from 'express';
import { Room } from '../models/Room.js';
import { Participant } from '../models/Participant.js';
import { requireParticipant } from '../middleware/auth.js';
import { removeParticipant } from '../services/participants.js';

// Mounted at /api/participants in app.js.
const router = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/participants/me  →  "What's my status? Who do I need to find?"
// Header: Authorization: Bearer <participant token>
//
// Note there's no participant ID in the URL. The server works out WHO is
// asking from the secret token, so nobody can ask about someone else
// by changing an ID in the URL.
// ─────────────────────────────────────────────────────────────
router.get('/me', requireParticipant, async (req, res) => {
  const me = req.participant; // loaded and checked by requireParticipant
  const room = await Room.findById(me.room);

  // Look up ONLY the PIN of the person assigned to me.
  // .select('pin') means the name never even leaves the database.
  let assignedPin = null;
  if (me.assignedTo) {
    const target = await Participant.findById(me.assignedTo).select('pin');
    assignedPin = target ? target.pin : null;
  }

  res.json({
    name: me.name,
    pin: me.pin,             // my own PIN (others use it to find me)
    roomCode: room.code,
    roomDescription: room.description, // e.g. "Youth Group Christmas", so they know it's the right room
    roomStatus: room.status, // "open" or "drawn"
    assigned: assignedPin !== null,
    assignedPin,             // e.g. "4821", or null → "You have not been assigned yet"
  });
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/participants/me  →  "I'm leaving this room"
// Header: Authorization: Bearer <participant token>
//
// Really removes the participant, so nobody gets assigned someone who
// isn't there any more. Their token stops working straight away.
// ─────────────────────────────────────────────────────────────
router.delete('/me', requireParticipant, async (req, res) => {
  const { unassigned } = await removeParticipant(req.participant);
  res.json({ left: true, unassigned });
});

export default router;
