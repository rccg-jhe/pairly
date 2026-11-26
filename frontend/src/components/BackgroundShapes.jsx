import { useEffect, useRef } from 'react'

// Eight soft, colourful shapes that float across every page.
// Pure decoration: aria-hidden hides them from screen readers, and the CSS
// makes them unclickable and keeps them BEHIND the content.
//
// The rules (so they never move as a group or bunch up):
//  1. Every shape has its OWN direction, 45° apart from the next
//     (8 shapes × 45° = a full circle). All directions turn slowly by the
//     SAME amount, so the paths curve, but two shapes can never be heading
//     the same way at the same time.
//  2. No bouncing off the edges: a bounce would change a shape's direction
//     (and could line it up with another). A shape that floats off one side
//     comes back in on the opposite side, still heading the same way.
//  3. Personal space WITHOUT turning: a shape that is moving away from a
//     close neighbour speeds up along its own heading, so pairs pull apart
//     quickly instead of drifting side by side. It never changes direction,
//     so rule 1 always holds. (A sideways push would bend the path and could
//     line two shapes up, which is exactly what we must avoid. Slowing down
//     doesn't work either: two shapes heading at each other would both slow
//     and hang around together.)
//  4. They start spread out in a grid (4 across, 2 down).

const SHAPES = [
  // kind, colour, size multiplier, spin speed (degrees per second, + or −)
  { kind: 'circle', color: 'var(--primary)', scale: 1.0, spin: 0 },
  { kind: 'triangle', color: 'var(--yellow)', scale: 1.0, spin: 9 },
  { kind: 'ring', color: 'var(--accent)', scale: 1.0, spin: 0 },
  { kind: 'square', color: 'var(--teal)', scale: 0.85, spin: -7 },
  { kind: 'star', color: 'var(--yellow)', scale: 0.85, spin: -10 },
  { kind: 'squiggle', color: 'var(--primary)', scale: 1.1, spin: 4 },
  { kind: 'half', color: 'var(--teal)', scale: 0.9, spin: 6 },
  { kind: 'plus', color: 'var(--accent)', scale: 0.75, spin: 8 },
]

// Shapes drawn with SVG (the others are plain CSS boxes).
const DRAWINGS = {
  triangle: <polygon points="50,8 94,88 6,88" />,
  plus: <path d="M38 6h24v32h32v24H62v32H38V62H6V38h32z" />,
  star: <polygon points="50,4 61,37 96,37 68,58 79,92 50,71 21,92 32,58 4,37 39,37" />,
  squiggle: <path d="M6 50 Q 20 32 34 50 T 62 50 T 90 50 T 118 50" />,
}

const TURN_PER_SECOND = (2 * Math.PI) / 120 // all headings turn together: one full turn every 2 minutes
const SPEED = 0.06 // per second, as a fraction of the screen's shorter side
const OFFSCREEN = 160 // px a shape may go past an edge before reappearing opposite
const PERSONAL_SPACE = 0.24 // as a fraction of the screen's shorter side

export default function BackgroundShapes() {
  // One ref per shape: lets the animation move the real DOM elements directly.
  const elementsRef = useRef([])

  useEffect(() => {
    const elements = elementsRef.current
    const width = () => window.innerWidth
    const height = () => window.innerHeight

    // Starting state for each shape: a grid cell, its own heading, its own spin.
    const state = SHAPES.map((shape, i) => ({
      x: ((i % 4) + 0.5) * (width() / 4) - 60,
      y: (Math.floor(i / 4) + 0.5) * (height() / 2) - 60,
      // 22.5°, 67.5°, 112.5°… exactly 45° apart (and never straight across)
      heading: (Math.PI / 8) * (2 * i + 1),
      angle: 0,
    }))

    const draw = () =>
      state.forEach((s, i) => {
        elements[i].style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.angle}deg)`
      })

    // Respect "Reduce motion": place them once, spread out, and stop there.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      draw()
      return
    }

    let frame
    let last = performance.now()

    function step(now) {
      // dt = seconds since the last frame. Capped, so a tab that was hidden
      // for a while doesn't make every shape jump across the screen at once.
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now

      const w = width()
      const h = height()
      const shortSide = Math.min(w, h)
      const speed = SPEED * shortSide
      const space = PERSONAL_SPACE * shortSide

      // 1. All headings turn together, so they always stay 45° apart.
      state.forEach((s) => {
        s.heading += TURN_PER_SECOND * dt
      })

      // 2. Personal space: work out each shape's speed for this frame.
      //    For every neighbour that's too close, compare our heading with the
      //    direction AWAY from that neighbour (a "dot product": +1 = heading
      //    straight away, -1 = heading straight at it). Only "away" counts:
      //    the more directly we're leaving, the more we speed up.
      const speeds = state.map((s) => {
        let factor = 1
        for (const other of state) {
          if (other === s) continue
          const dx = s.x - other.x
          const dy = s.y - other.y
          const distance = Math.hypot(dx, dy) || 1
          if (distance < space) {
            const closeness = (space - distance) / space // 0 (edge of space) … 1 (on top)
            const away = (dx / distance) * Math.cos(s.heading) + (dy / distance) * Math.sin(s.heading)
            factor += 2.5 * closeness * Math.max(0, away)
          }
        }
        return speed * Math.min(3, factor) // never slower than normal, at most 3× faster
      })

      // 3. Move each shape along its OWN heading only.
      state.forEach((s, i) => {
        s.x += Math.cos(s.heading) * speeds[i] * dt
        s.y += Math.sin(s.heading) * speeds[i] * dt
        s.angle += SHAPES[i].spin * dt

        // 4. Off one side → back in on the other (no bouncing).
        if (s.x > w + OFFSCREEN) s.x = -OFFSCREEN
        if (s.x < -OFFSCREEN) s.x = w + OFFSCREEN
        if (s.y > h + OFFSCREEN) s.y = -OFFSCREEN
        if (s.y < -OFFSCREEN) s.y = h + OFFSCREEN
      })

      draw()
      frame = requestAnimationFrame(step) // run again on the next screen refresh
    }

    frame = requestAnimationFrame(step)
    // Cleanup: stop the loop when the component goes away.
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="bg-shapes" aria-hidden="true">
      {SHAPES.map((shape, i) => {
        const style = { '--color': shape.color, '--scale': shape.scale }
        // Store each element in the ref array so the animation can move it.
        const ref = (el) => {
          elementsRef.current[i] = el
        }
        const drawing = DRAWINGS[shape.kind]
        return drawing ? (
          <svg
            key={shape.kind}
            ref={ref}
            className={`shape shape-${shape.kind}`}
            style={style}
            viewBox={shape.kind === 'squiggle' ? '0 0 124 100' : '0 0 100 100'}
          >
            {drawing}
          </svg>
        ) : (
          <span key={shape.kind} ref={ref} className={`shape shape-${shape.kind}`} style={style} />
        )
      })}
    </div>
  )
}
