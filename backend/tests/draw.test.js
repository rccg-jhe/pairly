// Unit tests for the draw algorithm, using Node's built-in test runner.
// Run with: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { shuffle, createDraw } from '../services/draw.js';

// Helper: makes ['p1', 'p2', ..., 'pN']
const makeIds = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

// Helper: checks ALL the Pairly rules for one draw result.
// We reuse it in several tests so the rules are written down once.
function assertValidDraw(ids, pairs) {
  // Rule 1: one pair per participant
  assert.equal(pairs.length, ids.length, 'every participant gets exactly one pair');

  // Rule 2: every participant is a giver exactly once
  const givers = pairs.map((p) => p.giver);
  assert.deepEqual([...givers].sort(), [...ids].sort(), 'each person gives exactly once');

  // Rule 3: every participant is a receiver exactly once (nobody picked twice)
  const receivers = pairs.map((p) => p.receiver);
  assert.deepEqual([...receivers].sort(), [...ids].sort(), 'each person is picked exactly once');

  // Rule 4: nobody gets themselves
  for (const { giver, receiver } of pairs) {
    assert.notEqual(giver, receiver, `${giver} must not get themselves`);
  }

  // Rule 5: it's ONE single cycle. Start anywhere, follow the arrows, and we
  // should visit everyone before getting back to the start.
  const next = new Map(pairs.map((p) => [p.giver, p.receiver]));
  let current = ids[0];
  let steps = 0;
  do {
    current = next.get(current);
    steps++;
  } while (current !== ids[0] && steps <= ids.length);
  assert.equal(steps, ids.length, 'all participants form one single cycle');
}

describe('shuffle', () => {
  test('returns the same items, just reordered', () => {
    const ids = makeIds(10);
    const result = shuffle(ids);
    assert.deepEqual([...result].sort(), [...ids].sort());
  });

  test('does not modify the original array', () => {
    const ids = makeIds(5);
    const copy = [...ids];
    shuffle(ids);
    assert.deepEqual(ids, copy);
  });

  test('is fair: all 6 orders of 3 items appear about equally often', () => {
    // 3 items have 3! = 6 possible orders. Over 6000 shuffles, each should
    // appear about 1000 times. A classic buggy shuffle (picking j from the
    // WHOLE array instead of 0..i) makes some orders twice as likely as others.
    const counts = new Map();
    for (let run = 0; run < 6000; run++) {
      const key = shuffle(['a', 'b', 'c']).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    assert.equal(counts.size, 6, 'all 6 orders appear');
    for (const [order, count] of counts) {
      assert.ok(count > 800 && count < 1200, `${order} appeared ${count} times`);
    }
  });

  test('uses the random function we give it (predictable in tests)', () => {
    // A fake randomInt that always returns 0: always swap with the first slot.
    // [a,b,c] → i=2 swap(2,0) → [c,b,a] → i=1 swap(1,0) → [b,c,a]
    const alwaysZero = () => 0;
    assert.deepEqual(shuffle(['a', 'b', 'c'], alwaysZero), ['b', 'c', 'a']);
  });
});

describe('createDraw', () => {
  test('works with the smallest possible group (2 people)', () => {
    const pairs = createDraw(['ada', 'bo']);
    assertValidDraw(['ada', 'bo'], pairs);
    // With 2 people, the only valid answer: they get each other.
  });

  // Randomness means one lucky pass proves little, so run each size many times.
  for (const size of [3, 4, 5, 10, 50, 200]) {
    test(`follows every rule with ${size} people (500 runs)`, () => {
      const ids = makeIds(size);
      for (let run = 0; run < 500; run++) {
        assertValidDraw(ids, createDraw(ids));
      }
    });
  }

  test('is fair: every possible circle shows up about equally often', () => {
    // 4 people can form exactly 3! = 6 different single cycles.
    // Over 6000 draws, each should appear about 1000 times.
    const ids = makeIds(4);
    const counts = new Map();
    for (let run = 0; run < 6000; run++) {
      const pairs = createDraw(ids);
      // Describe the circle starting from p1, e.g. "p1>p3>p2>p4"
      const next = new Map(pairs.map((p) => [p.giver, p.receiver]));
      let key = 'p1';
      let current = next.get('p1');
      while (current !== 'p1') {
        key += '>' + current;
        current = next.get(current);
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    assert.equal(counts.size, 6, 'all 6 possible circles appear');
    for (const [circle, count] of counts) {
      // Generous bounds: a fair shuffle lands within these limits practically always.
      assert.ok(count > 800 && count < 1200, `${circle} appeared ${count} times`);
    }
  });

  test('rejects fewer than 2 participants', () => {
    assert.throws(() => createDraw([]), /at least 2/);
    assert.throws(() => createDraw(['solo']), /at least 2/);
  });

  test('rejects duplicate IDs', () => {
    assert.throws(() => createDraw(['ada', 'bo', 'ada']), /unique/);
  });

  test('rejects input that is not an array', () => {
    assert.throws(() => createDraw('ada,bo'), TypeError);
  });

  test('does not modify the input array', () => {
    const ids = makeIds(6);
    const copy = [...ids];
    createDraw(ids);
    assert.deepEqual(ids, copy);
  });
});
