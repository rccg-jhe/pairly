// Sets (or changes) the presenter's username and password.
//   npm run set-password
//
// There is no sign-up page on purpose: whoever can run this on the server
// decides who the presenter is. It writes two lines into backend/.env:
//   PRESENTER_USERNAME=…
//   PRESENTER_PASSWORD_HASH=scrypt:…   (a hash, NOT the password itself)
// Restart the server afterwards. Changing the password logs out every
// presenter session that was made with the old one.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../services/presenterAuth.js';
import { ask, closePrompt } from './prompt.js';

const ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url));
const MIN_LENGTH = 8;

try {
  console.log('Set the Pairly presenter login\n');

  const current = process.env.PRESENTER_USERNAME;
  const typed = (await ask(`Username${current ? ` [${current}]` : ''}: `)).trim();
  const username = typed || current;
  if (!username || !/^[\w.@-]{1,100}$/.test(username)) {
    throw new Error('Username: letters, numbers and . _ - @ only, no spaces.');
  }

  const password = await ask(`Password (at least ${MIN_LENGTH} characters, hidden): `, { hidden: true });
  if (password.length < MIN_LENGTH) throw new Error(`The password must be at least ${MIN_LENGTH} characters.`);
  if (password.length > 200) throw new Error('The password must be at most 200 characters.');
  if ((await ask('Type it again: ', { hidden: true })) !== password) {
    throw new Error("The passwords don't match.");
  }

  const settings = {
    PRESENTER_USERNAME: username,
    PRESENTER_PASSWORD_HASH: await hashPassword(password),
  };

  // Replace the lines if they're already in .env, otherwise add them at the end.
  // Every other line (PORT, MONGODB_URI, …) is kept exactly as it was.
  let env = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  for (const [name, value] of Object.entries(settings)) {
    const line = `${name}=${value}`;
    const pattern = new RegExp(`^${name}=.*$`, 'm');
    if (pattern.test(env)) {
      env = env.replace(pattern, () => line); // a function, so "$" in values is taken literally
    } else {
      env += `${env && !env.endsWith('\n') ? '\n' : ''}${line}\n`;
    }
  }
  fs.writeFileSync(ENV_FILE, env);
  fs.chmodSync(ENV_FILE, 0o600); // 600 = only your user account can read it

  console.log(`\n✅ Saved to backend/.env (username: ${username}).`);
  console.log('Restart the backend (npm run dev) for it to take effect.');
} catch (err) {
  console.error(`\n❌ ${err.message}`);
  process.exitCode = 1;
} finally {
  closePrompt();
}
