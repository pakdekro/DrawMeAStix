/**
 * Shared modal window (#206).
 *
 * Fourteen dialog boxes existed, each rewriting its own backdrop and its own
 * click-to-close, and **only two** handled Escape. Yet the application teaches
 * that key in its cheat sheet: a rule a tool announces without honouring it
 * costs more than no rule at all.
 *
 * The discipline applied to the command palette is reused here: focus placed
 * on open, focus trapped as long as the box is open, focus given back to the
 * trigger on close. Without that, reaching the first field of a modal meant
 * tabbing across the whole interface it covers.
 */

import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Count of open modals.
 *
 * The canvas listens for "/" and "?" at the window level: without this counter
 * those keys still fired under an open box, and search opened behind an opaque
 * backdrop. A counter rather than a boolean: two modals can stack (export
 * opened on top of the list, for example).
 */
let openCount = 0

export function isModalOpen(): boolean {
  return openCount > 0
}

export default function Modal({
  title,
  onClose,
  children,
  wide = false,
  className = '',
  /** Accessibility label for a box that has no visible title. */
  label,
}: {
  title?: ReactNode
  onClose: () => void
  children: ReactNode
  wide?: boolean
  className?: string
  label?: string
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  /**
   * `onClose` behind a ref so the effect below can run ONCE.
   *
   * It used to depend on `[onClose]`, and every caller passes an inline
   * arrow: `onClose={() => setShowEnrichSettings(false)}`. A new function on
   * every render of the parent means the effect tears down and sets up again
   * on every render of the parent. Its cleanup calls `trigger.focus()`, which
   * sends focus to whatever opened the box, that is OUTSIDE it; the new setup
   * then finds no focus inside and puts it on the first field.
   *
   * The result was a dialog where only the first field could be typed into:
   * click the second, focus was back on the first before the first keystroke.
   * It hid for so long because the theft is invisible while you are already
   * on the first field, which is where every dialog starts.
   */
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    openCount += 1
    // Element to hand focus back to: captured BEFORE any focus move.
    const trigger = document.activeElement as HTMLElement | null
    const box = boxRef.current

    // A field that already has focus (a form's autoFocus) keeps it: the
    // component that knows its content knows better than us where to start.
    if (box && !box.contains(document.activeElement)) {
      const fields = box.querySelectorAll<HTMLElement>('input, select, textarea')
      const first = fields[0] ?? box.querySelector<HTMLElement>(FOCUSABLE) ?? box
      first.focus()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        // stopPropagation: without it, a modal opened on top of another
        // would close both on a single Escape.
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !box) return
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      // The trap only closes at the ends: in between, Tab keeps its native
      // behaviour, inside fields included.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      } else if (!box.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      }
    }

    // capture: we run before the canvas window listeners
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      openCount -= 1
      // Hand focus back to whatever opened the box, and only if that element
      // is still there: a button unmounted meanwhile would send the focus
      // to <body>, so back to the very start of the interface.
      if (trigger && document.contains(trigger)) trigger.focus()
    }
    // Empty on purpose: mount and unmount only. See the ref above for what
    // depending on `onClose` here used to cost.
  }, [])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={boxRef}
        className={`modal${wide ? ' modal-wide' : ''}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : label}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 id={titleId}>{title}</h2>}
        {children}
      </div>
    </div>
  )
}
