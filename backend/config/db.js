import mongoose from 'mongoose';

// Connects to MongoDB once, when the server starts.
// Every model (Room, Participant) shares this one connection.
export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  // Fail fast with a clear message instead of a confusing error later.
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
  }

  await mongoose.connect(uri);

  // Pairly saves each shuffle in a TRANSACTION (all assignments or none), and
  // MongoDB only allows transactions on a replica set. Atlas always is one; a
  // plain local `mongod` isn't. Check now, so a wrong setup fails at start-up
  // with a clear message, not halfway through someone's shuffle.
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  const supportsTransactions = Boolean(hello.setName) || hello.msg === 'isdbgrid'; // replica set, or sharded
  if (!supportsTransactions) {
    await mongoose.disconnect();
    throw new Error(
      'This MongoDB does not support transactions. Use MongoDB Atlas (or a replica set) in MONGODB_URI.'
    );
  }

  console.log(`MongoDB connected: ${mongoose.connection.name}`);
}
