import { Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext.js'
import LoginPage from '../pages/LoginPage.jsx'

// A "guard" layout route around the presenter pages (see App.jsx).
// Logged in → show the page. Not logged in → show the login form INSTEAD,
// at the same URL, so after logging in you land exactly where you were going.
//
// This is for a friendly experience only. The real lock is on the SERVER:
// every presenter API call and live connection checks the session cookie,
// so hiding the page here is not what keeps the data safe.
export default function RequireLogin() {
  const { status } = useAuth()
  if (status === 'checking') return <p className="center-page muted">Checking login…</p>
  if (status !== 'in') return <LoginPage />
  return <Outlet />
}
