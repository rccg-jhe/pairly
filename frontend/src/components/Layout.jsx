import { useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router'
import ServerStatus from './ServerStatus.jsx'
import { useAuth } from '../auth/AuthContext.js'
import BackgroundShapes from './BackgroundShapes.jsx'

// The frame around every page: header at the top, footer at the bottom.
// <Outlet /> is the "hole" where the current page gets drawn.
export default function Layout() {
  const { status, username, logout } = useAuth()
  const navigate = useNavigate()
  const [logoutError, setLogoutError] = useState(null)

  async function handleLogout() {
    setLogoutError(null)
    try {
      await logout()
      navigate('/') // off the presenter pages
    } catch {
      setLogoutError("Couldn't log out. Try again.")
    }
  }

  return (
    <div className="app">
      {/* Floating decoration, drawn behind everything else */}
      <BackgroundShapes />

      <header className="app-header">
        {/* Two logos side by side: Pairly, and the church that runs it. */}
        <div className="brand">
          {/* <Link> changes the page WITHOUT reloading the browser.
              A normal <a href> would reload everything and lose React's state. */}
          <Link to="/" className="logo">
            <span className="logo-dots" aria-hidden="true" />
            {/* A thin line between the two logos */}
            <span className="brand-divider" aria-hidden="true" />
            <img
              className="church-logo"
              src="/jesus-house-exeter-logo.png"
              alt="Jesus House Exeter, The Redeemed Christian Church of God"
              width="213"
              height="256"
            />
            Pairly
          </Link>
        </div>

        {/* Only the logged-in presenter sees this */}
        {status === 'in' && (
          <div className="account">
            <span className="account-name muted">{username}</span>
            <button className="btn btn-ghost btn-sm" type="button" onClick={handleLogout}>
              Log out
            </button>
            {logoutError && <span className="error account-error" role="alert">{logoutError}</span>}
          </div>
        )}
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <footer className="app-footer">
        <ServerStatus />
      </footer>
    </div>
  )
}
