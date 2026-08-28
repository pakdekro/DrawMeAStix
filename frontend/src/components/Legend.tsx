import { useCallback, useState } from 'react'
import { Panel } from '@xyflow/react'
import { REL_FAMILIES } from '../relMeta'
import Icon from './Icon'

const KEY = 'dmas.legend-open'

/**
 * Reading the canvas is not the same as reading the objects.
 *
 * The sidebar already names every STIX type in its own colour, so the cards
 * carry their own key. What has none is everything the canvas says ABOUT
 * them: the colour of a relationship, which groups five questions rather than
 * naming twenty-six verbs, and the mark on a card that carries a note.
 *
 * On the canvas rather than in the help, because it is read WHILE looking at
 * the graph - glance at a line, glance at the key, glance back. A modal two
 * clicks away is where you learn something once, not where you check it.
 *
 * It sits beside the minimap, on the same baseline and the same height, so
 * the bottom of the canvas reads as one strip of instruments rather than as
 * two things that happen to be near each other. Two columns for that height:
 * six families in a single list would stand half again as tall as the map.
 *
 * Open by default and shut for good once shut. Nobody learns a colour code
 * from a panel they have to go and find, and nobody wants it there a second
 * week.
 */
function remembered(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'closed'
  } catch {
    // a private window and blocked site data both throw here, and a legend is
    // not worth taking the canvas down for
    return true
  }
}

export default function Legend({ besideMinimap }: { besideMinimap: boolean }) {
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

  // The minimap comes and goes with the viewport width, and the legend takes
  // its place rather than leaving a hole where it was.
  const room = besideMinimap ? ' beside-minimap' : ''

  if (!open) {
    return (
      <Panel position="bottom-right" className={`legend-shut${room}`}>
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
    <Panel position="bottom-right" className={`legend${room}`}>
      <div className="legend-head">
        <span>Legend</span>
        <button className="legend-shut-btn" onClick={toggle} aria-expanded title="Hide the legend">
          <Icon name="cross" size={12} />
        </button>
      </div>
      <div className="legend-cols">
        <div>
          <div className="legend-group">A relationship says</div>
          {REL_FAMILIES.map((f) => (
            <div key={f.id} className="legend-row" title={f.hint}>
              <span className="legend-line" style={{ background: f.color }} />
              <span className="legend-name">{f.label}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="legend-group">A card carries</div>
          <div
            className="legend-row"
            title="A note left on this object, pinned to the canvas or not"
          >
            <span className="legend-mark note" />
            <span className="legend-name">A note</span>
          </div>
          <div
            className="legend-row"
            title="An opinion: the analyst's own judgement on this object"
          >
            <span className="legend-mark opinion" />
            <span className="legend-name">An opinion</span>
          </div>
        </div>
      </div>
    </Panel>
  )
}
