// Import Express: the library that turns Node.js into a web server.
import express from 'express';
import http from 'node:http';
import { initSocket } from './realtime/socket.js';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import roomsRouter from './routes/rooms.js';
import participantsRouter from './routes/participants.js';
import authRouter from './routes/auth.js';
import { isLoginConfigured } from './services/presenterAuth.js';

// Create our app (the "server object" we attach routes to).
const app = express();

// Use the PORT from the environment if one is set (hosting providers do this),
// otherwise fall back to 3000 for local development.
const port = process.env.PORT || 3000;

// Middleware: lets Express read JSON request bodies (we'll need this in Step 3
// when the phone sends { name: "Ada", code: "XK4P" }).
// The limit stops anyone sending a huge body to tie up the server.
// Our biggest real request (a room description) is well under 1 kb.
app.use(express.json({ limit: '10kb' }));

// In development, every request reaches us through Vite's proxy, so it looks
// like it comes from this computer (127.0.0.1). Vite adds the real address to
// the end of an X-Forwarded-For header. We believe exactly ONE entry, the last
// one, and only when the request really came from this computer (i.e. Vite).
// Anything earlier in the header was written by the client and could be fake.
// This makes req.ip the real device, which the login attempt limit needs.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
app.set('trust proxy', (address, hop) => hop === 0 && LOOPBACK.has(address));

// Route 1: plain "hello world" so we can see the server is alive in a browser.
app.get('/', (req, res) => {
  res.send('Hello from Pairly!');
});

// Route 2: health check. Now it also reports whether the database is connected.
// mongoose.connection.readyState: 0 = disconnected, 1 = connected,
// 2 = connecting, 3 = disconnecting.
app.get('/api/health', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.json({ status: 'ok', app: 'pairly', db: dbConnected ? 'connected' : 'disconnected' });
});

// Mount the rooms router: every route inside it starts with /api/rooms.
app.use('/api/auth', authRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/participants', participantsRouter);

// Catch-all 404 for any /api URL that didn't match a route above.
// Returning JSON (not HTML) keeps things consistent for the React app.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error-handling middleware. Express knows it's an error handler because it
// has FOUR parameters (err, req, res, next). In Express 5, if an async route
// throws, the error lands here automatically.
app.use((err, req, res, next) => {
  // Errors with a status below 500 are the client's fault (e.g. broken JSON → 400).
  // It's safe to show their message.
  const status = err.status && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err); // log real server bugs for us to see
  res.status(status).json({
    // Never send internal error details to users: they can reveal how the server works.
    error: status === 500 ? 'Something went wrong on our side.' : err.message,
  });
});

// Connect to the database FIRST, then start accepting requests.
// If we started the server first, early requests could hit a database that isn't ready.
try {
  await connectDB();

  // Express alone would create its own hidden HTTP server inside app.listen().
  // Socket.io needs to attach to that same server, so we create it ourselves:
  // ONE server, ONE port, handling both normal requests (Express) and live
  // connections (Socket.io).
  const server = http.createServer(app);
  initSocket(server);

  if (!isLoginConfigured()) {
    console.warn('⚠️  Presenter login is not set up. Contact Administrator');
  }

  server.listen(port, () => {
    console.log(`Pairly server listening on http://localhost:${port}`);
  });
} catch (err) {
  console.error('Failed to start server:', err.message);
  process.exit(1); // exit with an error code so it's obvious something went wrong
}
