import mongoose from 'mongoose';

// A Schema is the "shape" every Room document must have.
const roomSchema = new mongoose.Schema(
  {
    // The short join code shown on the big screen, e.g. "XK4P".
    code: {
      type: String,
      required: true,
      unique: true,      // creates a unique index: no two rooms can share a code
      uppercase: true,   // "xk4p" is saved as "XK4P", so codes are case-insensitive
      trim: true,
      minlength: 4,
      maxlength: 6,
    },

    // Set by the presenter when creating the room, e.g. "Youth Group Christmas: Secret Santa".
    // Shown on the big screen and on every phone, so people know they're in the right room.
    // (Not `required` here, so rooms created before this field existed still load.
    //  The create-room route insists on it for every NEW room.)
    description: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },

    // Where the room is in its life cycle.
    // "open"  = people can join, no shuffle yet
    // "drawn" = the presenter has clicked Shuffle and assignments exist
    status: {
      type: String,
      enum: ['open', 'drawn'], // any other value is rejected
      default: 'open',
    },

    // When the shuffle happened (null until then).
    drawnAt: {
      type: Date,
      default: null,
    },

    // (Rooms used to carry a secret presenterKey. Presenters now log in
    //  instead, see services/presenterAuth.js. Old rooms may still have
    //  the field in the database; it's simply ignored.)
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
  }
);

// A Model is the tool we use to create/find/update documents.
// Mongoose stores "Room" documents in the "rooms" collection.
export const Room = mongoose.model('Room', roomSchema);
