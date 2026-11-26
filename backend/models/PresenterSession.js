import mongoose from 'mongoose';

// One document per presenter login ("session").
// When the presenter logs in, the server makes a long random token, puts it
// in a cookie in their browser, and remembers it here.
//
// We store a HASH of the token, never the token itself. If someone ever got
// a copy of the database, they still couldn't use these to log in.
const presenterSessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true },

    username: { type: String, required: true },

    // A fingerprint of the password that was in use at login. If the password
    // is changed (npm run set-password), it no longer matches, so every old
    // session stops working at once: "change the password = log everyone out".
    credentialsVersion: { type: String, required: true },

    // A TTL ("time to live") index: MongoDB deletes the document by itself
    // once this time has passed (it checks about once a minute, so the code
    // also checks expiresAt when it looks a session up).
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

export const PresenterSession = mongoose.model('PresenterSession', presenterSessionSchema);
