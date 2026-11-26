import { useCallback, useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { apiFetch } from '../api.js'
import { buildStormLayout } from '../stormLayout.js'

// How long "Shuffled!" stays on the phone after the real shuffle (ms).
const STORM_DONE_MS = 1600
// Safety net: if the shuffle never finishes (e.g. the presenter's laptop dies
// mid-storm), stop the phone's storm this long after it was due to end.
const STORM_GIVE_UP_MS = 15000

// Keeps a participant's own status up to date, live.
// Returns { me, error, invalid, closed, removed, connected, storm }:
//   me        → the response from GET /api/participants/me
//   invalid   → true if the server no longer recognises our token
//   closed    → true if the host deleted the room while we were connected
//   removed   → true if the host removed THIS person from the room
//   storm     → null, or { names, phase, doneText } while the name storm shows
export function useParticipantStatus(token) {
  const [me, setMe] = useState(null)
  const [error, setError] = useState(null)
  const [invalid, setInvalid] = useState(false)
  const [closed, setClosed] = useState(false)
  const [removed, setRemoved] = useState(false)
  const [connected, setConnected] = useState(false)
  const [storm, setStorm] = useState(null)

  // Ask the server "what's my status?". Our token is the ONLY thing that says
  // who we are, so the answer can only ever be about us.
  // Returns the data too, so callers can react to it straight away.
  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch('/participants/me', { token })
      setMe(data)
      setError(null)
      return data
    } catch (err) {
      // 401 from the server ends with "Please join the room again." etc.
      // Either way, show the message; the page decides what to offer.
      setError(err.message)
      return null
    }
  }, [token])

  useEffect(() => {
    if (!token) return

    // Timers we start for the storm. Kept here so cleanup can cancel them.
    let giveUpTimer = null
    let doneTimer = null

    const socket = io({ auth: { role: 'participant', token } })

    // First connect AND every reconnect: fetch fresh status, in case the
    // shuffle happened while this phone was asleep or offline.
    socket.on('connect', () => {
      setConnected(true)
      refresh()
    })

    socket.on('disconnect', () => setConnected(false))

    socket.on('connect_error', (err) => {
      setConnected(false)
      if (err.message === 'unauthorized') {
        // The server doesn't know this token (e.g. the room was deleted).
        setInvalid(true)
        socket.disconnect()
      }
    })

    // The presenter clicked Shuffle → run the name storm on this phone too.
    // We only get names (no ids, no PINs), so we number them for React's keys.
    // The random layout is built HERE, in an event handler, never during render.
    socket.on('room:shuffling', (payload) => {
      const names = Array.isArray(payload?.names)
        ? payload.names.filter((n) => typeof n === 'string')
        : []
      const durationMs = Number(payload?.durationMs) || 0

      clearTimeout(doneTimer)
      setStorm({
        names: buildStormLayout(names.map((name, i) => ({ id: i, name }))),
        phase: 'storm',
      })

      clearTimeout(giveUpTimer)
      giveUpTimer = setTimeout(() => setStorm(null), durationMs + STORM_GIVE_UP_MS)
    })

    // The real shuffle happened. This ping carries NO data (Step 6), so we
    // fetch our own result using our own token, THEN end the storm.
    socket.on('room:drawn', async () => {
      const data = await refresh()
      clearTimeout(giveUpTimer)

      setStorm((current) =>
        current
          ? {
              ...current,
              phase: 'done',
              doneText: data?.assigned ? 'Your match is ready' : 'You have not been assigned yet',
            }
          : current // no storm running (e.g. joined mid-storm): nothing to finish
      )
      doneTimer = setTimeout(() => setStorm(null), STORM_DONE_MS)
    })

    // The host deleted the room. Our token is now meaningless, and the server
    // disconnects us right after this message.
    socket.on('room:deleted', () => {
      clearTimeout(giveUpTimer)
      clearTimeout(doneTimer)
      setStorm(null)
      setClosed(true)
    })

    // The presenter removed us (this arrives on our PERSONAL channel only).
    socket.on('participant:removed', () => {
      clearTimeout(giveUpTimer)
      clearTimeout(doneTimer)
      setStorm(null)
      setRemoved(true)
    })

    return () => {
      clearTimeout(giveUpTimer)
      clearTimeout(doneTimer)
      socket.disconnect()
    }
  }, [token, refresh])

  return { me, error, invalid, closed, removed, connected, storm }
}
