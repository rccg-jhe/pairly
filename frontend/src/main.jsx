// The entry point: the very first JavaScript file the browser runs.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import AuthProvider from './auth/AuthProvider.jsx'

// Find <div id="root"> in index.html and render our whole app inside it.
createRoot(document.getElementById('root')).render(
  // StrictMode: development-only extra checks that warn about common mistakes.
  <StrictMode>
    {/* BrowserRouter watches the address bar, so the rest of the app can
        show different pages for different URLs without reloading. */}
    <BrowserRouter>
      {/* Catches crashes anywhere below, so a bug shows a message, not a blank screen */}
      <ErrorBoundary>
        {/* Shares "is the presenter logged in?" with every page */}
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
