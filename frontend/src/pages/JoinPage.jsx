import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { apiFetch } from '../api.js'
import { saveParticipant, getParticipant, clearParticipant } from '../storage.js'

// /join or /join/XK4P → enter the room code and your name.
export default function JoinPage() {
  const params = useParams()
  const navigate = useNavigate()

  // "Controlled inputs": React state is the single source of truth for what's
  // in each box. The input shows the state; typing updates the state.
  const [code, setCode] = useState((params.code ?? '').toUpperCase())
  const [name, setName] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState(null)

  // Has this phone already joined a room? (e.g. they pressed Back by accident)
  const [existing, setExisting] = useState(() => getParticipant())

  // "Join as someone else": remove the OLD participant on the server first,
  // so they don't stay in the room (and get shuffled) with nobody holding the phone.
  const [switching, setSwitching] = useState(false)
  async function handleSwitch() {
    setSwitching(true)
    setError(null)
    try {
      await apiFetch('/participants/me', { method: 'DELETE', token: existing.token })
    } catch (err) {
      // 401 = already gone on the server (e.g. room deleted). Anything else: stop and say why.
      if (err.status !== 401) {
        setError(err.message)
        setSwitching(false)
        return
      }
    }
    clearParticipant()
    setExisting(null)
    setSwitching(false)
  }

  async function handleSubmit(event) {
    // Forms normally reload the page when submitted. We handle it ourselves.
    event.preventDefault()

    // Quick checks in the browser, for instant feedback. The SERVER still
    // validates everything: browser checks can be skipped by anyone.
    const cleanCode = code.trim().toUpperCase()
    const cleanName = name.trim()
    if (cleanCode.length < 4) return setError('Enter the room code from the big screen.')
    if (!cleanName) return setError('Enter your name.')

    setJoining(true)
    setError(null)
    try {
      const me = await apiFetch(`/rooms/${encodeURIComponent(cleanCode)}/join`, {
        method: 'POST',
        body: { name: cleanName },
      })
      // Remember who we are on this phone, then go to the result page.
      saveParticipant({ token: me.token, roomCode: me.roomCode, name: me.name, pin: me.pin })
      // replace: true → pressing Back from the result page won't return to this form
      navigate('/result', { replace: true })
    } catch (err) {
      setError(err.message) // e.g. "Room not found. Check the code and try again."
      setJoining(false)
    }
  }

  // Already joined → offer to continue instead of creating a second participant.
  if (existing) {
    return (
      <div className="center-page">
        <h1>You're already in a room</h1>
        <p className="lead">
          Room <strong>{existing.roomCode}</strong> as <strong>{existing.name}</strong>.
        </p>
        <div className="stack">
          <Link className="btn btn-primary btn-lg" to="/result">Go to my result</Link>
          <button className="btn btn-ghost" onClick={handleSwitch} disabled={switching}>
            {switching ? 'Leaving…' : `Leave and join as someone else`}
          </button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    )
  }

  return (
    <div className="center-page">
      <h1>Join a room</h1>
      <p className="lead">Enter the code on the big screen and your name.</p>

      {/* noValidate: we show our own friendly messages instead of the browser's */}
      <form className="form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="field-label">Room code</span>
          <input
            className="input input-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            // "e.g." makes it clear this is an example, not a real code to copy
            placeholder="e.g. XK4P"
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters" // phone keyboards start in CAPS
            spellCheck={false}
            required
            // Links the hint below to this box, so screen readers read it out too
            aria-describedby="room-code-hint"
          />
          <span className="field-hint" id="room-code-hint">
            The 4-character code on the host's big screen. It puts you in the right room, so you
            can be included in the shuffle.
          </span>
        </label>

        <label className="field">
          <span className="field-label">Your name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ada"
            maxLength={40}
            autoComplete="given-name"
            autoFocus={Boolean(params.code)} // code already filled → jump to name
            required
          />
        </label>

        {error && <p className="error" role="alert">{error}</p>}

        <button className="btn btn-primary btn-lg" type="submit" disabled={joining}>
          {joining ? 'Joining…' : 'Join'}
        </button>
      </form>
    </div>
  )
}
