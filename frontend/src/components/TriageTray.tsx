import { useEffect, useRef, useState } from 'react'
import { typeMeta } from '../stixMeta'
import type { Entity } from '../types'
import Icon from './Icon'

/** height of a tray row - kept aligned with .triage-row (index.css) */
const ROW_H = 28
/** past that, the list scrolls (the CSS max-height bounds it too) */
const MAX_RESERVED = 8

/**
 * Provenance as a short label: "doc:CTI report - Campaign… .pdf" took up the
 * whole width of the tray and squeezed the candidate name down to zero
 * pixels. The full detail stays in the row tooltip.
 */
function sourceLabel(source: string): string {
  if (source.startsWith('doc:')) return 'doc'
  if (source.startsWith('enrich:')) return source.slice('enrich:'.length)
  return source
}

/**
 * Triage tray (#12): `candidate` entities (imported third-party bundle,
 * extraction, enrichers, or a node sent back to the tray) wait here for the
 * analyst's decision. Nothing reaches the canvas - nor the export - unvalidated.
 *
 * Document scale (#97): a real report produces dozens of candidates at
 * once. They are grouped by STIX type, foldable, with accept/reject per
 * group.
 *
 * The panel is anchored at the bottom: without a reserved height, every ✓/✕
 * would slide the header and the buttons out from under the cursor (#80). So
 * the list height is frozen at the highest level reached, as long as the
 * tray is not emptied.
 *
 * Keyboard triage: j/k to move around, y/n to accept or reject. The
 * shortcuts are deliberately bound TO THE PANEL (tabIndex + onKeyDown), not
 * to the window: an "n" listened for globally would reject a candidate while
 * you are working on the canvas. The tray must therefore hold focus, which a
 * click on it is enough to obtain.
 */
export default function TriageTray({
  open,
  onToggle,
  candidates,
  onConfirm,
  onReject,
  onConfirmAll,
  onConfirmGroup,
  onRejectGroup,
  contextByEntity,
}: {
  /** folding lifted to the Workspace: the rail opens the tray from its counter */
  open: boolean
  onToggle: () => void
  candidates: Entity[]
  onConfirm: (entity: Entity) => void
  onReject: (entity: Entity) => void
  onConfirmAll: () => void
  onConfirmGroup: (entities: Entity[]) => void
  onRejectGroup: (entities: Entity[]) => void
  /** detection excerpt per entity (imported document): helps the triage */
  contextByEntity?: Map<string, string>
}) {
  const [reservedRows, setReservedRows] = useState(0)
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const trayRef = useRef<HTMLDivElement>(null)
  /**
   * Candidates already sent off but not yet gone from the props.
   *
   * Holding "y" down delivers several keydowns BEFORE React has re-rendered:
   * without this ref - synchronous, unlike state - the three keystrokes all
   * targeted the same candidate, and two were lost.
   */
  const actedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setReservedRows((r) => (candidates.length === 0 ? 0 : Math.max(r, candidates.length)))
  }, [candidates.length])

  useEffect(() => {
    listRef.current?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor, candidates.length])

  useEffect(() => {
    // purge: what has really left the tray no longer has to be ignored
    const ids = new Set(candidates.map((c) => c.id))
    for (const id of actedRef.current) {
      if (!ids.has(id)) actedRef.current.delete(id)
    }
  }, [candidates])

  if (candidates.length === 0) return null

  // groups by STIX type, in order of first appearance (stable)
  const groups = new Map<string, Entity[]>()
  for (const c of candidates) {
    const list = groups.get(c.stix_type)
    if (list) list.push(c)
    else groups.set(c.stix_type, [c])
  }
  const toggleFold = (t: string) =>
    setFolded((f) => {
      const next = new Set(f)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })

  // flat list of the rows ACTUALLY visible: a folded group must not trap
  // the cursor on rows nobody can see
  const visible = [...groups.entries()].flatMap(([type, list]) =>
    folded.has(type) ? [] : list,
  )
  const at = Math.min(cursor, Math.max(0, visible.length - 1))

  /**
   * Acts on the first candidate still pending, starting from the cursor.
   *
   * The cursor does NOT move: the next row comes up in its place, which lets
   * you chain actions by holding the key down. Focus is also given back to
   * the tray, which the action may have stolen by opening a panel elsewhere.
   */
  const act = (fn: (entity: Entity) => void) => {
    const target =
      visible.slice(at).find((v) => !actedRef.current.has(v.id)) ??
      visible.find((v) => !actedRef.current.has(v.id))
    if (!target) return
    actedRef.current.add(target.id)
    fn(target)
    requestAnimationFrame(() => trayRef.current?.focus())
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || visible.length === 0) return
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(Math.min(at + 1, visible.length - 1))
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(Math.max(at - 1, 0))
    } else if (e.key === 'y' || e.key === 'Enter') {
      e.preventDefault()
      act(onConfirm)
    } else if (e.key === 'n' || e.key === 'Delete') {
      e.preventDefault()
      act(onReject)
    }
  }

  return (
    <div className="triage-tray" ref={trayRef} tabIndex={0} onKeyDown={onKeyDown}>
      <button className="triage-header" onClick={onToggle}>
        Triage tray
        <span className="triage-count">{candidates.length}</span>
        <span className="spacer" />
        <span className="triage-keys">j k y n</span>
        <Icon name={open ? 'chevron-down' : 'chevron-up'} size={14} />
      </button>
      {open && (
        <>
          <div
            className="triage-list"
            ref={listRef}
            style={{ minHeight: Math.min(reservedRows, MAX_RESERVED) * ROW_H }}
          >
            {[...groups.entries()].map(([type, list]) => (
              <div key={type}>
                <div className="triage-group">
                  <button className="triage-fold" onClick={() => toggleFold(type)}>
                    <Icon name={folded.has(type) ? 'chevron-up' : 'chevron-down'} size={12} />
                    <span className="dot" style={{ background: typeMeta(type).color }} />
                    {typeMeta(type).label}
                    <span className="triage-count">{list.length}</span>
                  </button>
                  <button
                    className="triage-ok"
                    title={`Accept all ${list.length} on the canvas`}
                    onClick={() => onConfirmGroup(list)}
                  >
                    <Icon name="check" size={14} />
                  </button>
                  <button
                    className="triage-no"
                    title={`Reject all ${list.length} (delete)`}
                    onClick={() => onRejectGroup(list)}
                  >
                    <Icon name="cross" size={13} />
                  </button>
                </div>
                {!folded.has(type) &&
                  list.map((c) => (
                    <div
                      key={c.id}
                      className={`triage-row${visible[at]?.id === c.id ? ' on' : ''}`}
                      data-cursor={visible[at]?.id === c.id}
                      onClick={() => setCursor(visible.findIndex((v) => v.id === c.id))}
                      title={[
                        `${typeMeta(c.stix_type).label} - ${c.name}`,
                        `source: ${c.source}`,
                        contextByEntity?.get(c.id),
                      ]
                        .filter(Boolean)
                        .join('\n')}
                    >
                      <span className="triage-name">{c.name}</span>
                      <span className="triage-source">{sourceLabel(c.source)}</span>
                      <button
                        className="triage-ok"
                        title="Accept on the canvas"
                        onClick={() => onConfirm(c)}
                      >
                        <Icon name="check" size={14} />
                      </button>
                      <button
                        className="triage-no"
                        title="Reject (delete)"
                        onClick={() => onReject(c)}
                      >
                        <Icon name="cross" size={13} />
                      </button>
                    </div>
                  ))}
              </div>
            ))}
          </div>
          {reservedRows > 1 && (
            // visibility (and not an unmount): the button disappears when
            // dropping to 1 candidate without sliding the header (#80)
            <button
              className="triage-all"
              style={{ visibility: candidates.length > 1 ? 'visible' : 'hidden' }}
              onClick={onConfirmAll}
            >
              Accept all ({candidates.length})
            </button>
          )}
        </>
      )}
    </div>
  )
}
