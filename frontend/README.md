# Pairly frontend

The React (Vite) app for Pairly. See the [main README](../README.md) for setup, how it works, and the API.

```bash
npm install
npm run dev     # http://localhost:5173 (needs the backend running on :3000)
npm run lint
npm run build
```

Set `BACKEND_URL` if the backend isn't on `http://localhost:3000`:
```bash
BACKEND_URL=http://localhost:4000 npm run dev
```
