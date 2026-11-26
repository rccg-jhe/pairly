import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, onLoginRequired } from '../api.js'
import { AuthContext } from './AuthContext.js'

const LOGGED_OUT = { status: 'out', username: null, expired: false }

// Holds the presenter's login state for the whole app.
// Note what is NOT here: the session token. It lives in an httpOnly cookie,
// which the browser sends by itself and JavaScript can't read. We only ever
// know "logged in or not", by asking the server.
export default function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ status: 'checking', username: null, expired: false })

  useEffect(() => {
    let ignore = false

    // On page load: "am I already logged in?" (the cookie survives refreshes)
    apiFetch('/auth/me')
      .then((data) => {
        if (ignore) return
        setAuth(data.loggedIn ? { status: 'in', username: data.username, expired: false } : LOGGED_OUT)
      })
      .catch(() => {
        // Server unreachable: show the login form; logging in will explain the problem.
        if (!ignore) setAuth(LOGGED_OUT)
      })

    // If any presenter request later says "log in first" (the session expired,
    // or the password was changed), drop back to the login form.
    const stopListening = onLoginRequired(() => setAuth({ ...LOGGED_OUT, expired: true }))

    return () => {
      ignore = true
      stopListening()
    }
  }, [])

  // Throws on a wrong password, so the login form can show the message.
  const login = useCallback(async (username, password) => {
    const data = await apiFetch('/auth/login', { method: 'POST', body: { username, password } })
    setAuth({ status: 'in', username: data.username, expired: false })
  }, [])

  // Only switch to "logged out" once the SERVER has ended the session. If the
  // request fails, it throws and we stay logged in, rather than pretending.
  const logout = useCallback(async () => {
    await apiFetch('/auth/logout', { method: 'POST' })
    setAuth(LOGGED_OUT)
  }, [])

  // useMemo: a new object only when something changed, so components using
  // useAuth() don't redraw for nothing.
  const value = useMemo(() => ({ ...auth, login, logout }), [auth, login, logout])

  // React 19: a context object can be used directly as its provider.
  return <AuthContext value={value}>{children}</AuthContext>
}
