import { memo, useMemo, useState } from 'react'
import { buildNarrative, eventSentence } from '../narrative'
import type { NarrEntity, NarrRelation } from '../narrative'
import Icon from './Icon'

/**
 * Graph narrative (#116): a live prose read-back of the investigation.
 * Collapsible panel at the top of the right column. Deterministic recompute on
 * every node/edge change (a loop over the edges, negligible).
 */
function Narrative({
  entities,
  relations,
}: {
  entities: NarrEntity[]
  relations: NarrRelation[]
}) {
  const [open, setOpen] = useState(true)
  const n = useMemo(() => buildNarrative(entities, relations), [entities, relations])
  const nothing =
    !n.empty && n.chronology.length === 0 && n.story.length === 0 && n.detection.length === 0
  // Headings appear with the chronology and not before: a graph with no date
  // has one list, and naming it "undated" would answer a question nobody asked.
  const named = n.chronology.length > 0

  return (
    <div className={`narrative ${open ? 'open' : ''}`}>
      <button className="narrative-header" onClick={() => setOpen((o) => !o)}>
        <Icon name="story" size={15} />
        Narrative
        <span className="spacer" />
        <Icon name={open ? 'chevron-down' : 'chevron-up'} size={14} />
      </button>
      {open && (
        <div className="narrative-body">
          {n.empty && (
            <p className="hint">
              Add entities and link them: the story builds itself here, live.
            </p>
          )}
          {nothing && (
            <p className="hint">No relationship yet: link some entities.</p>
          )}
          {named && (
            <>
              <h4>Chronology</h4>
              <ol className="narr-chrono">
                {n.chronology.map((e, i) => (
                  <li key={`c${i}`}>
                    <span className="narr-day">{e.day}</span>
                    <span>{eventSentence(e)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {named && n.story.length > 0 && <h4>Undated</h4>}
          {/* The subject is written once. On a hub, one paragraph per verb
              meant ten of them opening with the same six words. */}
          {n.story.map((block, i) =>
            block.clauses.length === 1 ? (
              <p key={`s${i}`}>{`${block.subject} ${block.clauses[0]}.`}</p>
            ) : (
              <div key={`s${i}`} className="narr-block">
                <p className="narr-subject">{block.subject}</p>
                <ul>
                  {block.clauses.map((clause) => (
                    <li key={clause}>{clause}</li>
                  ))}
                </ul>
              </div>
            ),
          )}
          {n.detection.length > 0 && (
            <>
              <h4>Detection</h4>
              {n.detection.map((s, i) => (
                <p key={`d${i}`}>{s}</p>
              ))}
            </>
          )}
          {n.isolated.length > 0 && (
            <p className="narrative-isolated">
              Unlinked: {n.isolated.join(', ')}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default memo(Narrative)
