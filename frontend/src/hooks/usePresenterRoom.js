import { useCallback, useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { apiFetch, notifyLoginRequired } from '../api.js'

// Combines a fresh snapshot from the server with what we already have.
// Why not just replace? Timing: we might ask for the snapshot, then someone
// joins (we get a live "joined" event and add them), and THEN the older
// snapshot arrives without them. Replacing would make that name vanish.
//
// So we keep a name the snapshot is missing ONLY if it arrived by live event
// AFTER we asked for the snapshot (liveAt > requestedAt). Anyone else missing
// from the snapshot has left, and must disappear, not linger as a "ghost".
function mergeSnapshot(snapshot, previous, requestedAt) {
  if (!previous) return snapshot
  const known = new Set(snapshot.participants.map((p) => p.id))
  const joinedSince = previous.participants.filter(
    (p) => !known.has(p.id) && p.liveAt > requestedAt
  )
  const participants = [...snapshot.participants, ...joinedSince]
  return { ...snapshot, participants, participantCount: participants.length }
}

// Removes one person from the list (they left, or were removed).
function withoutParticipant(room, id) {
  if (!room) return room
  const participants = room.participants.filter((p) => p.id !== id)
  return { ...room, participants, participantCount: participants.length }
}

// A custom hook: a reusable bundle of state + effects.
// It keeps the presenter's view of a room up to date, live.
// Returns { room, error, connected, refresh, forget }.
// Access is checked by the server using the presenter's login cookie.
export function usePresenterRoom(code) {
  const [room, setRoom] = useState(null) // the data from GET /presenter
  const [error, setError] = useState(null) // a message to show, if any
  const [connected, setConnected] = useState(false) // is the live link up?

  // useCallback keeps the SAME function between renders (unless code
  // changes), so it's safe to use inside the effect below.
  const refresh = useCallback(async () => {
    try {
      const requestedAt = Date.now()
      const snapshot = await apiFetch(`/rooms/${code}/presenter`)
      setRoom((prev) => mergeSnapshot(snapshot, prev, requestedAt))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [code])

  useEffect(() => {
    // Open the live connection. io() with no URL = "same address as this page",
    // which goes through Vite's proxy to the backend. The browser sends the
    // login cookie with it, which is how the server knows we're the presenter.
    const socket = io({
      auth: { role: 'presenter', roomCode: code },
    })

    // 'connect' fires on the first connection AND after every reconnect
    // (Wi-Fi blip, laptop sleep). Each time, we fetch a fresh snapshot,
    // because we may have missed events while we were offline.
    socket.on('connect', () => {
      setConnected(true)
      refresh()
    })

    socket.on('disconnect', () => setConnected(false))

    socket.on('connect_error', (err) => {
      setConnected(false)
      // The server refused us. Retrying won't help, so stop.
      if (err.message === 'login required') {
        socket.disconnect()
        notifyLoginRequired() // back to the login form
      } else if (err.message === 'unauthorized') {
        setError('Room not found.')
        socket.disconnect()
      }
      // Any other error: Socket.io keeps retrying by itself.
    })

    // Someone joined → add them to the list straight away.
    socket.on('participant:joined', (participant) => {
      setRoom((prev) => {
        if (!prev) return prev // first snapshot not loaded yet; it will include them
        if (prev.participants.some((p) => p.id === participant.id)) return prev // no duplicates
        // liveAt: when WE heard about them (used by mergeSnapshot above)
        const participants = [...prev.participants, { ...participant, liveAt: Date.now() }]
        return { ...prev, participants, participantCount: participants.length }
      })
    })

    // Shuffle finished → reload to get everyone's new "Assigned" status.
    socket.on('room:drawn', refresh)

    // Someone left on their phone, or was removed → take their name off.
    socket.on('participant:left', ({ id }) => {
      setRoom((prev) => withoutParticipant(prev, id))
    })

    // The room was deleted (perhaps from another tab or device).
    // The server hangs up on us straight after, so there's nothing to reload.
    socket.on('room:deleted', () => {
      setRoom(null)
      setError('This room has been deleted.')
    })

    // Cleanup: when the page closes (or the code changes), hang up.
    return () => {
      socket.disconnect()
    }
  }, [code, refresh])

  // Lets the page take someone off the list straight away (e.g. right after
  // the presenter removes them), without waiting for the live event.
  const forget = useCallback((id) => setRoom((prev) => withoutParticipant(prev, id)), [])

  return { room, error, connected, refresh, forget }
}
