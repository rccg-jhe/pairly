// Works out where each name goes in the presenter's word cloud.
//
// How it works (the classic word-cloud recipe):
//  1. Every name gets a size and a colour from its id, so they never change
//     while the room is open.
//  2. Names are placed in JOIN ORDER. Each one starts at the centre and walks
//     outwards along a spiral until it finds a spot that doesn't overlap the
//     Shuffle button or any name already placed. So the cloud grows outwards
//     as people join, and earlier names keep their spots.
//  3. If the names don't all fit, everything is made a step smaller and
//     placed again. The steps are fixed (100%, 88%, 77%…), so the cloud only
//     rearranges itself now and then, not on every join.
//  4. If they still don't fit at the smallest readable size (a very big room),
//     the cloud grows taller instead of making the names unreadable.
//
// Pure function: same input → same output. No randomness, so React can call
// it during render.

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const BASE_SIZE = 60 // px, the biggest names while the room is quiet
const MIN_SIZE = 16 // px, still readable from the back of a room
const SCALE_STEP = 0.88
const EDGE = 8 // px kept clear along the cloud's edges
const CELL = 48 // px, the size of a "grid square" used to find neighbours fast
const SPIRAL = 3 // px the spiral moves outwards per radian
const STEP = 5 // px moved along the spiral between tries

// A small, stable number from a string (the same id always gives the same number).
function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// A mix of sizes, like a Slido cloud: a few big, most medium and small.
function sizeFactor(h) {
  const tier = h % 10
  if (tier === 0) return 1
  if (tier <= 2) return 0.8
  if (tier <= 5) return 0.66
  return 0.56
}

// Measuring text needs a canvas. One is enough, reused for every name.
let measureCtx = null
function textWidth(text, size) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  measureCtx.font = `800 ${size}px ${FONT}`
  return measureCtx.measureText(text).width
}

// The size of a name's button: the text plus the padding in .cloud-word
const boxWidth = (name, size) => textWidth(name, size) + size * 0.5
const boxHeight = (size) => size * 1.3

// Do two boxes (centre x/y, width w, height h) come closer than `gap`?
function overlaps(a, b, gap) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w + gap * 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h + gap * 2
}

// Try to place every name at one scale. Returns the placements, or null if
// some name found no room.
function placeAll(words, scale, width, height, hole) {
  const halfW = width / 2 - EDGE
  const halfH = height / 2 - EDGE
  const gap = Math.max(3, 8 * scale)
  // Stretch the spiral to the box's shape, so a wide box fills wide.
  const stretchX = Math.sqrt(width / height)
  const stretchY = 1 / stretchX
  const maxRadius = Math.hypot(halfW / stretchX, halfH / stretchY)

  const grid = new Map() // "col,row" → placed boxes touching that square
  const cellsOf = (box) => {
    const keys = []
    const c0 = Math.floor((box.x - box.w / 2 - gap) / CELL)
    const c1 = Math.floor((box.x + box.w / 2 + gap) / CELL)
    const r0 = Math.floor((box.y - box.h / 2 - gap) / CELL)
    const r1 = Math.floor((box.y + box.h / 2 + gap) / CELL)
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) keys.push(`${c},${r}`)
    return keys
  }
  const fits = (box) => {
    if (Math.abs(box.x) + box.w / 2 > halfW || Math.abs(box.y) + box.h / 2 > halfH) return false
    if (overlaps(box, hole, gap)) return false
    for (const key of cellsOf(box)) {
      const others = grid.get(key)
      if (others) for (const other of others) if (overlaps(box, other, gap)) return false
    }
    return true
  }

  const placed = []
  for (const word of words) {
    const size = Math.max(MIN_SIZE, word.factor * BASE_SIZE * scale)
    const box = { x: 0, y: 0, w: boxWidth(word.name, size), h: boxHeight(size) }

    // Each name starts its spiral facing a different way, so the cloud fills
    // in all around the button instead of one side first.
    const start = ((word.h >>> 8) % 360) * (Math.PI / 180)
    let found = false
    for (let t = 0; SPIRAL * t <= maxRadius; ) {
      const r = SPIRAL * t
      box.x = Math.cos(start + t) * r * stretchX
      box.y = Math.sin(start + t) * r * stretchY
      if (fits(box)) {
        found = true
        break
      }
      t += STEP / Math.max(r, STEP) // the same distance along the spiral each try
    }
    if (!found) return null

    const done = { ...box, id: word.id, size, color: (word.h >>> 4) % 4 }
    placed.push(done)
    for (const key of cellsOf(done)) {
      if (!grid.has(key)) grid.set(key, [])
      grid.get(key).push(done)
    }
  }
  return placed
}

// participants: [{ id, name }] in join order
// width, height: the cloud's size in px
// holeWidth, holeHeight: the space kept free in the middle (the Shuffle button)
// Returns { height, words: Map(id → { x, y, size, color }) }, x/y from the centre.
// `height` is bigger than the one passed in only when a very big room needed more room.
export function layoutWordCloud(participants, width, height, holeWidth, holeHeight) {
  const words = new Map()
  if (!width || !height || participants.length === 0) return { height, words }

  const list = participants.map((p) => {
    const h = hash(String(p.id))
    return { id: p.id, name: p.name, h, factor: sizeFactor(h) }
  })
  const hole = { x: 0, y: 0, w: holeWidth + 16, h: holeHeight + 16 }

  // First guess at the scale: compare the space the names need with the space
  // there is, then round DOWN to a fixed step, so small changes don't move everything.
  const needed = list.reduce((sum, w) => {
    const size = w.factor * BASE_SIZE
    return sum + (boxWidth(w.name, size) + 16) * (boxHeight(size) + 16)
  }, 0)
  const free = Math.max(1, width * height * 0.55 - hole.w * hole.h)
  let step = needed <= free ? 0 : Math.ceil(Math.log(free / needed) / 2 / Math.log(SCALE_STEP))

  let boxHeightNow = height
  for (let attempt = 0; attempt < 40; attempt++) {
    const scale = SCALE_STEP ** step
    const placed = placeAll(list, scale, width, boxHeightNow, hole)
    if (placed) {
      placed.forEach((p) => words.set(p.id, { x: p.x, y: p.y, size: p.size, color: p.color }))
      return { height: boxHeightNow, words }
    }
    // Smaller names if they're still readable; otherwise a taller cloud.
    if (BASE_SIZE * 0.56 * SCALE_STEP ** (step + 1) >= MIN_SIZE) step++
    else boxHeightNow = Math.round(boxHeightNow * 1.2)
  }
  return { height: boxHeightNow, words } // never reached in practice
}
