import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// A QR code for the room's join link, for the big screen: point a phone
// camera at it and the join page opens with the room code already filled in.
//
// The code is made in the browser (the qrcode package), so nothing is sent
// anywhere. It's an SVG, so it stays sharp at any size on a projector.
export default function JoinQrCode({ url }) {
  const [svg, setSvg] = useState(null) // { url, src }, so an old code never shows for a new link

  useEffect(() => {
    let cancelled = false
    QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'M', // still scans if a bit of the screen is glary or blocked
      margin: 2, // the white "quiet zone" around it, which scanners need
      color: { dark: '#1c1b22', light: '#ffffff' },
    })
      .then((text) => {
        if (!cancelled) setSvg({ url, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}` })
      })
      .catch(() => {
        if (!cancelled) setSvg(null) // no QR code: the link and room code are still on screen
      })
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="join-qr">
      {svg?.url === url ? (
        <img className="join-qr-img" src={svg.src} alt="QR code to join this room" />
      ) : (

        
        <div className="join-qr-img join-qr-placeholder" aria-hidden="true" />
      )}
    </div>
  )
}
