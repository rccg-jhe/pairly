// A throwaway "playground" script to see our models working.
// Run with: npm run try-models
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Room } from '../models/Room.js';
import { Participant } from '../models/Participant.js';
import { generateToken } from '../utils/generate.js';

await connectDB();

// Make sure the unique indexes exist before we test them.
await Room.syncIndexes();
await Participant.syncIndexes();

// 1. Create a room. Note the lowercase code: the schema uppercases it.
const room = await Room.create({ code: 'test1' });
console.log('Created room:', room.code, '| status:', room.status);

// 2. Add two participants to the room.
const ada = await Participant.create({ room: room._id, name: '  Ada  ', pin: '0427', token: generateToken() });
const bo = await Participant.create({ room: room._id, name: 'Bo', pin: '1234', token: generateToken() });
console.log('Created participants:', [ada.name, bo.name], '| PINs:', [ada.pin, bo.pin]);

// 3. Try to break the rules: each of these should be REJECTED.
const badAttempts = [
  ['PIN with 3 digits', () => Participant.create({ room: room._id, name: 'Cy', pin: '123', token: generateToken() })],
  ['Duplicate PIN in same room', () => Participant.create({ room: room._id, name: 'Di', pin: '1234', token: generateToken() })],
  ['Duplicate room code', () => Room.create({ code: 'TEST1' })],
  ['Invalid status', () => Room.create({ code: 'ZZZZ', status: 'banana' })],
];
for (const [label, attempt] of badAttempts) {
  try {
    await attempt();
    console.log(`  ✗ ${label}: was allowed (this is a bug!)`);
  } catch (err) {
    console.log(`  ✓ ${label}: rejected`);
  }
}

// 4. Clean up so the script can be run again.
await Participant.deleteMany({ room: room._id });
await Room.deleteMany({ code: { $in: ['TEST1', 'ZZZZ'] } });
console.log('Cleaned up test data.');

await mongoose.disconnect();
