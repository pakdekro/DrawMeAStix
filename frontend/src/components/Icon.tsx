import type { CSSProperties, ReactNode } from 'react'

/**
 * In-house monoline icon set (#107).
 *
 * Inline SVG, `currentColor`, even stroke with square caps (consistent with the
 * 2px corners). No dependency: the whole point is to AVOID the
 * Lucide/Feather/Heroicons sets that every generated webapp shares.
 *
 * 24x24 viewBox; every glyph is drawn on that grid. Adding an icon = adding an
 * entry here, nothing else.
 */
const ICONS: Record<string, ReactNode> = {
  // clipboard
  paste: (
    <>
      <path d="M6 6h12v15H6z" />
      <path d="M9 3h6v3H9z" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </>
  ),
  // tray + downward arrow (file import)
  import: (
    <>
      <path d="M5 14v5h14v-5" />
      <path d="M12 4v9" />
      <path d="M8 9l4 4 4-4" />
    </>
  ),
  // tray + upward arrow (export)
  export: (
    <>
      <path d="M5 14v5h14v-5" />
      <path d="M12 13V4" />
      <path d="M8 8l4-4 4 4" />
    </>
  ),
  // small graph of linked nodes (a scenario = a subgraph ready to drop in).
  // The nodes are filled so they hide the ends of the edges.
  scenario: (
    <>
      <path d="M6 7.5H18" />
      <path d="M6 7.5 12 17.5" />
      <path d="M18 7.5 12 17.5" />
      <circle cx="6" cy="7.5" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="7.5" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17.5" r="2.6" fill="currentColor" stroke="none" />
    </>
  ),
  // sheet with a folded corner (template)
  doc: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
      <path d="M10 12h5" />
      <path d="M10 16h5" />
    </>
  ),
  // target / crosshair (generate an indicator)
  target: (
    <>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  // magnifier (enrich / search)
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  // two squares (duplicate)
  duplicate: (
    <>
      <path d="M9 9h10v10H9z" />
      <path d="M5 15V5h10" />
    </>
  ),
  // return arrow (send back to the tray)
  return: (
    <>
      <path d="M4 12h11a4 4 0 0 1 0 8" />
      <path d="M8 8l-4 4 4 4" />
    </>
  ),
  // wastebasket (delete)
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  check: <path d="M4 12l5 5L20 6" />,
  cross: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'chevron-up': <path d="M6 15l6-6 6 6" />,
  // ruled notepad (working notes)
  note: (
    <>
      <path d="M6 3h12v18H6z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </>
  ),
  // warning triangle
  warning: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v5" />
      <circle cx="12" cy="17.6" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  // image / photo (visual export)
  image: (
    <>
      <path d="M4 5h16v14H4z" />
      <circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none" />
      <path d="M4 16l5-4 4 3 3-3 4 4" />
    </>
  ),
  // open book (narrative)
  story: (
    <>
      <path d="M12 6C10 4.7 6.5 4.7 4 6v13c2.5-1.3 6-1.3 8 0" />
      <path d="M12 6c2-1.3 5.5-1.3 8 0v13c-2.5-1.3-6-1.3-8 0" />
      <path d="M12 6v13" />
    </>
  ),
  // top->bottom tree (re-arrange the layout)
  layout: (
    <>
      <path d="M12 5 7 17" />
      <path d="M12 5 17 17" />
      <circle cx="12" cy="5" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="7" cy="17" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="17" cy="17" r="2.4" fill="currentColor" stroke="none" />
    </>
  ),
  // circled i (info)
  info: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  // circled question mark (help) - distinct from `info`: this one opens
  // a help panel, the other comments on what is displayed
  help: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 2.9 3v1.4" />
      <circle cx="12.4" cy="16.6" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  // four squares (object palette)
  grid: (
    <>
      <path d="M4 4h7v7H4z" />
      <path d="M13 4h7v7h-7z" />
      <path d="M4 13h7v7H4z" />
      <path d="M13 13h7v7h-7z" />
    </>
  ),
  // mail tray (triage tray)
  tray: (
    <>
      <path d="M3 14 5.5 4h13L21 14v6H3z" />
      <path d="M3 14h5l1.2 2.4h5.6L16 14h5" />
    </>
  ),
}

export type IconName = keyof typeof ICONS

export default function Icon({
  name,
  size = 16,
  className,
  style,
}: {
  name: IconName
  size?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      className={className}
      style={{ verticalAlign: '-0.125em', flexShrink: 0, ...style }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  )
}
