import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Icon from './Icon'

/**
 * Tabbed right-hand column.
 *
 * The inspector and the narrative used to split the column's height, each with
 * its own scrolling: on a slightly crowded record, both were cramped and the
 * narrative sat below the fold.
 *
 * Both stay MOUNTED, the inactive one is merely hidden: switching tabs must not
 * lose an entry in progress in a record, nor the narrative's folded state.
 */
export default function RightColumn({
  inspector,
  narrative,
  open,
  onToggle,
  focusInspector = 0,
}: {
  inspector: ReactNode
  narrative: ReactNode
  /** collapsed, the column goes away entirely: 300px handed back to the canvas */
  open: boolean
  onToggle: () => void
  /**
   * Counter bumped by the parent on every selection that reopens the
   * column. A counter and not a boolean: two selections in a row must each
   * bring the tab back, whereas a boolean left at `true` would have fired
   * the effect only once.
   */
  focusInspector?: number
}) {
  const [tab, setTab] = useState<'inspector' | 'narrative'>('inspector')

  /**
   * The active tab used to survive collapsing. Leaving "Narrative" active,
   * collapsing, then clicking a node therefore reopened the column on the
   * narrative: the record you asked for was not shown, and nothing said you
   * had to switch tab.
   */
  useEffect(() => {
    if (focusInspector > 0) setTab('inspector')
  }, [focusInspector])

  /**
   * Collapsed, the column leaves a hand's width of itself behind.
   *
   * Reopening used to live in the top bar, wedged between "Import" and
   * "Share" and drawn as a note: an I/O group is a strange place to keep a
   * panel switch, and no icon reads as "the inspector". Here the door is
   * where the room is - the same edge the chevron collapsed, in the same
   * place the panel occupied - and the top bar goes back to being about
   * getting data in and out.
   */
  if (!open) {
    return (
      <button
        className="right-reopen"
        aria-expanded={false}
        aria-label="Show the inspector"
        title="Show the inspector - it also reopens on its own when you select something"
        onClick={onToggle}
      >
        <Icon name="chevron-down" size={14} style={{ transform: 'rotate(90deg)' }} />
      </button>
    )
  }

  return (
    <div className="right-col">
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'inspector'}
          className={`tab${tab === 'inspector' ? ' on' : ''}`}
          onClick={() => setTab('inspector')}
        >
          Inspector
        </button>
        <button
          role="tab"
          aria-selected={tab === 'narrative'}
          className={`tab${tab === 'narrative' ? ' on' : ''}`}
          onClick={() => setTab('narrative')}
        >
          Narrative
        </button>
        <span className="tabs-gap" />
        <button
          className="tab-collapse"
          title="Collapse the panel - it reopens when you select something"
          aria-label="Collapse the panel"
          onClick={onToggle}
        >
          <Icon name="chevron-down" size={14} style={{ transform: 'rotate(-90deg)' }} />
        </button>
      </div>
      <div className="tab-panel" hidden={tab !== 'inspector'}>
        {inspector}
      </div>
      <div className="tab-panel" hidden={tab !== 'narrative'}>
        {narrative}
      </div>
    </div>
  )
}
