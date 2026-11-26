import { useEffect, useRef } from 'react'

// A reusable "Are you sure?" pop-up. Used for: deleting a room, re-shuffling,
// removing a person, and leaving a room. (It started life as DeleteRoomDialog;
// once a second use appeared, it became generic. Don't generalise too early,
// but do it when the second real use shows up.)
//
// Uses the browser's built-in <dialog> element. showModal() gives us, for free:
//  - a dark backdrop, and the page behind can't be clicked
//  - keyboard focus moves into the dialog (to the first button: Cancel)
//  - the Escape key closes it
//
// Props:
//   open          → show or hide
//   title         → the question, e.g. "Delete room XK4P?"
//   children      → the explanation (any JSX)
//   confirmLabel  → e.g. "Delete everything"
//   busyLabel     → shown on the button while working, e.g. "Deleting…"
//   tone          → 'danger' (red, for things that destroy data) or 'primary'
//   busy, error   → request in progress / failure message
//   onCancel, onConfirm
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busyLabel = 'Working…',
  tone = 'danger',
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}) {
  // A ref gives us the real <dialog> DOM element, so we can call its methods.
  const dialogRef = useRef(null)

  // Keep the real dialog in step with the `open` prop.
  useEffect(() => {
    const dialog = dialogRef.current
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="confirm-dialog-title"
      // Escape key / dialog closed by the browser → tell the parent
      onClose={onCancel}
    >
      <h2 id="confirm-dialog-title">{title}</h2>
      {children}

      {error && <p className="error" role="alert">{error}</p>}

      <div className="dialog-actions">
        {/* Cancel comes FIRST, so it's the button that gets focus: pressing
            Enter by accident cancels instead of confirming. */}
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
