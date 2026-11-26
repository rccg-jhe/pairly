import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { apiFetch } from '../api.js'
import { getParticipant, clearParticipant } from '../storage.js'
import { useParticipantStatus } from '../hooks/useParticipantStatus.js'
import NameStorm from '../components/NameStorm.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { createPinImage, savePinImage } from '../pinImage.js'

// /result → a participant's private screen on their own phone.
export default function ResultPage() {
  const navigate = useNavigate()
  const [session] = useState(() => getParticipant())
  const { me, error, invalid, closed, removed, connected, storm } = useParticipantStatus(
    session?.token
  )

  // The PIN to find is hidden until tapped, so people nearby can't peek.
  // We remember WHICH PIN was revealed, not just "revealed: yes". After a
  // re-shuffle the PIN changes, so it no longer matches and hides itself again.
  const [revealedPin, setRevealedPin] = useState(null)
  const revealed = me?.assignedPin != null && revealedPin === me.assignedPin

  // ── "Save my PINs" picture: the PIN for the gift + your own PIN ──
  // Only once you have a match. Drawn as soon as we know the details, NOT when
  // the button is tapped: iPhones only open the share sheet if it happens
  // right after the tap, and drawing first would take too long.
  // The key includes assignedPin, so a re-shuffle makes a fresh picture.
  const pinImageKey = me?.assignedPin
    ? [me.pin, me.assignedPin, me.name, me.roomCode, me.roomDescription].join('|')
    : null
  const [pinImage, setPinImage] = useState(null) // { key, blob }
  // idle | saving | saved | error, remembered per picture: after a re-shuffle
  // the key changes, so "Saved ✓" goes back to "Save" for the new match.
  const [save, setSave] = useState({ key: null, status: 'idle' })
  const saveState = save.key === pinImageKey ? save.status : 'idle'
  const setSaveState = (status) => setSave({ key: pinImageKey, status })
  const imageDetails = me && {
    pin: me.pin,
    assignedPin: me.assignedPin,
    name: me.name,
    roomCode: me.roomCode,
    roomDescription: me.roomDescription,
  }
  useEffect(() => {
    if (!pinImageKey) return
    let cancelled = false
    createPinImage(imageDetails)
      .then((blob) => !cancelled && setPinImage({ key: pinImageKey, blob }))
      .catch(() => !cancelled && setPinImage(null))
    return () => {
      cancelled = true
    }
    // pinImageKey sums up everything the picture shows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinImageKey])

  async function handleSavePin() {
    setSaveState('saving')
    try {
      // Normally ready already; if not (very slow phone), draw it now.
      const blob =
        pinImage?.key === pinImageKey
          ? pinImage.blob
          : await createPinImage(imageDetails)
      const outcome = await savePinImage(blob, `pairly-${me.roomCode}-gift-pin-${me.assignedPin}.png`)
      setSaveState(outcome === 'cancelled' ? 'idle' : 'saved')
    } catch {
      setSaveState('error')
    }
  }

  // "Leave this room?" dialog
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState(null)

  // Forget this room on this phone and go back to the join form.
  function forgetAndGoToJoin() {
    clearParticipant()
    navigate('/join', { replace: true })
  }

  // Really leave: remove us on the server first, so nobody gets assigned
  // someone who isn't there any more. Then forget it on this phone.
  async function leaveRoom() {
    setLeaving(true)
    setLeaveError(null)
    try {
      await apiFetch('/participants/me', { method: 'DELETE', token: session.token })
      forgetAndGoToJoin()
    } catch (err) {
      // 401 = the server already doesn't know us (room deleted, etc.): fine, just go.
      if (err.status === 401) return forgetAndGoToJoin()
      setLeaveError(err.message)
      setLeaving(false)
    }
  }

  // ── Not joined on this phone ──
  if (!session) {
    return (
      <div className="center-page">
        <h1>You haven't joined a room</h1>
        <Link className="btn btn-primary btn-lg" to="/join">Join a room</Link>
      </div>
    )
  }

  // ── The host deleted the room while we were watching ──
  if (closed) {
    return (
      <div className="center-page">
        <h1>The host has closed this room</h1>
        <p className="lead">The room and everyone's PINs have been deleted.</p>
        <div className="stack">
          <button className="btn btn-primary btn-lg" onClick={forgetAndGoToJoin}>Join another room</button>
        </div>
      </div>
    )
  }

  // ── The presenter removed this person from the room ──
  if (removed) {
    return (
      <div className="center-page">
        <h1>You've been removed from this room</h1>
        <p className="lead">The host took you off the list. If that's a mistake, ask them and join again.</p>
        <div className="stack">
          <button className="btn btn-primary btn-lg" onClick={forgetAndGoToJoin}>Join again</button>
        </div>
      </div>
    )
  }

  // ── The server no longer knows us (room removed, data reset…) ──
  if (invalid) {
    return (
      <div className="center-page">
        <h1>This room is no longer available</h1>
        <p className="lead">Please join again with the code on the big screen.</p>
        <button className="btn btn-primary btn-lg" onClick={forgetAndGoToJoin}>Join again</button>
      </div>
    )
  }

  // ── Still loading (or failed before we got any data) ──
  if (!me) {
    return (
      <div className="center-page">
        {error ? <p className="error" role="alert">{error}</p> : <p className="muted">Loading…</p>}
      </div>
    )
  }

  const isDrawn = me.roomStatus === 'drawn'

  return (
    <div className="center-page result">
      {/* The same name storm as the big screen, started by the presenter's click */}
      {storm && <NameStorm names={storm.names} phase={storm.phase} doneText={storm.doneText} />}

      {/* The presenter's description, so the participant can check they're in the right room */}
      {me.roomDescription && <p className="room-description">{me.roomDescription}</p>}
      <p className="muted">
       {me.name}
      </p>

      

      {/* ── Your match: one of three states ── */}
      <section className="pin-card pin-card-target" aria-live="polite">
        {!isDrawn && (
          <>
            <p className="join-label">Your match</p>
            <p className="waiting">Waiting for the host to shuffle…</p>
          </>
        )}

        {isDrawn && !me.assigned && (
          <>
            <p className="join-label">Your match</p>
            <p className="waiting">You have not been assigned yet.</p>
          </>
        )}

        {isDrawn && me.assigned && (
          <>
            <p className="join-label">Write this PIN on your gift</p>
            {revealed ? (
              <>
                <p className="pin pin-target">{me.assignedPin}</p>
                <button
                  className="btn btn-ghost btn-sm save-pin"
                  type="button"
                  onClick={handleSavePin}
                  disabled={saveState === 'saving'}
                >
                  {saveState === 'saving' ? 'Preparing…' : saveState === 'saved' ? 'Saved ✓' : 'Save my PINs as an image'}
                </button>
                {saveState === 'error' && (
                  <p className="error" role="alert">Couldn't save the image. Take a screenshot instead.</p>
                )}
              </>
            ) : (
              <button className="btn btn-primary btn-lg reveal" onClick={() => setRevealedPin(me.assignedPin)}>
                Tap to reveal
              </button>
            )}
            <p className="muted">Keep it secret!</p>
          </>
        )}
      </section>

      <p className={`live ${connected ? 'live-on' : 'live-off'}`}>
        <span className="status-dot" aria-hidden="true" />
        {connected ? 'Live' : 'Reconnecting…'}
      </p>

      <button className="btn btn-ghost leave" onClick={() => setConfirmingLeave(true)}>
        Not you? Leave this room
      </button>

      <ConfirmDialog
        open={confirmingLeave}
        title="Leave this room?"
        confirmLabel="Leave room"
        busyLabel="Leaving…"
        busy={leaving}
        error={leaveError}
        onCancel={() => {
          setConfirmingLeave(false)
          setLeaveError(null)
        }}
        onConfirm={leaveRoom}
      >
        <p>
          You'll be taken out of room {me.roomCode} and lose your PIN
          {isDrawn && me.assigned ? ' and your match' : ''}. To take part again you'd need to
          re-join and get a new PIN.
        </p>
      </ConfirmDialog>
    </div>
  )
}
