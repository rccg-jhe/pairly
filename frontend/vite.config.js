import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import process from 'node:process' // vite.config runs in Node, not the browser

// Where the Express backend runs. Normally port 3000, but it can be changed
// without editing this file, e.g.  BACKEND_URL=http://localhost:4000 npm run dev
const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on your local network too, so phones on the same Wi-Fi can open
    // http://<your-computer's-IP>:5173 and join a room.
    host: true,

    // The proxy: when the React app asks for /api/... or /socket.io/...,
    // Vite quietly forwards the request to our Express server on port 3000.
    // The browser thinks everything comes from ONE place (port 5173), so we
    // avoid cross-origin (CORS) problems and never hard-code the backend URL.
    proxy: {
      '/api': {
        target: backendUrl,
        // Tell the backend the REAL device address (X-Forwarded-For). Without
        // it, every request looks like it comes from this computer, and the
        // login attempt limit would treat everyone as one person.
        xfwd: true,
      },
      '/socket.io': {
        target: backendUrl,
        ws: true, // also forward WebSocket connections (for Step 8)
      },
    },
  },
})
