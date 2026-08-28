import { useCallback, useState } from 'react'
import { Panel } from '@xyflow/react'
import { REL_FAMILIES } from '../relMeta'
import Icon from './Icon'

const KEY = 'dmas.legend-open'

/**
 * Reading the canvas is not the same as reading the objects.
 *
 * The sidebar already names every STIX type in its own colour, so the cards
 * carry their own key. What has no key is everything the canvas says ABOUT
 * them: the colour of a relationship, which groups five questions rather than
 * naming twenty-six verbs, and the mark on a card that carries a note.
 *
 * Top right, under the canvas toolbar: the bottom left belongs to the triage
 * tray, which is 300px wide and would cover it, and the bottom right to the
 * minimap, which comes and goes with the viewport width.
 *
 * On the canvas and not in the help, because this is read WHILE looking at the
 * graph: you glance at a line, then at the key, then back. A modal two clicks
 * away is where you learn something once, not where you check it.
 *
 * Open by default, and shut for good once shut: nobody learns a colour code
 * from a panel they have to find, and nobody wants it a second week.
 */
function remembered(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'closed'
  } catch {
    // private windows and blocked site data both throw here, and a legend is
    // not worth taking the canvas down for
    return true
  }
}

export default function Legend() {
  const [open, setOpen] = useState(remembered)

  const toggle = useCallback(() => {
    setOpen((was) => {
      try {
        window.localStorage.setItem(KEY, was ? 'closed' : 'open')
      } catch {
        /* see `remembered` */
      }
      return !was
    })
  }, [])

  if (!open) {
    return (
      <Panel position="top-right" className="legend-shut">
        <button
          className="rf-btn"
          onClick={toggle}
          aria-expanded={false}
          title="What the colours on the canvas mean"
        >
          <Icon name="info" size={14} />
          Legend
        </button>
      </Panel>
    )
  }

  return (
    <Panel position="top-right" className="legend">
      <div className="legend-head">
        <span>Legend</span>
        <button className="legend-shut-btn" onClick={toggle} aria-expanded title="Hide the legend">
          <Icon name="cross" size={12} />
        </button>
      </div>
      <div className="legend-group">A relationship says</div>
      {REL_FAMILIES.map((f) => (
        <div key={f.id} className="legend-row" title={f.hint}>
          <span className="legend-line" style={{ background: f.color }} />
          <span className="legend-name">{f.label}</span>
          <em>{f.hint}</em>
        </div>
      ))}
      <div className="legend-group">A card carries</div>
      <div className="legend-row" title="A note left on this object, pinned to the canvas or not">
        <span className="legend-mark note" />
        <span className="legend-name">A note</span>
      </div>
      <div className="legend-row" title="An opinion: the analyst's own judgement on this object">
        <span className="legend-mark opinion" />
        <span className="legend-name">An opinion</span>
      </div>
    </Panel>
  )
}
