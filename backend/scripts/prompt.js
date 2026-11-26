// Asks questions in the terminal. Hidden answers (passwords) aren't shown
// as you type, so nobody can read them over your shoulder.
// Also works when the answers are piped in (handy for automated tests).
import readline from 'node:readline';

let rl = null;
let lines = null;
let muted = false;

function setup() {
  if (rl) return;
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY),
  });
  // readline echoes what you type through this function; while muted, it echoes nothing.
  rl._writeToOutput = (text) => {
    if (!muted) rl.output.write(text);
  };
  lines = rl[Symbol.asyncIterator]();
}

export async function ask(question, { hidden = false } = {}) {
  setup();
  process.stdout.write(question);
  muted = hidden;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden || done) process.stdout.write('\n');
  return done ? '' : value;
}

export function closePrompt() {
  rl?.close();
  rl = null;
}
