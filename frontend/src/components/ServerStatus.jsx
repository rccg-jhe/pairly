import { useEffect, useState } from 'react'
import { apiFetch } from '../api.js'

// A small "is the backend alive?" light in the footer.
// It proves the whole chain works: React → Vite proxy → Express → MongoDB.
export default function ServerStatus() {
  // State: a value that, when changed, makes React redraw this component.
  // It starts as 'checking' and becomes 'online', 'no-db' or 'offline'.
  const [status, setStatus] = useState('checking')

  // useEffect: "after this component appears on screen, run this code".
  // The empty [] at the end means "only once", not on every redraw.
  useEffect(() => {
    // If the component disappears before the answer arrives, ignore the answer.
    // (Setting state on a component that's gone is a classic React bug.)
    let ignore = false

    apiFetch('/health')
      .then((data) => {
        if (!ignore) setStatus(data.db === 'connected' ? 'online' : 'no-db')
      })
      .catch(() => {
        if (!ignore) setStatus('offline')
      })

    // The "cleanup" function: React runs it when the component goes away.
    return () => {
      ignore = true
    }
  }, [])

  const labels = {
    checking: 'Checking server…',
    online: '',
    'no-db': 'Server online, database offline',
    offline: 'Server offline: is the backend running?',
  }

  return (
    <span className={`status status-${status}`}>
      {status !== 'online' ? (
        <>
          <span className="status-dot" aria-hidden="true" />
          {labels[status]}
        </>
      ) : null}
    </span>
  )
}
