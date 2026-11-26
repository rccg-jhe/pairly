import { Component } from 'react'

// An Error Boundary catches crashes while React is drawing the page.
// Without one, a single bug anywhere turns the whole screen blank white,
// which is a terrible thing to happen on a projector in front of a room.
// With one, people see a friendly message and a way to recover.
//
// It must be a class component: React only offers this feature through the
// class methods getDerivedStateFromError and componentDidCatch.
export default class ErrorBoundary extends Component {
  state = { crashed: false }

  // Called when a child throws while rendering: switch to the fallback screen.
  static getDerivedStateFromError() {
    return { crashed: true }
  }

  // Called with the details: log them so a developer can find the bug.
  componentDidCatch(error, info) {
    console.error('Pairly crashed:', error, info.componentStack)
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="center-page">
          <h1>Something went wrong</h1>
          <p className="lead">
            Sorry, this page hit a problem. Your room and your PIN are safe on the server.
          </p>
          <div className="stack">
            {/* A full reload starts the app fresh and reconnects. */}
            <button className="btn btn-primary btn-lg" onClick={() => window.location.reload()}>
              Reload the page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
