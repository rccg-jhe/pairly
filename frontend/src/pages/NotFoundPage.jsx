import { Link } from 'react-router'

// Shown for any URL that doesn't match a route (the "*" route in App.jsx).
export default function NotFoundPage() {
  return (
    <div className="placeholder">
      <h1>Page not found</h1>
      <p>That link doesn't go anywhere.</p>
      <Link to="/">← Back home</Link>
    </div>
  )
}
