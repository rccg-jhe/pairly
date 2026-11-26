// Draws a "keep this safe" picture of a participant's PINs, as a PNG.
//
// Why draw it ourselves instead of "screenshotting" the page? A web page
// can't take a real screenshot. Libraries that fake one (html-to-image,
// html2canvas) copy the page's HTML into a picture, which often goes wrong
// on phones: missing fonts, shapes in odd places. Drawing on a <canvas> with
// plain JavaScript gives the same result on every device.
//
// What's in the picture: the room, your name, the PIN of the person you're
// paired with (big: the one you write on your gift) and your own PIN (smaller:
// the one others look for). The paired PIN changes if the host re-shuffles,
// so the result page makes a fresh picture whenever it changes.

const WIDTH = 1080 // 4:5 portrait, the shape photo apps show best
const HEIGHT = 1350
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

// Read the app's colours from index.css, so the picture always matches the app.
function readColours() {
  const css = getComputedStyle(document.documentElement)
  const get = (name, fallback) => css.getPropertyValue(name).trim() || fallback
  return {
    primary: get('--primary', '#6d4aff'),
    accent: get('--accent', '#ff6b8b'),
    yellow: get('--yellow', '#ffc83d'),
    teal: get('--teal', '#22c3b4'),
    text: get('--text', '#1c1b22'),
    muted: get('--muted', '#5f5c6b'),
    border: get('--border', '#e3e1ec'),
  }
}

// ── The background shapes, frozen in place ──────────────────
// The same eight shapes, colours and see-through levels as the floating
// background (BackgroundShapes.jsx + index.css), placed around the edges
// so they frame the card instead of sitting behind the PIN.
// x, y = centre · size = width · angle in degrees
const SHAPES = [
  { kind: 'star', color: 'yellow', x: 150, y: 150, size: 120, angle: -10, opacity: 0.45 },
  { kind: 'triangle', color: 'yellow', x: 995, y: 175, size: 150, angle: 12, opacity: 0.45 },
  { kind: 'circle', color: 'primary', x: 70, y: 470, size: 210, angle: 0, opacity: 0.22 },
  { kind: 'half', color: 'teal', x: 1020, y: 700, size: 170, angle: -24, opacity: 0.3 },
  { kind: 'plus', color: 'accent', x: 85, y: 900, size: 105, angle: 8, opacity: 0.45 },
  { kind: 'square', color: 'teal', x: 150, y: 1210, size: 145, angle: -14, opacity: 0.28 },
  { kind: 'ring', color: 'accent', x: 975, y: 1110, size: 165, angle: 0, opacity: 0.3 },
  { kind: 'squiggle', color: 'primary', x: 860, y: 1290, size: 230, angle: -6, opacity: 0.3 },
]

function drawShape(ctx, shape, colours) {
  const color = colours[shape.color]
  const s = shape.size
  ctx.save()
  ctx.translate(shape.x, shape.y)
  ctx.rotate((shape.angle * Math.PI) / 180)
  ctx.globalAlpha = shape.opacity
  ctx.fillStyle = color
  ctx.strokeStyle = color

  // The SVG ones are drawn on a 100×100 grid, so scale that grid to the size.
  const grid = (points) => {
    ctx.beginPath()
    points.forEach(([px, py], i) => {
      const x = ((px - 50) / 100) * s
      const y = ((py - 50) / 100) * s
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fill()
  }

  switch (shape.kind) {
    case 'circle':
      ctx.beginPath()
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'ring': {
      const line = s * 0.14
      ctx.lineWidth = line
      ctx.beginPath()
      ctx.arc(0, 0, s / 2 - line / 2, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'square':
      ctx.beginPath()
      ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.22)
      ctx.fill()
      break
    case 'half':
      ctx.beginPath()
      ctx.arc(0, s / 4, s / 2, Math.PI, 0)
      ctx.closePath()
      ctx.fill()
      break
    case 'triangle':
      grid([[50, 8], [94, 88], [6, 88]])
      break
    case 'star':
      grid([[50, 4], [61, 37], [96, 37], [68, 58], [79, 92], [50, 71], [21, 92], [32, 58], [4, 37], [39, 37]])
      break
    case 'plus':
      grid([[38, 6], [62, 6], [62, 38], [94, 38], [94, 62], [62, 62], [62, 94], [38, 94], [38, 62], [6, 62], [6, 38], [38, 38]])
      break
    case 'squiggle': {
      // Same wave as the SVG path "M6 50 Q 20 32 34 50 T 62 50 T 90 50 T 118 50"
      const k = s / 124
      ctx.scale(k, k)
      ctx.translate(-62, -50)
      ctx.lineWidth = 9
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(6, 50)
      ctx.quadraticCurveTo(20, 32, 34, 50)
      ctx.quadraticCurveTo(48, 68, 62, 50)
      ctx.quadraticCurveTo(76, 32, 90, 50)
      ctx.quadraticCurveTo(104, 68, 118, 50)
      ctx.stroke()
      break
    }
  }
  ctx.restore()
}

// ── Text helpers ────────────────────────────────────────────

// Draw text centred on x, with extra space between letters. (Done by hand:
// the canvas letterSpacing setting is missing in older phone browsers.)
function spacedText(ctx, text, x, y, spacing) {
  const chars = [...text]
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1)
  let cursor = x - total / 2
  ctx.textAlign = 'left'
  chars.forEach((c, i) => {
    ctx.fillText(c, cursor, y)
    cursor += widths[i] + spacing
  })
  ctx.textAlign = 'center'
}

// Split text into at most `maxLines` lines that fit `maxWidth`, adding "…" if cut.
function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width <= maxWidth) {
      line = test
    } else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)

  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last.trimEnd()}…`
  return kept
}

// Shorten one line to fit, e.g. a very long name.
function fitLine(ctx, text, maxWidth) {
  return wrapLines(ctx, text, maxWidth, 1)[0] ?? ''
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null) // no logo is fine: the picture still works
    img.src = src
  })
}

// ── The picture ─────────────────────────────────────────────

// details = { pin, assignedPin, name, roomCode, roomDescription }
// Returns a PNG Blob.
export async function createPinImage({ pin, assignedPin, name, roomCode, roomDescription }) {
  const colours = readColours()
  const churchLogo = await loadImage('/jesus-house-exeter-logo.png')

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // Page
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  SHAPES.forEach((shape) => drawShape(ctx, shape, colours))

  // ── Header: the two-dot logo + "Pairly" ──
  ctx.font = `800 54px ${FONT}`
  const word = 'Pairly'
  const wordWidth = ctx.measureText(word).width
  const dotR = 22
  const dotsWidth = dotR * 2 + 28 // two circles overlapping, like .logo-dots
  const gap = 20
  const startX = WIDTH / 2 - (dotsWidth + gap + wordWidth) / 2
  const headerY = 150
  ctx.fillStyle = colours.primary
  ctx.beginPath()
  ctx.arc(startX + dotR, headerY - 19, dotR, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = colours.accent
  ctx.beginPath()
  ctx.arc(startX + dotR + 28, headerY - 19, dotR, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = colours.text
  ctx.textAlign = 'left'
  ctx.fillText(word, startX + dotsWidth + gap, headerY)
  ctx.textAlign = 'center'

  // ── Room: description (up to 2 lines), then "Room XK4P" ──
  let y = 285
  if (roomDescription) {
    ctx.font = `700 50px ${FONT}`
    ctx.fillStyle = colours.text
    for (const line of wrapLines(ctx, roomDescription, 820, 2)) {
      ctx.fillText(line, WIDTH / 2, y)
      y += 62
    }
    y += 4
  }
  ctx.font = `600 34px ${FONT}`
  ctx.fillStyle = colours.muted
  spacedText(ctx, `ROOM ${roomCode}`, WIDTH / 2, y, 5)

  // ── The card ──
  const card = { x: 150, y: y + 60, w: 780, h: 640, r: 56 }
  ctx.save()
  ctx.shadowColor = 'rgba(28, 27, 34, 0.12)'
  ctx.shadowBlur = 70
  ctx.shadowOffsetY = 24
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(card.x, card.y, card.w, card.h, card.r)
  ctx.fill()
  ctx.restore()

  // Soft colour wash across the top of the card, then the border
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(card.x, card.y, card.w, card.h, card.r)
  ctx.clip()
  const wash = ctx.createLinearGradient(card.x, card.y, card.x + card.w, card.y)
  wash.addColorStop(0, colours.primary)
  wash.addColorStop(1, colours.accent)
  ctx.fillStyle = wash
  ctx.fillRect(card.x, card.y, card.w, 14)
  // A pale panel along the bottom for "Your PIN"
  ctx.fillStyle = '#f7f6fb'
  ctx.fillRect(card.x, card.y + 455, card.w, card.h - 455)
  ctx.restore()
  ctx.lineWidth = 3
  ctx.strokeStyle = colours.border
  ctx.beginPath()
  ctx.moveTo(card.x, card.y + 455)
  ctx.lineTo(card.x + card.w, card.y + 455)
  ctx.stroke()
  ctx.beginPath()
  ctx.roundRect(card.x, card.y, card.w, card.h, card.r)
  ctx.stroke()

  const cx = WIDTH / 2
  // Name
  ctx.font = `700 46px ${FONT}`
  ctx.fillStyle = colours.text
  ctx.fillText(fitLine(ctx, name, card.w - 120), cx, card.y + 110)

  // The PIN to write on the gift: the star of the picture
  ctx.font = `700 30px ${FONT}`
  ctx.fillStyle = colours.muted
  spacedText(ctx, 'WRITE THIS PIN ON YOUR GIFT', cx, card.y + 190, 4)

  ctx.font = `800 190px ${FONT}`
  const pinGradient = ctx.createLinearGradient(cx - 260, 0, cx + 260, 0)
  pinGradient.addColorStop(0, colours.primary)
  pinGradient.addColorStop(1, colours.accent)
  ctx.fillStyle = pinGradient
  spacedText(ctx, assignedPin, cx, card.y + 385, 26)

  // Your own PIN, in the pale panel
  ctx.font = `700 26px ${FONT}`
  ctx.fillStyle = colours.muted
  spacedText(ctx, 'YOUR OWN PIN', cx, card.y + 515, 4)
  ctx.font = `800 76px ${FONT}`
  ctx.fillStyle = colours.text
  spacedText(ctx, pin, cx, card.y + 595, 14)

  // When it was saved, so pictures from different events are easy to tell apart
  const saved = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  ctx.font = `500 28px ${FONT}`
  ctx.fillStyle = colours.muted
  ctx.fillText(`Keep it secret! · Saved on ${saved}`, cx, card.y + card.h + 70)

  // ── Footer: the church logo ──
  if (churchLogo) {
    const h = 90
    const w = (churchLogo.width / churchLogo.height) * h
    ctx.drawImage(churchLogo, cx - w / 2, HEIGHT - 55 - h, w, h)
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image.'))), 'image/png')
  )
}

// Phones: open the share sheet ("Save Image" puts it in Photos).
// Everywhere else: a normal download.
// Returns 'shared', 'downloaded' or 'cancelled'.
export async function savePinImage(blob, fileName) {
  const file = new File([blob], fileName, { type: 'image/png' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'My Pairly PINs' })
      return 'shared'
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled' // they closed the share sheet
      // Anything else (e.g. not allowed): fall back to a download below
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser a moment to start the download before freeing the memory
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
