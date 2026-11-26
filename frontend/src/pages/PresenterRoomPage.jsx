import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { apiFetch } from '../api.js'
import { usePresenterRoom } from '../hooks/usePresenterRoom.js'
import { buildStormLayout } from '../stormLayout.js'
import NameStorm from '../components/NameStorm.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import WordCloud from '../components/WordCloud.jsx'
import JoinQrCode from '../components/JoinQrCode.jsx'

// How long the storm spins BEFORE the real assignment, and how long
// "Shuffled!" stays up afterwards (ms). Shorter when the device asks for reduced motion.
const STORM_MS = 5000
const DONE_MS = 1600
const CALM_STORM_MS = 1000
const CALM_DONE_MS = 1200

// A promise that resolves after `ms` milliseconds: lets us "await a pause".
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// /present/:code → the big screen: join code, live names, Shuffle button.
export default function PresenterRoomPage() {
  const code = useParams().code.toUpperCase()
  const navigate = useNavigate()

  // Only reached when logged in (see RequireLogin in App.jsx).
  const { room, error, connected, refresh, forget } = usePresenterRoom(code)

  const [shuffling, setShuffling] = useState(false)
  const [shuffleError, setShuffleError] = useState(null)
  // null when hidden; otherwise { names, phase: 'storm' | 'done', doneText }
  const [storm, setStorm] = useState(null)

  // ONE confirmation dialog for every "Are you sure?" on this page:
  //   null                              → closed
  //   { kind: 'reshuffle' }
  //   { kind: 'remove', person: {...} }
  //   { kind: 'delete' }
  const [confirm, setConfirm] = useState(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [confirmError, setConfirmError] = useState(null)
  // True only after a successful delete, while we navigate away
  const [deleted, setDeleted] = useState(false)

  // While deleting, the server tells this tab "room:deleted" too. Show a calm
  // message instead of flashing the "This room has been deleted" error page.
  if (deleted || (confirm?.kind === 'delete' && confirmBusy)) {
    return <p className="center-page muted">Deleting room…</p>
  }

  if (error && !room) {
    return (
      <div className="center-page">
        <h1>Room {code}</h1>
        <p className="error" role="alert">{error}</p>
        <Link to="/present">← Back</Link>
      </div>
    )
  }

  if (!room) {
    return <p className="center-page muted">Loading room…</p>
  }

  // Values worked out from the data (no extra state needed).
  const joinUrl = `${window.location.origin}/join/${room.code}`
  const isDrawn = room.status === 'drawn'
  const assignedCount = room.participants.filter((p) => p.assigned).length
  const notAssignedCount = room.participantCount - assignedCount
  const canShuffle = room.participantCount >= 2 && !shuffling

  function closeConfirm() {
    setConfirm(null)
    setConfirmBusy(false)
    setConfirmError(null)
  }

  // Runs the dialog's action, with shared busy/error handling.
  async function runConfirmed(action) {
    setConfirmBusy(true)
    setConfirmError(null)
    try {
      await action()
    } catch (err) {
      // Keep the dialog open and show what went wrong.
      setConfirmError(err.message)
      setConfirmBusy(false)
    }
  }

  // redraw: true → shuffle an already-shuffled room again (everyone gets a new match)
  async function handleShuffle({ redraw = false } = {}) {
    setShuffling(true)
    setShuffleError(null)

    // Respect the device's "reduce motion" setting: shorter, calmer storm.
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Start the storm IMMEDIATELY, so the click feels instant.
    // The random layout is made here (in an event handler), not during render.
    setStorm({ names: buildStormLayout(room.participants), phase: 'storm' })

    try {
      // 1. Tell the server the storm has started, so every PHONE starts its
      //    storm too. Nothing is assigned yet. If this fails (e.g. the room was
      //    already shuffled in another tab), we stop here: catch → error message.
      const durationMs = calm ? CALM_STORM_MS : STORM_MS
      await apiFetch(`/rooms/${room.code}/shuffle-start`, {
        method: 'POST',
        body: { durationMs, redraw },
      })

      // 2. Let the storm build suspense on every screen at once.
      await wait(durationMs)

      // 3. NOW ask the server to do the real shuffle. The storm keeps spinning
      //    if the server is slow. The server's 'room:drawn' ping goes out at
      //    this moment, so phones reveal at the same time as the big screen,
      //    not while the names are still swirling.
      const result = await apiFetch(`/rooms/${room.code}/draw`, {
        method: 'POST',
        body: { redraw },
      })

      // Load the new "Assigned" statuses while the storm still covers the list.
      // (The socket's 'room:drawn' event refreshes too; this covers a dropped connection.)
      await refresh()

      // Burst the names away and show the result message for a moment.
      const doneText = `${plural(result.assignedCount, 'person has', 'people have')} a match`
      setStorm((s) => ({ ...s, phase: 'done', doneText }))
      await wait(calm ? CALM_DONE_MS : DONE_MS)
    } catch (err) {
      setShuffleError(err.message)
    } finally {
      // Whatever happened, never leave the storm stuck on screen.
      setStorm(null)
      setShuffling(false)
    }
  }

  function handleShuffleClick() {
    // First shuffle: go straight away. Re-shuffle replaces everyone's match: ask first.
    if (isDrawn) setConfirm({ kind: 'reshuffle' })
    else handleShuffle()
  }

  const confirmActions = {
    reshuffle: () =>
      runConfirmed(async () => {
        closeConfirm()
        await handleShuffle({ redraw: true })
      }),

    remove: () =>
      runConfirmed(async () => {
        const { person } = confirm
        await apiFetch(`/rooms/${room.code}/participants/${person.id}`, {
          method: 'DELETE',
        })
        forget(person.id) // off the list now; the live event would do it a moment later
        closeConfirm()
        await refresh() // someone may have just become "Not assigned"
      }),

    delete: () =>
      runConfirmed(async () => {
        await apiFetch(`/rooms/${room.code}`, { method: 'DELETE' })
        setDeleted(true)
        // Go back to "Host a room" with a note saying what happened.
        navigate('/present', { replace: true, state: { deletedCode: room.code } })
      }),
  }

  // The words in the dialog, depending on what we're confirming.
  const dialogs = {
    reshuffle: {
      title: 'Re-shuffle everyone?',
      confirmLabel: 'Re-shuffle',
      busyLabel: 'Starting…',
      tone: 'primary',
      body: (
        <>
          <p>
            All {plural(room.participantCount, 'person', 'people')} in the room get a brand-new
            match{notAssignedCount > 0 && <>, including the {notAssignedCount} not assigned yet</>}.
          </p>
          <p>Everyone's old match stops working, so make sure people know to check their phones.</p>
        </>
      ),
    },
    remove: confirm?.kind === 'remove' && {
      title: `Remove ${confirm.person.name}?`,
      confirmLabel: 'Remove',
      busyLabel: 'Removing…',
      tone: 'danger',
      body: (
        <>
          <p>
            {confirm.person.name} will be taken out of the room, and their phone will say they've
            been removed.
          </p>
          {isDrawn && (
            <p>
              The person who was looking for them will become <strong>Not assigned</strong>.
              Re-shuffle afterwards to give everyone a match again.
            </p>
          )}
        </>
      ),
    },
    delete: {
      title: `Delete room ${room.code}?`,
      confirmLabel: 'Delete everything',
      busyLabel: 'Deleting…',
      tone: 'danger',
      body: (
        <>
          <p>This permanently deletes:</p>
          <ul>
            <li>the room, its code and its description</li>
            <li>all {plural(room.participantCount, 'participant', 'participants')} and their names</li>
            <li>every PIN and every match</li>
          </ul>
          <p>
            Everyone's phone will show that the room has closed.{' '}
            <strong>This can't be undone.</strong>
          </p>
        </>
      ),
    },
  }
  const dialog = confirm ? dialogs[confirm.kind] : null

  return (
    <div className="presenter">
      {/* The storm sits on top of everything while it's running */}
      {storm && <NameStorm names={storm.names} phase={storm.phase} doneText={storm.doneText} />}

      {/* ── The join code, huge, for the back of the room ── */}
      <section className="join-panel">
        <p className="join-label">Scan to join</p>
        <JoinQrCode url={joinUrl} />
        <p className="join-label">or go to</p>
        <a className="join-url" href={joinUrl} target="_blank" rel="noopener noreferrer">
          {joinUrl.replace(/^https?:\/\//, '')}
        </a>
        <p className="join-label">Room code</p>
        <p className="room-code" aria-label={`Room code ${room.code.split('').join(' ')}`}>
          {room.code}
        </p>
        {/* The presenter's own description of this room, so people know it's the right one.
            (Rooms created before descriptions existed have none, so show nothing.) */}
        {room.description && <p className="join-desc">{room.description}</p>}
        <p className={`live ${connected ? 'live-on' : 'live-off'}`}>
          <span className="status-dot" aria-hidden="true" />
          {connected ? 'Live' : 'Reconnecting…'}
        </p>
      </section>

      {/* ── The people ── */}
      <section className="people-panel">
        <div className="people-header">
          <h2>{plural(room.participantCount, 'person', 'people')} joined</h2>
          {isDrawn && (
            <p className="muted">
              {assignedCount} assigned · {notAssignedCount} not assigned
            </p>
          )}
        </div>

        {/* The word cloud, with Shuffle in the middle. Click a name to remove that person. */}
        <WordCloud
          participants={room.participants}
          isDrawn={isDrawn}
          disabled={shuffling}
          onRemove={(person) => setConfirm({ kind: 'remove', person })}
        >
          {room.participants.length === 0 && <p className="cloud-empty muted">Waiting for people to join…</p>}
          <button className="btn btn-primary btn-lg cloud-shuffle" onClick={handleShuffleClick} disabled={!canShuffle}>
            {shuffling ? 'Shuffling…' : isDrawn ? 'Re-shuffle' : 'Shuffle'}
          </button>
          {room.participantCount === 1 && <p className="cloud-note muted">1 more person needed</p>}
        </WordCloud>

        <div className="actions">
          {room.participantCount > 0 && (
            <p className="muted cloud-tip">Tip: click a name to remove that person.</p>
          )}
          {isDrawn && notAssignedCount > 0 && room.participantCount >= 2 && (
            <p className="hint">
              {plural(notAssignedCount, 'person is', 'people are')} not assigned (joined late, or
              their match left; shown faded). Re-shuffle to include everyone.
            </p>
          )}
          {(shuffleError || error) && (
            <p className="error" role="alert">{shuffleError || error}</p>
          )}
        </div>
      </section>

      {/* ── Room admin: kept apart from Shuffle, so it can't be clicked by mistake ── */}
      <div className="room-admin">
        {/* Opens in a new tab, so the host can look at it on their own screen
            while the projector keeps showing the big screen. */}
        <a
          className="btn btn-ghost"
          href={`/present/${room.code}/pins`}
          target="_blank"
          rel="noopener noreferrer"
        >
          🔒 PIN list (private)
        </a>
        <button
          className="btn btn-danger-ghost"
          onClick={() => setConfirm({ kind: 'delete' })}
          disabled={shuffling}
        >
          Delete room
        </button>
      </div>

      <ConfirmDialog
        open={Boolean(dialog)}
        title={dialog?.title}
        confirmLabel={dialog?.confirmLabel}
        busyLabel={dialog?.busyLabel}
        tone={dialog?.tone}
        busy={confirmBusy}
        error={confirmError}
        onCancel={closeConfirm}
        onConfirm={() => confirmActions[confirm.kind]()}
      >
        {dialog?.body}
      </ConfirmDialog>
    </div>
  )
}
