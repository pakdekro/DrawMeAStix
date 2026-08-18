import { memo } from 'react'

import type { TypeCount } from '../stixMeta'

/**
 * Status bar: the summary before the detail.
 *
 * Every one of these numbers already lived in the state, none was shown - you
 * had to open a panel or start an export to know where the investigation
 * stood. They fit in 24px.
 *
 * The "local only" marker is not decorative: the product's central promise
 * (the server never sees the data) was only visible in the README. Here it is
 * on screen at all times.
 */

/** "3 min", "2 h", "5 d" - enough to situate, never any longer. */
function since(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 90) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`
  return `${Math.round(seconds / 86400)} d ago`
}

/**
 * Backup state.
 *
 * The export IS the save file: the README says so, and nothing on screen ever
 * told you whether that file existed nor how old it was.
 *
 * The reference is `updated_at`, compared to the state the file contains. It
 * does NOT move when a node is dragged - `savePositions` rewrites the row
 * without calling `touch()`. Dragging a node does change the bundle though,
 * since positions are embedded in it: the indicator therefore stays green
 * while the file on disk no longer quite matches. That is deliberate, a
 * visual rearrangement having no business demanding a new export.
 */
function exportState(
  updatedAt?: string,
  exportedAt?: string,
  /**
   * `updated_at` of the state the file actually contains.
   *
   * The comparison used to be against the DOWNLOAD time, which is necessarily
   * later than any change made before it: a canvas modified between building
   * the bundle and the click therefore came out green, "the bundle on disk
   * matches this canvas", on a file that no longer matched. Falls back to
   * `exportedAt` for investigations exported before the field existed.
   */
  exportedStateAt?: string,
): { label: string; tone: 'warn' | 'ok'; title: string } {
  if (!exportedAt) {
    return {
      label: 'never exported',
      tone: 'warn',
      title: 'The export is the save file: nothing on disk holds this investigation yet.',
    }
  }
  const reference = exportedStateAt ?? exportedAt
  if (updatedAt && updatedAt > reference) {
    return {
      label: 'unexported changes',
      tone: 'warn',
      title: `Last export ${since(exportedAt)}. The file on disk no longer matches this canvas.`,
    }
  }
  return {
    label: `exported ${since(exportedAt)}`,
    tone: 'ok',
    title: 'The bundle on disk matches this canvas.',
  }
}

/**
 * The type breakdown behind the object counter.
 *
 * A total is the right thing to show and the wrong thing to stop at: "24
 * objects" says the investigation has weight, not what it is made of. The
 * detail existed nowhere short of counting nodes by colour on the canvas.
 *
 * Opened on hover and on keyboard focus, not on click: it answers a question
 * you have in passing, and a panel that has to be dismissed costs more than
 * the answer is worth.
 */
function Breakdown({ types }: { types: TypeCount[] }) {
  const sdo = types.filter((t) => t.kind === 'sdo')
  const sco = types.filter((t) => t.kind === 'sco')
  const section = (title: string, rows: TypeCount[]) =>
    rows.length === 0 ? null : (
      <>
        <div className="breakdown-head">{title}</div>
        {rows.map((t) => (
          <div className="breakdown-row" key={t.stix_type}>
            <i className="breakdown-dot" style={{ background: t.color }} />
            <span className="breakdown-label">{t.label}</span>
            <b>{t.count}</b>
          </div>
        ))}
      </>
    )
  return (
    <span className="breakdown" role="tooltip">
      {section('Objects (SDO)', sdo)}
      {section('Observables (SCO)', sco)}
    </span>
  )
}

function StatusBar({
  objects,
  breakdown,
  relationships,
  candidates,
  notes,
  lintWarnings,
  updatedAt,
  exportedAt,
  exportedStateAt,
}: {
  objects: number
  breakdown: TypeCount[]
  relationships: number
  candidates: number
  notes: number
  lintWarnings: number
  updatedAt?: string
  exportedAt?: string
  exportedStateAt?: string
}) {
  const backup = exportState(updatedAt, exportedAt, exportedStateAt)

  return (
    <div className="statusbar">
      {/* One element, not a wrapper plus a stat: below 900px the bar hides
          its secondary counters by nth-child, and an extra node there would
          hide the wrong ones. */}
      <span
        className={`stat${breakdown.length > 0 ? ' has-breakdown' : ''}`}
        tabIndex={breakdown.length > 0 ? 0 : undefined}
      >
        <b>{objects}</b> object{objects === 1 ? '' : 's'}
        {breakdown.length > 0 && <Breakdown types={breakdown} />}
      </span>
      <span className="stat">
        <b>{relationships}</b> relationship{relationships === 1 ? '' : 's'}
      </span>
      <span className="stat">
        <b>{notes}</b> note{notes === 1 ? '' : 's'}
      </span>
      {candidates > 0 && (
        <span className="stat warn" title="Nothing reaches the graph without your approval">
          <b>{candidates}</b> awaiting triage
        </span>
      )}
      {lintWarnings > 0 && (
        <span
          className="stat warn"
          title="Validation warnings on this investigation - see the export dialog for the detail"
        >
          <b>{lintWarnings}</b> lint
        </span>
      )}
      <span className="stat-gap" />
      <span className={`stat ${backup.tone}`} title={backup.title}>
        <i className="stat-dot" />
        {backup.label}
      </span>
      {/* The badge states the promise, so it is also the way to the page that
          explains it (#225): where the data lives, what leaves, how long it is
          kept. Anywhere else, that page would only be found by someone already
          looking for it. */}
      <a
        className="stat ok stat-link"
        href="/about"
        target="_blank"
        rel="noreferrer"
        title="Everything stays in this browser's IndexedDB. The server only ever serves static files. Click for the details."
      >
        local only
      </a>
      {/* Injected at build time from package.json: it is the first thing
          asked of anyone reporting a defect, and the only one a user
          cannot guess. */}
      <span className="stat version" title="Application version">
        v{__APP_VERSION__}
      </span>
    </div>
  )
}

export default memo(StatusBar)
