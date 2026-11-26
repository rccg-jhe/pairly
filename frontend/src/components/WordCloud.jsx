import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { layoutWordCloud } from '../wordCloudLayout.js'

// The presenter's live word cloud: everyone's name, in different sizes and
// colours, arranged around whatever is passed as `children` (the Shuffle button),
// which always sits in the middle.
//
// New names pop in and the cloud grows outwards as people join. Clicking a
// name asks to remove that person (onRemove).
//
// After the shuffle, names of people who are NOT assigned are drawn faded with
// a dashed outline, so the host can spot them.
export default function WordCloud({ participants, isDrawn, disabled, onRemove, children }) {
  const cloudRef = useRef(null)
  const centerRef = useRef(null)
  // The real sizes on screen, measured after layout (and again when the window
  // or the button changes size).
  const [size, setSize] = useState({ width: 0, height: 0, holeWidth: 0, holeHeight: 0 })

  useLayoutEffect(() => {
    const cloud = cloudRef.current
    const center = centerRef.current
    const measure = () =>
      setSize((prev) => {
        const next = {
          width: cloud.clientWidth,
          // The height set by CSS (min-height), not the grown height
          height: parseFloat(getComputedStyle(cloud).minHeight) || cloud.clientHeight,
          holeWidth: center.offsetWidth,
          holeHeight: center.offsetHeight,
        }
        const same = Object.keys(next).every((k) => next[k] === prev[k])
        return same ? prev : next // unchanged → no re-render
      })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(cloud)
    observer.observe(center)
    return () => observer.disconnect()
  }, [])

  // Only the names and ids matter for the layout. Status changes (Assigned)
  // must not move anyone, so they're left out of the key.
  const layoutKey = participants.map((p) => `${p.id}:${p.name}`).join('|')
  const layout = useMemo(
    () => layoutWordCloud(participants, size.width, size.height, size.holeWidth, size.holeHeight),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutKey, size]
  )

  return (
    <div
      className="cloud"
      ref={cloudRef}
      // Grows taller only when a very big room needs more space
      style={layout.height > size.height ? { height: layout.height } : undefined}
    >
      {/* aria-live: screen readers announce new names as they appear */}
      <ul className="cloud-words" aria-live="polite">
        {participants.map((p) => {
          const spot = layout.words.get(p.id)
          if (!spot) return null // not measured yet
          return (
            <li
              key={p.id}
              className="cloud-spot"
              style={{
                transform: `translate(-50%, -50%) translate(${spot.x}px, ${spot.y}px)`,
                fontSize: `${spot.size}px`,
              }}
            >
              <button
                type="button"
                className={`cloud-word cloud-color-${spot.color}${
                  isDrawn && !p.assigned ? ' cloud-word-waiting' : ''
                }`}
                onClick={() => onRemove(p)}
                disabled={disabled}
                title={`Remove ${p.name}`}
                aria-label={`${p.name}${isDrawn ? (p.assigned ? ', assigned' : ', not assigned') : ''}. Remove`}
              >
                {p.name}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="cloud-center" ref={centerRef}>
        {children}
      </div>
    </div>
  )
}
