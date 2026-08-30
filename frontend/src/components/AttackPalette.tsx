import { useEffect, useMemo, useState } from 'react'
import { searchAttack } from '../attack'
import type { AttackEntry } from '../attack'
import { loadFramework } from '../datasets'
import type { FrameworkCorpus } from '../datasets'
import { DEFAULT_FRAMEWORK, FRAMEWORKS } from '../frameworks'
import { typeMeta } from '../stixMeta'
import Icon from './Icon'

/**
 * Framework palette (#10): searches the bundled datasets and adds to the
 * canvas in one click, with aliases and MITRE references pre-filled. The
 * dataset of the selected framework is only loaded once the search box holds
 * two characters.
 *
 * One corpus per framework behind one switch, rather than one merged list.
 * ATT&CK and F3 share 43 identifiers, so a single list would show the same
 * technique twice and make the lookup of a shared id depend on the order of
 * the map. ATLAS shares none, and would still have brought 178 techniques
 * about AI systems into the results of an analyst working an intrusion. The
 * switch also keeps the promise the panel makes on screen: what it says is
 * what it searches.
 *
 * Everything here reads the framework registry, so a fourth one is an entry
 * in `frameworks.ts` and a loader in `datasets.ts`, and nothing in this file.
 *
 * Both are searched the same way, deliberately. F3 is small enough to browse
 * by tactic and it was, for a while, on the grounds that a framework you do
 * not know yet cannot be searched. That reasoning holds and the interface
 * still lost: one panel, one switch, and two different things happening
 * depending on the side. Teaching a framework is a job for a page that has
 * room to do it, not for 180 pixels of palette.
 */
export default function AttackPalette({ onPick }: { onPick: (entry: AttackEntry) => void }) {
  const [framework, setFramework] = useState(DEFAULT_FRAMEWORK)
  const [query, setQuery] = useState('')
  // One corpus per framework, kept once fetched: switching back and forth is
  // free, and nothing is fetched for a framework nobody searched.
  const [corpora, setCorpora] = useState<Record<string, FrameworkCorpus>>({})
  const [failed, setFailed] = useState<Record<string, true>>({})

  const searching = query.trim().length >= 2
  const loaded = corpora[framework.id]

  useEffect(() => {
    if (!searching || loaded || failed[framework.id]) return
    let cancelled = false
    loadFramework(framework.id)
      .then((corpus) => !cancelled && setCorpora((c) => ({ ...c, [framework.id]: corpus })))
      .catch(() => !cancelled && setFailed((f) => ({ ...f, [framework.id]: true })))
    return () => {
      cancelled = true
    }
  }, [framework, searching, loaded, failed])

  const results = useMemo(
    () => (loaded && searching ? searchAttack(loaded.entries, query) : []),
    [loaded, searching, query],
  )

  return (
    <div className="attack-palette">
      <h3>
        {framework.short}
        {loaded && <span className="attack-version"> v{loaded.version}</span>}
      </h3>
      <div className="chip-grid fw-switch">
        {FRAMEWORKS.map((f) => (
          <button
            key={f.id}
            className={`chip${framework.id === f.id ? ' on' : ''}`}
            aria-pressed={framework.id === f.id}
            title={`MITRE ${f.label}`}
            onClick={() => {
              setFramework(f)
              setQuery('')
            }}
          >
            {f.short}
          </button>
        ))}
      </div>
      <input
        className="attack-search"
        placeholder={framework.placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {/* The guides, under the search box and named. An icon beside the title
          had to be found and then guessed at, and the panel has the room to
          say what it opens. All of them are offered whichever framework is
          selected: the question "what is the other one" is exactly the one
          somebody in front of this switch is asking. A new tab, because the
          reader has a canvas open and answering it is not a reason to take it
          away from them. */}
      <p className="attack-docs">
        {FRAMEWORKS.map((f) => (
          <a key={f.id} href={`#/${f.route}`} target="_blank" rel="noreferrer">
            <Icon name="help" size={12} />
            What {f.short} is
          </a>
        ))}
      </p>
      {failed[framework.id] && <p className="hint">Dataset unavailable.</p>}
      {searching && loaded && results.length === 0 && <p className="hint">No results.</p>}
      <div className="attack-results">
        {results.map((entry) => {
          // An F3 result that carries an ATT&CK number IS an ATT&CK technique:
          // the two frameworks meet on it rather than forking it, and the
          // palette says so before the analyst finds one card where they
          // expected two. ATLAS never does this: it borrows no identifier.
          const shared = entry.framework !== undefined && entry.framework !== framework.id
          return (
            <button
              key={entry.id ?? entry.name}
              className="palette-btn attack-result"
              title={
                shared
                  ? `${entry.name} (${entry.id}), shared with ATT&CK`
                  : entry.aliases?.length
                    ? `Alias : ${entry.aliases.join(', ')}`
                    : entry.name
              }
              onClick={() => {
                onPick(entry)
                setQuery('')
              }}
            >
              <span className="dot" style={{ background: typeMeta(entry.type).color }} />
              <span className="attack-name">{entry.name}</span>
              {/* Mobile and ICS are ATT&CK, and they are not the matrix most
                  people are in: the mark costs four characters and saves the
                  analyst from placing a technique about a PLC on an office
                  intrusion without noticing. */}
              {entry.domain && <span className="attack-domain">{entry.domain}</span>}
              <span className={`attack-id${shared ? ' shared' : ''}`}>{entry.id}</span>
            </button>
          )
        })}
      </div>
    </div>
  )

}
