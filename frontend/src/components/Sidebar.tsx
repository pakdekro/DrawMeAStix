import { memo, useState } from 'react'
import type { AttackEntry } from '../attack'
import { FRAMEWORKS } from '../frameworks'
import { SCO_ORDER, SDO_ORDER, typeMeta } from '../stixMeta'
import { TEMPLATE_FAMILIES, templatesOfFamily } from '../templates'
import type { TemplateFamily } from '../templates'
import type { ScenarioTemplate } from '../templates'
import AttackPalette from './AttackPalette'
import Icon from './Icon'
import type { IconName } from './Icon'

/**
 * Rail + single panel.
 *
 * The three sections (frameworks, entity creation, scenarios) used to be stacked
 * in one scrolling column: scenarios fell below the fold and the whole rail
 * scrolled while the canvas stayed put. The rail now switches ONE panel at a
 * time, and clicking the active section folds it away - the canvas takes the
 * panel's 180px back when nobody needs it.
 *
 * The triage tray is not a panel: it stays anchored at the bottom of the
 * canvas (the reserved-height logic depends on it, #80). The rail only
 * carries its count and its opening, so the curation step announces itself
 * instead of existing only once filled.
 *
 * Memoised - its props are stable callbacks, so it does not re-render on
 * every drag frame on the canvas.
 */

type PanelId = 'objects' | 'attack' | 'scenarios' | 'labels'

const PANELS: { id: PanelId; icon: IconName; label: string }[] = [
  { id: 'objects', icon: 'grid', label: 'Objects and observables' },
  // Named from the registry rather than by hand: written out, the label still
  // said two frameworks on the day the fourth shipped.
  {
    id: 'attack',
    icon: 'search',
    label: `Frameworks (${FRAMEWORKS.map((f) => f.short).join(', ')})`,
  },
  { id: 'scenarios', icon: 'scenario', label: 'Scenarios' },
  { id: 'labels', icon: 'tag', label: 'Labels in use' },
]

function Sidebar({
  onAdd,
  onPaste,
  onPickAttack,
  onPickTemplate,
  onLoadTemplate,
  candidateCount,
  triageOpen,
  onToggleTriage,
  panel,
  onPanel,
  labels,
  activeLabel,
  onPickLabel,
}: {
  onAdd: (stixType: string) => void
  onPaste: () => void
  onPickAttack: (entry: AttackEntry) => void
  onPickTemplate: (template: ScenarioTemplate) => void
  onLoadTemplate: (file: File) => void
  candidateCount: number
  triageOpen: boolean
  onToggleTriage: () => void
  /** driven by the Workspace: window width decides the initial state, and
      both Ctrl+B and the command palette must be able to change it */
  panel: PanelId | null
  onPanel: (panel: PanelId | null) => void
  /** the analyst's own vocabulary, most used first */
  labels: { value: string; count: number }[]
  activeLabel: string | null
  onPickLabel: (value: string) => void
}) {
  // Which family of scenarios is on show. Local to the panel: it is a way of
  // looking, not a piece of the investigation.
  const [family, setFamily] = useState<TemplateFamily>('intrusion')

  return (
    <>
      <nav className="rail" aria-label="Panels">
        {PANELS.map((p) => (
          <button
            key={p.id}
            className={`rail-btn${panel === p.id ? ' on' : ''}`}
            title={p.label}
            aria-label={p.label}
            aria-pressed={panel === p.id}
            onClick={() => onPanel(panel === p.id ? null : p.id)}
          >
            <Icon name={p.icon} size={17} />
          </button>
        ))}
        <span className="rail-gap" />
        <button
          className={`rail-btn${triageOpen && candidateCount > 0 ? ' on' : ''}`}
          title={
            candidateCount > 0
              ? `Triage tray - ${candidateCount} awaiting a decision`
              : 'Triage tray - empty'
          }
          aria-label="Triage tray"
          aria-pressed={triageOpen && candidateCount > 0}
          disabled={candidateCount === 0}
          onClick={onToggleTriage}
        >
          <Icon name="tray" size={17} />
          {candidateCount > 0 && <span className="rail-badge">{candidateCount}</span>}
        </button>
      </nav>

      {panel && (
        <aside className="sidebar">
          {panel === 'objects' && (
            <>
              <h3 className="micro">Objects (SDO)</h3>
              <div className="chip-grid">
                {SDO_ORDER.map((t) => (
                  <button key={t} className="chip" onClick={() => onAdd(t)} title={typeMeta(t).label}>
                    <span className="dot" style={{ background: typeMeta(t).color }} />
                    {typeMeta(t).label}
                  </button>
                ))}
              </div>
              <h3 className="micro">Observables (SCO)</h3>
              <div className="chip-grid">
                {SCO_ORDER.map((t) => (
                  <button key={t} className="chip" onClick={() => onAdd(t)} title={typeMeta(t).label}>
                    <span className="dot" style={{ background: typeMeta(t).color }} />
                    {typeMeta(t).label}
                  </button>
                ))}
                <button className="chip" onClick={onPaste}>
                  <Icon name="paste" size={13} />
                  Paste IOCs…
                </button>
              </div>
            </>
          )}

          {/* Its own panel and not a section of the objects one: that panel is
              a creation palette, every chip in it makes something, and a chip
              that filters instead would be a second verb wearing the same
              clothes. Here the whole panel is about what is already on the
              canvas. */}
          {panel === 'labels' && (
            <>
              <h3 className="micro">Labels in use</h3>
              {labels.length === 0 ? (
                <p className="hint">
                  Nothing is labelled yet. Labels are yours to coin, in the inspector, and
                  they travel in the bundle as the STIX `labels` field.
                </p>
              ) : (
                <div className="chip-grid">
                  {labels.map((l) => (
                    <button
                      key={l.value}
                      className={`chip label-chip${activeLabel === l.value ? ' on' : ''}`}
                      aria-pressed={activeLabel === l.value}
                      title={`Light up the ${l.count} object${l.count > 1 ? 's' : ''} labelled "${l.value}"`}
                      onClick={() => onPickLabel(l.value)}
                    >
                      {l.value}
                      <span className="chip-count">{l.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {panel === 'attack' && <AttackPalette onPick={onPickAttack} />}

          {panel === 'scenarios' && (
            <>
              {/* One family at a time, behind the same switch the framework
                  panel uses two icons above. Three headings and twenty-six
                  buttons in one column meant scrolling past two families to
                  reach the third, and somebody opening this panel is working
                  an intrusion, a fraud or an AI incident, not the three at the
                  same minute. The count is on the chip because it is the
                  question you ask before clicking one. */}
              <h3 className="micro">Scenarios</h3>
              <div className="chip-grid tpl-families">
                {TEMPLATE_FAMILIES.map((f) => (
                  <button
                    key={f.id}
                    className={`chip${family === f.id ? ' on' : ''}`}
                    aria-pressed={family === f.id}
                    onClick={() => setFamily(f.id)}
                  >
                    {f.label}
                    <span className="chip-count">{templatesOfFamily(f.id).length}</span>
                  </button>
                ))}
              </div>
              {templatesOfFamily(family).map((tpl) => (
                <button
                  key={tpl.name}
                  className="palette-btn"
                  title={tpl.description}
                  onClick={() => onPickTemplate(tpl)}
                >
                  <Icon name="scenario" />
                  {tpl.name}
                </button>
              ))}
              <label className="palette-btn tpl-load">
                <Icon name="doc" />
                Load a scenario…
                <input
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) onLoadTemplate(file)
                    e.target.value = ''
                  }}
                />
              </label>
            </>
          )}
        </aside>
      )}
    </>
  )
}

export default memo(Sidebar)
