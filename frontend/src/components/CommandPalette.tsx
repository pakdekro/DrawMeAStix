import { useEffect, useMemo, useRef, useState } from 'react'
import { searchAttack } from '../attack'
import type { AttackEntry } from '../attack'
import { findBridges } from '../bridges'
import { loadFramework } from '../datasets'
import { DEFAULT_FRAMEWORK, FRAMEWORKS } from '../frameworks'
import { allowedRelationships } from '../stix/relationships'
import { SCO_ORDER, SDO_ORDER, typeMeta } from '../stixMeta'
import { BUILTIN_TEMPLATES } from '../templates'
import type { ScenarioTemplate } from '../templates'
import Icon from './Icon'

/**
 * Command palette (Ctrl+K).
 *
 * Every capability of the app used to live behind its own panel: you had to
 * know WHERE to look before you could look. A single index now covers the
 * canvas objects, creation, the frameworks, scenarios and actions - discovery
 * no longer depends on the geography of the interface.
 *
 * The datasets (several hundred entries) are loaded on the FIRST open only,
 * never at startup: the palette must open instantly even offline, even if
 * that means not having its techniques yet.
 */

export interface Command {
  id: string
  group: string
  label: string
  /** secondary label aligned right (STIX type, ATT&CK ID, shortcut) */
  hint?: string
  /** color dot: reuses the STIX type color when there is one */
  color?: string
  /** the text actually fed to the filter (aliases, ID, type…) */
  haystack: string
  /** keeps the palette open: intermediate step of a chain */
  keepOpen?: boolean
  run: () => void
}

/**
 * Subsequence: "crx" finds "Corax", "expc2" finds "Exfiltration Over C2
 * Channel". Loose enough for fast typing, strict enough that the order of
 * the letters still counts.
 *
 * The corollary not to forget: index ONLY names and identifiers, never
 * prose. In a long text almost any short sequence ends up appearing in
 * order - when scenario descriptions were indexed, "corax" surfaced four
 * completely unrelated scenarios.
 */
function matches(haystack: string, needle: string): boolean {
  if (!needle) return true
  let i = 0
  for (let c = 0; c < haystack.length && i < needle.length; c++) {
    if (haystack[c] === needle[i]) i++
  }
  return i === needle.length
}

/** Cap per group: the list has to stay readable, not be exhaustive. */
const PER_GROUP = 6

/**
 * Can an object be linked to the selection, one way or the other?
 *
 * Offering an impossible target helps no one: the analyst picks it, and gets
 * a refusal. So we rule out up front whatever the STIX matrix rejects in
 * both directions.
 *
 * Canonical bridges (#37) count as a possible link - that is exactly what
 * they are for, connecting an SDO and an SCO that have no direct
 * relationship. They only hold for ONE source though: a bridge per object
 * would make no sense in bulk, and beginRelation already reserves them for
 * that case.
 *
 * The test depends on the TYPES only, which makes it memoizable: a busy
 * investigation has dozens of objects for a handful of distinct types.
 */
function canRelate(sourceTypes: string[], targetType: string): boolean {
  const forward = sourceTypes.every(
    (st) => allowedRelationships(st, targetType).length > 0,
  )
  if (forward) return true
  const backward = sourceTypes.every(
    (st) => allowedRelationships(targetType, st).length > 0,
  )
  if (backward) return true
  if (sourceTypes.length !== 1) return false
  const endpoint = (stix_type: string) => ({ stix_type, name: '', properties: {} })
  return findBridges(endpoint(sourceTypes[0]), endpoint(targetType)) !== null
}

export default function CommandPalette({
  open,
  onClose,
  entities,
  onGoTo,
  onCreate,
  onPickAttack,
  onPickTemplate,
  onRelate,
  selectedEntityId,
  selectedEntityIds,
  actions,
}: {
  open: boolean
  onClose: () => void
  entities: { id: string; stix_type: string; name: string }[]
  onGoTo: (id: string) => void
  onCreate: (stixType: string) => void
  onPickAttack: (entry: AttackEntry) => void
  onPickTemplate: (template: ScenarioTemplate) => void
  /** sources and target picked: the rest (verb, matrix) is up to the Workspace */
  onRelate: (sourceIds: string[], targetId: string) => void
  /** node selected when the palette opens: pre-fills the source */
  selectedEntityId?: string | null
  /** multiple selection: relate the whole batch to a single target */
  selectedEntityIds?: string[]
  actions: { label: string; hint?: string; run: () => void }[]
}) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  // One corpus per framework, fetched on the first open, kept afterwards.
  const [corpora, setCorpora] = useState<Record<string, AttackEntry[]>>({})
  /**
   * "Relate" mode: `null` outside the mode, `{}` waiting for the source,
   * `{ sources }` waiting for the target.
   */
  const [relate, setRelate] = useState<{ sources?: string[] } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset on every open: a palette that reopens on the previous search
  // forces you to clear it before typing.
  //
  // Depends on `open` ALONE. Loading the ATT&CK dataset used to live in the
  // same effect, with `attack.length` as a dependency: its arrival replayed
  // the reset and wiped what had just been typed. Typing fast right after
  // opening lost the first characters.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setCursor(0)
    setRelate(null)
    inputRef.current?.focus()
  }, [open])

  // Loading the dataset, split out for that very reason. Once only: the
  // length check is enough, the module already caches.
  // Each framework's OWN techniques. What one borrows from another by number
  // is already in that other one's group and builds the very same object:
  // offered twice, the palette would be asking the analyst to choose between
  // a thing and itself. A failure is silent, here: the palette works without
  // a dataset and has nothing useful to say about its absence.
  useEffect(() => {
    if (!open) return
    for (const framework of FRAMEWORKS) {
      if (corpora[framework.id]) continue
      loadFramework(framework.id)
        .then((corpus) =>
          setCorpora((c) => ({
            ...c,
            [framework.id]: corpus.entries.filter(
              (e) => (e.framework ?? DEFAULT_FRAMEWORK.id) === framework.id,
            ),
          })),
        )
        .catch(() => {})
    }
    // `corpora` deliberately out of the deps: it is what this effect writes,
    // and reading it here only decides what is already loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities])

  const commands = useMemo<Command[]>(() => {
    if (!open) return []
    const q = query.trim().toLowerCase().replace(/\s+/g, '')
    const out: Command[] = []

    // In "relate" mode the palette shows nothing but objects: mixing in the
    // usual commands at that point would have someone pick a scenario while
    // meaning to designate a target.
    if (relate) {
      const chosen = relate.sources ?? []
      const chosenTypes = [
        ...new Set(
          chosen.map((id) => byId.get(id)?.stix_type).filter((s): s is string => !!s),
        ),
      ]
      // on the first step we are after a source: any object will do. On the
      // second, only targets that can really be linked are offered.
      const viable = new Map<string, boolean>()
      const pool = entities.filter((e) => {
        if (chosen.includes(e.id)) return false
        if (chosenTypes.length === 0) return true
        let ok = viable.get(e.stix_type)
        if (ok === undefined) {
          ok = canRelate(chosenTypes, e.stix_type)
          viable.set(e.stix_type, ok)
        }
        return ok
      })
      for (const e of pool) {
        const haystack = `${e.name} ${e.stix_type}`.toLowerCase().replace(/\s+/g, '')
        if (!matches(haystack, q)) continue
        if (out.length >= 12) break
        out.push({
          id: `rel:${e.id}`,
          group: chosen.length > 0 ? 'Target' : 'Source',
          label: e.name,
          hint: e.stix_type,
          color: typeMeta(e.stix_type).color,
          haystack,
          // picking the source is only a step: the palette has to stay
          // open to chain on to the target
          keepOpen: chosen.length === 0,
          run: () => {
            if (chosen.length > 0) onRelate(chosen, e.id)
            else {
              setRelate({ sources: [e.id] })
              setQuery('')
              setCursor(0)
            }
          },
        })
      }
      return out
    }

    const push = (group: string, list: Command[]) => {
      const kept = list.filter((c) => matches(c.haystack, q)).slice(0, PER_GROUP)
      for (const c of kept) out.push({ ...c, group })
    }

    push(
      'On this canvas',
      entities.map((e) => ({
        id: `go:${e.id}`,
        group: '',
        label: e.name,
        hint: e.stix_type,
        color: typeMeta(e.stix_type).color,
        haystack: `${e.name} ${e.stix_type}`.toLowerCase().replace(/\s+/g, ''),
        run: () => onGoTo(e.id),
      })),
    )

    push(
      'Create',
      [...SDO_ORDER, ...SCO_ORDER].map((t) => ({
        id: `new:${t}`,
        group: '',
        label: `New ${typeMeta(t).label.toLowerCase()}…`,
        hint: t,
        color: typeMeta(t).color,
        haystack: `new${typeMeta(t).label}${t}`.toLowerCase().replace(/\s+/g, ''),
        run: () => onCreate(t),
      })),
    )

    // searchAttack does its own ranking (exact ID, prefix, aliases…), far
    // better than the subsequence: we let it decide. One group per framework,
    // named after it, because "Impersonate Account Holder" and "Spearphishing"
    // are not the same body of knowledge and the analyst is entitled to know
    // which one answered.
    if (query.trim().length >= 2) {
      for (const framework of FRAMEWORKS) {
        for (const entry of searchAttack(corpora[framework.id] ?? [], query.trim(), PER_GROUP)) {
          out.push({
            id: `${framework.id}:${entry.id}`,
            group: framework.label,
            label: entry.name,
            hint: entry.id,
            color: typeMeta(entry.type).color,
            haystack: '',
            run: () => onPickAttack(entry),
          })
        }
      }
    }

    push(
      'Scenarios',
      BUILTIN_TEMPLATES.map((tpl) => ({
        id: `tpl:${tpl.name}`,
        group: '',
        label: tpl.name,
        hint: 'scenario',
        haystack: tpl.name.toLowerCase().replace(/\s+/g, ''),
        run: () => onPickTemplate(tpl),
      })),
    )

    push('Relationships', [
      {
        id: 'relate',
        group: '',
        label:
          (selectedEntityIds?.length ?? 0) > 1
            ? `Relate the ${selectedEntityIds!.length} selected objects to…`
            : selectedEntityId
              ? `Relate ${byId.get(selectedEntityId)?.name ?? 'selection'} to…`
              : 'Relate two objects…',
        hint: 'relationship',
        color: 'var(--accent)',
        haystack: 'relatetwoobjectsselectedlinkconnectrelationship',
        keepOpen: true,
        run: () => {
          // whatever is already selected counts as the source, one object
          // or ten: that is the common case, it saves a step
          const preset =
            (selectedEntityIds?.length ?? 0) > 1
              ? selectedEntityIds
              : selectedEntityId
                ? [selectedEntityId]
                : undefined
          setRelate(preset ? { sources: preset } : {})
          setQuery('')
          setCursor(0)
        },
      },
    ])

    push(
      'Actions',
      actions.map((a) => ({
        id: `act:${a.label}`,
        group: '',
        label: a.label,
        hint: a.hint,
        haystack: a.label.toLowerCase().replace(/\s+/g, ''),
        run: a.run,
      })),
    )

    return out
  }, [
    open,
    query,
    entities,
    corpora,
    actions,
    relate,
    selectedEntityId,
    selectedEntityIds,
    byId,
    onGoTo,
    onCreate,
    onPickAttack,
    onPickTemplate,
    onRelate,
  ])

  // the cursor has to stay inside the list as typing makes it shrink
  const active = commands.length === 0 ? -1 : Math.min(cursor, commands.length - 1)

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const run = (cmd: Command | undefined) => {
    if (!cmd) return
    if (!cmd.keepOpen) onClose()
    cmd.run()
    // Picking a step with the MOUSE moves focus onto the clicked row, which
    // vanishes right away: the next keystrokes were lost, and the step after
    // that opened on an unfiltered list.
    if (cmd.keepOpen) requestAnimationFrame(() => inputRef.current?.focus())
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      // Esc steps back before it closes: picking the wrong source must not
      // force starting all over from a closed palette
      if (relate?.sources?.length) {
        setRelate({})
        setQuery('')
        setCursor(0)
      } else if (relate) {
        setRelate(null)
        setQuery('')
        setCursor(0)
      } else {
        onClose()
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (commands.length === 0 ? 0 : (c + 1) % commands.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) =>
        commands.length === 0 ? 0 : (c - 1 + commands.length) % commands.length,
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(commands[active])
    }
  }

  let lastGroup = ''

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="palette-input">
          <Icon name="search" size={15} />
          {relate?.sources?.length ? (
            <span className="palette-crumb" title="Relationship source">
              {relate.sources.length === 1
                ? (byId.get(relate.sources[0])?.name ?? '?')
                : `${relate.sources.length} objects`}
              <Icon name="chevron-down" size={12} style={{ transform: 'rotate(-90deg)' }} />
            </span>
          ) : null}
          <input
            ref={inputRef}
            value={query}
            spellCheck={false}
            placeholder={
              relate
                ? relate.sources?.length
                  ? 'Target object…'
                  : 'Source object…'
                : 'Jump to an object, create one, run an action…'
            }
            aria-label="Command palette"
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
            }}
            onKeyDown={onKeyDown}
          />
          <span className="kbd">Esc</span>
        </div>

        <div className="palette-list" ref={listRef}>
          {commands.length === 0 && (
            <p className="palette-empty">
              {relate?.sources?.length && !query.trim()
                ? // empty list with NO search: it is not the typing that
                  // finds nothing, no object on the canvas can be linked
                  'No object on this canvas can be linked to that selection, in either direction.'
                : 'Nothing matches.'}
            </p>
          )}
          {commands.map((cmd, i) => {
            const header = cmd.group !== lastGroup ? cmd.group : null
            lastGroup = cmd.group
            return (
              <div key={cmd.id}>
                {header && <div className="palette-group micro">{header}</div>}
                <button
                  className={`palette-row${i === active ? ' on' : ''}`}
                  data-active={i === active}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => run(cmd)}
                >
                  <span
                    className="palette-dot"
                    style={{ background: cmd.color ?? 'var(--text-dim)' }}
                  />
                  <span className="palette-label">{cmd.label}</span>
                  {cmd.hint && <span className="palette-hint">{cmd.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>

        <div className="palette-foot micro">
          <span>↑↓ move</span>
          <span>↵ {relate ? 'pick' : 'run'}</span>
          <span>esc {relate ? 'back' : 'close'}</span>
          {relate && <span>the verb comes next</span>}
        </div>
      </div>
    </div>
  )
}
