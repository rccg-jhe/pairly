import { Routes, Route } from 'react-router'
import Layout from './components/Layout.jsx'
import RequireLogin from './components/RequireLogin.jsx'
import HomePage from './pages/HomePage.jsx'
import PresenterStartPage from './pages/PresenterStartPage.jsx'
import PresenterRoomPage from './pages/PresenterRoomPage.jsx'
import PresenterPinsPage from './pages/PresenterPinsPage.jsx'
import JoinPage from './pages/JoinPage.jsx'
import ResultPage from './pages/ResultPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

// The app's "map": which URL shows which page.
export default function App() {
  return (
    <Routes>
      {/* A "layout route": Layout is drawn around every page nested inside it.
          It has no path of its own, so it only adds the shared frame. */}
      <Route element={<Layout />}>
        {/* index = the page for exactly "/" */}
        <Route index element={<HomePage />} />

        {/* Presenter pages, behind the login. RequireLogin is a layout route
            with no path: it shows the login form until you're logged in.
            /present creates a room, /present/XK4P is its big screen. */}
        <Route element={<RequireLogin />}>
          <Route path="present" element={<PresenterStartPage />} />
          <Route path="present/:code" element={<PresenterRoomPage />} />
          {/* The host's private list of names and PINs (never on the projector) */}
          <Route path="present/:code/pins" element={<PresenterPinsPage />} />
        </Route>

        {/* Join page (Step 9). ":code?" is an OPTIONAL URL parameter, so both
            /join and /join/XK4P work. The second lets us share a direct link. */}
        <Route path="join/:code?" element={<JoinPage />} />

        {/* A participant's private result (Step 9) */}
        <Route path="result" element={<ResultPage />} />

        {/* "*" matches anything not listed above → friendly 404 page */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
