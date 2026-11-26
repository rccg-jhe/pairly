// The heart of Pairly: decide who gets whom.
//
// This file is "pure logic": no database, no Express, no network.
// It takes a list of IDs in and gives a list of pairs out. That makes it
// easy to test, and easy to trust.
import crypto from 'node:crypto';

/**
 * Fisher–Yates shuffle: returns a NEW array in random order.
 * Every possible order is equally likely (if randomInt is fair).
 *
 * @param {Array} items                 the things to shuffle (not modified)
 * @param {Function} randomInt          randomInt(max) → whole number 0..max-1.
 *                                      Defaults to crypto's. Tests can pass a fake one.
 */
export function shuffle(items, randomInt = crypto.randomInt) {
  const result = [...items]; // copy, so we never change the caller's array

  // Walk from the last position down to the second.
  // At each position i, pick a random position j from 0..i and swap them.
  // Position i is then "final", and we never touch it again.
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); // 0 ≤ j ≤ i
    [result[i], result[j]] = [result[j], result[i]]; // swap
  }
  return result;
}

/**
 * Create the draw: each participant is assigned to exactly ONE other participant.
 *
 * Method: shuffle everyone into a random line, then join the line into a circle.
 * Each person is assigned to the NEXT person in the circle, and the last one
 * wraps around to the first.
 *
 *   shuffled: [Cy, Ada, Bo, Di]
 *   Cy → Ada → Bo → Di → (back to) Cy
 *
 * Because it's ONE big circle (a "single cycle"):
 *   - nobody gets themselves (the next person is always someone else)
 *   - nobody is picked twice (each person is "next" for exactly one person)
 *   - everybody gets someone
 *
 * @param {string[]} participantIds   unique IDs, at least 2
 * @param {Function} randomInt        optional, see shuffle()
 * @returns {{ giver: string, receiver: string }[]}
 *          one pair per participant: "giver" must find "receiver"
 */
export function createDraw(participantIds, randomInt = crypto.randomInt) {
  // Guard clauses: reject impossible input with a clear message.
  if (!Array.isArray(participantIds)) {
    throw new TypeError('participantIds must be an array');
  }
  if (participantIds.length < 2) {
    // With 1 person, the only option is themselves, which breaks the rules.
    throw new Error('Need at least 2 participants to draw');
  }
  if (new Set(participantIds).size !== participantIds.length) {
    // A Set drops duplicates, so a smaller size means there were repeats.
    throw new Error('participantIds must be unique');
  }

  const circle = shuffle(participantIds, randomInt);

  return circle.map((giver, index) => ({
    giver,
    // % (remainder) makes the last index wrap back to 0.
    // e.g. with 4 people: (3 + 1) % 4 = 0
    receiver: circle[(index + 1) % circle.length],
  }));
}
