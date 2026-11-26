// Full-screen "name storm": every name swirls around the centre while the
// server does the real shuffle, then bursts away to reveal the result.
//
// Props:
//   names → the layout from buildStormLayout()
//   phase → 'storm' (spinning) or 'done' (burst + message)
//   doneText → the small line under "Shuffled!" (differs on the big screen and on phones)
//
// Used on BOTH the presenter's big screen and every participant's phone.
//
// All the movement is CSS. React only places each name and hands it its
// numbers through CSS custom properties (--radius, --angle…).
export default function NameStorm({ names, phase, doneText }) {
  return (
    <div className="storm" data-phase={phase}>
      {/* Screen readers get a short status instead of 100 flying names */}
      <p className="storm-message" role="status">
        {phase === 'done' ? (
          <>
            <span className="storm-title">Shuffled!</span>
            {doneText && <span className="storm-sub">{doneText}</span>}
          </>
        ) : (
          <span className="storm-title">Shuffling…</span>
        )}
      </p>

      <div className="storm-field" aria-hidden="true">
        {names.map((n) => (
          <div
            key={n.id}
            className={`storm-orbit${n.reverse ? ' storm-orbit-reverse' : ''}`}
            // CSS custom properties: the CSS animation reads these per name
            style={{
              '--radius': n.radius,
              '--angle': n.angle,
              '--duration': n.duration,
              '--delay': n.delay,
              '--size': n.size,
              '--color': n.color,
            }}
          >
            <span className="storm-name">{n.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
