import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema(
  {
    // Which room this person joined. ObjectId is MongoDB's ID type,
    // and `ref: 'Room'` tells Mongoose it points at a Room document.
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },

    // The name shown on the presenter's screen.
    name: {
      type: String,
      required: true,
      trim: true,        // "  Ada  " is saved as "Ada"
      minlength: 1,
      maxlength: 40,
    },

    // A lower-case copy of the name, used ONLY to stop duplicates:
    // "Ada", "ada" and "ADA" all become "ada", so the second one is refused.
    // Filled in automatically (see the pre('validate') hook below).
    nameKey: {
      type: String,
      select: false,
    },

    // The 4-digit PIN. Stored as a STRING, not a Number,
    // so "0427" keeps its leading zero (as a Number it would become 427).
    pin: {
      type: String,
      required: true,
      match: /^\d{4}$/,  // exactly 4 digits, nothing else
    },

    // Secret "ticket" proving "I am this participant" (used in Step 5).
    // We can't use the PIN for this: PINs get shown to other people.
    token: {
      type: String,
      required: true,
      unique: true,
      select: false, // never returned by queries unless explicitly requested
    },

    // Who this person must find (filled in by the shuffle in Step 4).
    // null means "not assigned yet", e.g. someone who joined late.
    // This is SECRET: only the server and the person themselves may know it.
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Participant',
      default: null,
    },
  },
  { timestamps: true }
);

// A compound unique index: a PIN may only appear ONCE per room.
// (Two different rooms can both have a "1234"; that's fine.)
participantSchema.index({ room: 1, pin: 1 }, { unique: true });

// One name per room, ignoring upper/lower case. The partialFilterExpression
// means "only index documents that HAVE a nameKey", so participants created
// before this rule existed (no nameKey) don't clash with each other.
participantSchema.index(
  { room: 1, nameKey: 1 },
  { unique: true, partialFilterExpression: { nameKey: { $type: 'string' } } }
);

// Runs automatically before every save: keep nameKey in step with name.
participantSchema.pre('validate', function () {
  if (typeof this.name === 'string') {
    this.nameKey = this.name.trim().toLowerCase();
  }
});

export const Participant = mongoose.model('Participant', participantSchema);
