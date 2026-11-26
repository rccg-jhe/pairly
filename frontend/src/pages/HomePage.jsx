import { useState } from 'react'
import { Link } from 'react-router'
import { getParticipant } from '../storage.js'

// The landing page: two big choices, plus a quick "how it works".
export default function HomePage() {
  // Joined a room on this phone before? Offer a way straight back in,
  // so nobody thinks they have to join (and get a new PIN) again.
  const [session] = useState(() => getParticipant())

  return (
    <div className="home">
      {session && (
        <Link to="/result" className="continue-card">
          <span className="continue-text">
            <span className="continue-title">Continue as {session.name}</span>
            <span className="muted">
              Room {session.roomCode}
              {session.pin && <> · Your PIN <strong className="continue-pin">{session.pin}</strong></>}
            </span>
          </span>
          <span className="continue-arrow" aria-hidden="true">→</span>
        </Link>
      )}

      <section className="hero">
        <h1>Secret pairings, live in the room.</h1>
        <p className="lead">
          Everyone joins on their phone. One shuffle. Each person gets a PIN to
          find, and only they know who they're looking for.
        </p>
      </section>

      <section className="choices">
        <Link to="/present" className="choice choice-primary">
          <span className="choice-emoji" aria-hidden="true">📺</span>
          <span className="choice-title">Host a room</span>
          <span className="choice-text">Show the join code on the big screen</span>
        </Link>

        <Link to="/join" className="choice">
          <span className="choice-emoji" aria-hidden="true">📱</span>
          <span className="choice-title">Join a room</span>
          <span className="choice-text">Enter the code and your name</span>
        </Link>
      </section>

      <section className="how">
        <h2>How it works</h2>
        <ol>
          <li>The host creates a room and shows the code.</li>
          <li>Everyone joins and gets their own 4-digit PIN.</li>
          <li>The host hits <strong>Shuffle</strong>. Each person gets one PIN to find.</li>
        </ol>
      </section>
    </div>
  )
}
