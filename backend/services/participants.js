// Shared "remove a participant" logic, used by BOTH:
//   DELETE /api/participants/me                 (someone leaves on their phone)
//   DELETE /api/rooms/:code/participants/:id    (the presenter removes someone)
// Keeping it in one place means the two can never drift apart.
import mongoose from 'mongoose';
import { Participant } from '../models/Participant.js';
import { emitParticipantRemoved } from '../realtime/socket.js';

export async function removeParticipant(participant) {
  // Both writes happen in ONE transaction, so they succeed or fail together.
  // It also protects against a shuffle running at the same moment: the
  // shuffle writes this person's document too, so MongoDB sees the clash and
  // retries one of them, instead of leaving someone matched to a person who
  // has gone. (The function may run more than once, hence the reset.)
  let unassigned;
  await mongoose.connection.transaction(async (session) => {
    unassigned = 0;

    // If the room was already shuffled, someone may be assigned to find this
    // person. That assignment now points at nobody, so clear it: they'll show
    // as "Not assigned", and the presenter can re-shuffle to include them.
    const cleared = await Participant.updateMany(
      { room: participant.room, assignedTo: participant._id },
      { assignedTo: null },
      { session }
    );
    unassigned = cleared.modifiedCount;

    await Participant.deleteOne({ _id: participant._id }, { session });
  });

  emitParticipantRemoved(participant.room, participant._id);

  // How many people lost their match because of this (0 or 1).
  return { unassigned };
}
