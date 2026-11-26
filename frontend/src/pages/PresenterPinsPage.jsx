import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { apiFetch } from '../api.js'

const MASK = '••••'

// /present/:code/pins → the host's PRIVATE help desk: everyone's name, their
// own PIN, the PIN they're getting a gift for, and whether they're assigned.
// For helping someone who lost their phone or forgot a PIN.
//
// Never put this on the projector. PINs stay hidden until the host clicks,
// one row at a time (or "Show all" when the screen is definitely private).
export default function PresenterPinsPage() {
  const code = useParams().code.toUpperCase()
  const [room, setRoom] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(() => new Set()) // ids of rows showing their PINs
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRoom(await apiFetch(`/rooms/${code}/pins`))
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [code])

  // Load now, and again whenever the host comes back to this tab
  // (e.g. after shuffling on the big screen in the other tab).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data on mount
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [load])

  function toggleRow(id) {
    setShown((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!room) {
    return (
      <div className="center-page">
        {error ? (
          <>
            <p className="error" role="alert">{error}</p>
            <Link to={`/present/${code}`}>← Back to the room</Link>
          </>
        ) : (
          <p className="muted">Loading PINs…</p>
        )}
      </div>
    )
  }

  const isDrawn = room.status === 'drawn'
  const assignedCount = room.participants.filter((p) => p.assigned).length

  // Search by name or by either PIN: "who has 4821?" works too.
  const query = search.trim().toLowerCase()
  const rows = query
    ? room.participants.filter(
        (p) => p.name.toLowerCase().includes(query) || p.pin.includes(query) || p.giftPin?.includes(query)
      )
    : room.participants
  // Searching by a PIN only matches if it's visible, so searching reveals the matches
  const searchingPin = /^\d+$/.test(query)

  return (
    <div className="pins-page">
      <div className="pins-top">
        <Link to={`/present/${code}`} className="pins-back">← Back</Link>
        <h1>PINs for room {room.code}</h1>
        {room.description && <p className="room-description">{room.description}</p>}
        <p className="muted">
          {room.participants.length} {room.participants.length === 1 ? 'person' : 'people'}
          {isDrawn ? ` · ${assignedCount} assigned · ${room.participants.length - assignedCount} not assigned` : ' · not shuffled yet'}
        </p>
      </div>

      <p className="pins-private" role="note">
        🔒 <strong>Private.</strong> Don't show this page on the projector. Click a row's{' '}
        <em>Show</em> to see its PINs.
      </p>

      <div className="pins-tools">
        <input
          id="pins-search"
          className="input pins-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search a name or PIN"
          aria-label="Search a name or PIN"
          autoComplete="off"
        />
        <button className="btn btn-ghost" type="button" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Hide all PINs' : 'Show all PINs'}
        </button>
        <button className="btn btn-ghost" type="button" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {room.participants.length === 0 ? (
        <p className="center-page muted">Nobody has joined yet.</p>
      ) : rows.length === 0 ? (
        <p className="center-page muted">Nobody matches “{search}”.</p>
      ) : (
        <div className="pins-table-wrap">
          <table className="pins-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Their PIN</th>
                <th scope="col">PIN for their gift</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="visually-hidden">Show or hide</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const visible = showAll || shown.has(p.id) || searchingPin
                return (
                  <tr key={p.id}>
                    <th scope="row" className="pins-name">{p.name}</th>
                    <td className="pins-pin">{visible ? p.pin : MASK}</td>
                    <td className="pins-pin pins-gift">
                      {p.giftPin ? (visible ? p.giftPin : MASK) : <span className="muted">—</span>}
                    </td>
                    <td>
                      {isDrawn ? (
                        <span className={`pins-badge ${p.assigned ? 'pins-badge-ok' : 'pins-badge-wait'}`}>
                          {p.assigned ? 'Assigned' : 'Not assigned'}
                        </span>
                      ) : (
                        <span className="muted">Waiting for shuffle</span>
                      )}
                    </td>
                    <td className="pins-toggle">
                      {!showAll && !searchingPin && (
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => toggleRow(p.id)}
                          aria-label={`${shown.has(p.id) ? 'Hide' : 'Show'} PINs for ${p.name}`}
                        >
                          {shown.has(p.id) ? 'Hide' : 'Show'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
