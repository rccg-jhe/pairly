import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { apiFetch } from '../api.js'

const MAX_DESCRIPTION = 120 // same limit as the server

// /present → describe the room and create it, or reopen one of your rooms.
export default function PresenterStartPage() {
  const navigate = useNavigate() // lets us change page from code
  // Set by the room page after a delete: navigate('/present', { state: { deletedCode } })
  const deletedCode = useLocation().state?.deletedCode
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  // The rooms list (null while loading). Because rooms belong to the LOGIN,
  // not to this browser, you can reopen them from any device.
  const [rooms, setRooms] = useState(null)
  const [roomsError, setRoomsError] = useState(null)

  useEffect(() => {
    let ignore = false
    apiFetch('/rooms')
      .then((data) => {
        if (!ignore) setRooms(data.rooms)
      })
      .catch((err) => {
        if (!ignore) setRoomsError(err.message)
      })
    return () => {
      ignore = true
    }
  }, [])

  async function handleCreate(event) {
    event.preventDefault() // we handle the form ourselves; no page reload

    // Instant feedback in the browser. The server checks this again.
    const cleanDescription = description.trim()
    if (!cleanDescription) {
      return setError('Describe the room, so people know they are joining the right one.')
    }

    setCreating(true) // disables the button, so a double-click can't make 2 rooms
    setError(null)
    try {
      const room = await apiFetch('/rooms', {
        method: 'POST',
        body: { description: cleanDescription },
      })
      navigate(`/present/${room.code}`)
    } catch (err) {
      setError(err.message)
      setCreating(false)
    }
  }

  return (
    <div className="center-page">
      {deletedCode && (
        <p className="notice" role="status">
          Room {deletedCode} and everyone in it has been deleted.
        </p>
      )}

      <h1>Host a room</h1>
      <p className="lead">
        You'll get a short code to show on the big screen. Everyone joins with it on their phone.
      </p>

      <form className="form" onSubmit={handleCreate} noValidate>
        <label className="field">
          <span className="field-label">Room description</span>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Youth Group Christmas: Secret Santa 2026"
            maxLength={MAX_DESCRIPTION}
            autoComplete="off"
            autoFocus
            required
            aria-describedby="room-description-hint"
          />
          <span className="field-hint" id="room-description-hint">
            Shown on the big screen and on everyone's phone, so people can tell your room apart
            from others. ({description.length}/{MAX_DESCRIPTION})
          </span>
        </label>

        {/* role="alert" makes screen readers announce the error */}
        {error && <p className="error" role="alert">{error}</p>}

        <button className="btn btn-primary btn-lg" type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create room'}
        </button>
      </form>

      {roomsError && <p className="error" role="alert">{roomsError}</p>}
      {rooms?.length > 0 && (
        <section className="room-list-section" aria-labelledby="your-rooms">
          <h2 id="your-rooms">Your rooms</h2>
          <ul className="room-list">
            {rooms.map((r) => (
              <li key={r.code}>
                <Link className="room-link" to={`/present/${r.code}`}>
                  <span className="room-link-code">{r.code}</span>
                  <span className="room-link-text">
                    <span className="room-link-desc">{r.description || 'No description'}</span>
                    <span className="muted">
                      {r.participantCount} {r.participantCount === 1 ? 'person' : 'people'} ·{' '}
                      {r.status === 'drawn' ? 'Shuffled' : 'Open'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
