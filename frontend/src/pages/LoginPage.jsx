import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext.js'

// The presenter's login form. There's no "sign up": the one account is set
// on the server with `npm run set-password`.
// Shown by <RequireLogin> in place of any presenter page.
export default function LoginPage() {
  const { login, expired } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!username.trim() || !password) {
      return setError('Enter your username and password.')
    }
    setBusy(true)
    setError(null)
    try {
      await login(username.trim(), password)
      // Success: RequireLogin now shows the page you asked for, and this form disappears.
    } catch (err) {
      setError(err.message)
      setPassword('') // a wrong password shouldn't stay in the box
      setBusy(false)
    }
  }

  return (
    <div className="center-page">
      {expired && (
        <p className="notice" role="status">
          Your login has ended. Please log in again.
        </p>
      )}

      <h1>Presenter login</h1>
      <p className="lead">Only the host can open the presenter screens.</p>

      <form className="form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field-label">Username</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            // These help password managers fill in the right boxes.
            autoComplete="username"
            autoCapitalize="none"
            spellCheck="false"
            autoFocus
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="error" role="alert">{error}</p>}

        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="muted login-guest">
        Here to take part? You don't need to log in: <Link to="/join">join a room</Link> with its code.
      </p>
    </div>
  )
}
