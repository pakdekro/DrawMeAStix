import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Icon from './Icon'

/**
 * Top bar dropdown menu.
 *
 * Four I/O buttons of equal weight sat in a row, with nothing to single out
 * the one you reach for at the end of an investigation, and the row grew with
 * every format added. The secondary entries move in here; "Export STIX"
 * stays the only filled button on screen.
 *
 * Closes on outside click and on Escape - a menu left open behind a dialog is
 * a bug you only ever see once it has shipped.
 */
export default function TopbarMenu({
  label,
  icon,
  children,
  /** the canvas reuses this menu with its own button skin (`rf-btn`) */
  buttonClass = 'topbar-btn',
}: {
  label: string
  icon: ReactNode
  children: (close: () => void) => ReactNode
  buttonClass?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="topbar-menu" ref={root}>
      <button
        className={`${buttonClass}${open ? ' on' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        {label}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={13} />
      </button>
      {open && (
        <div className="topbar-menu-list" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
