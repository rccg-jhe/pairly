// Builds the random "flight plan" for each name in the storm: how far from
// the centre it orbits, how fast, where it starts, and how big it is.
//
// Why is this in its own function, called from a click handler, and not
// inside the component? React components must be "pure": rendering the same
// data must give the same result. Math.random() during render breaks that
// (React may render twice and get two different storms). So we roll the dice
// ONCE, when Shuffle is clicked, and keep the result in state.
//
// IMPORTANT: this layout is pure decoration. It knows nothing about the real
// assignments (it runs BEFORE the server even answers), so the animation
// cannot leak who got whom.

const COLORS = ['var(--primary)', 'var(--accent)', 'var(--text)']

const between = (min, max) => min + Math.random() * (max - min)

export function buildStormLayout(participants) {
  // Many names → smaller text, so the storm stays readable-ish, not a blob.
  const crowd = participants.length
  const maxSize = crowd > 60 ? 1.3 : crowd > 25 ? 1.7 : 2.3

  return participants.map((p, index) => ({
    id: p.id,
    name: p.name,
    radius: `${between(8, 42).toFixed(1)}vmin`, // distance from the centre
    duration: `${between(1.6, 3.4).toFixed(2)}s`, // time for one full lap
    angle: `${Math.round(between(0, 360))}deg`, // starting position on the circle
    delay: `-${between(0, 3).toFixed(2)}s`, // negative = start mid-lap, so they don't all line up
    size: `${between(0.9, maxSize).toFixed(2)}rem`,
    color: COLORS[index % COLORS.length],
    reverse: Math.random() < 0.25, // a few spin the other way, for chaos
  }))
}
