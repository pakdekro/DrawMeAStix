import { useEffect, useMemo, useState } from 'react'
import { loadAttackDataset, searchAttack } from '../attack'
import type { AttackDataset, AttackEntry } from '../attack'
import { loadF3Dataset } from '../f3'
import type { F3Dataset } from '../f3'
import { typeMeta } from '../stixMeta'
import Icon from './Icon'

/**
 * Framework palette (#10): searches the bundled datasets and adds to the
 * canvas in one click, with aliases and MITRE references pre-filled. The
 * dataset of the selected framework is only loaded once the search box holds
 * two characters.
 *
 * Two corpora behind one switch rather than one merged list. ATT&CK and F3
 * share 43 identifiers, so a single list would show the same technique twice
 * and make the lookup of a shared id depend on the order of the map. The
 * switch also keeps the promise the panel makes on screen: what it says is
 * what it searches.
 *
 * Both are searched the same way, deliberately. F3 is small enough to browse
 * by tactic and it was, for a while, on the grounds that a framework you do
 * not know yet cannot be searched. That reasoning holds and the interface
 * still lost: one panel, one switch, and two different things happening
 * depending on the side. Teaching a framework is a job for a page that has
 * room to do it, not for 180 pixels of palette.
 */
export default function AttackPalette({ onPick }: { onPick: (entry: AttackEntry) => void }) {
  const [framework, setFramework] = useState<'attack' | 'f3'>('attack')
  const [query, setQuery] = useState('')
  const [dataset, setDataset] = useState<AttackDataset | null>(null)
  const [f3, setF3] = useState<F3Dataset | null>(null)
  const [failed, setFailed] = useState(false)

  const searching = query.trim().length >= 2
  const loaded = framework === 'attack' ? dataset : f3

  useEffect(() => {
    if (!searching || loaded || failed) return
    const load = framework === 'attack' ? loadAttackDataset : loadF3Dataset
    load()
      .then((d) => (framework === 'attack' ? setDataset(d as AttackDataset) : setF3(d as F3Dataset)))
      .catch(() => setFailed(true))
  }, [framework, searching, loaded, failed])

  const results = useMemo(
    () => (loaded && searching ? searchAttack(loaded.entries, query) : []),
    [loaded, searching, query],
  )

  const version = framework === 'attack' ? dataset?.attack_version : f3?.f3_version

  return (
    <div className="attack-palette">
      <h3>
        {framework === 'attack' ? 'ATT&CK' : 'F3'}
        {version && <span className="attack-version"> v{version}</span>}
      </h3>
      <div className="chip-grid fw-switch">
        {(
          [
            { id: 'attack', label: 'ATT&CK', title: 'MITRE ATT&CK Enterprise' },
            { id: 'f3', label: 'F3', title: 'MITRE F3, Fight Financial Fraud' },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            className={`chip${framework === f.id ? ' on' : ''}`}
            aria-pressed={framework === f.id}
            title={f.title}
            onClick={() => {
              setFramework(f.id)
              setQuery('')
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <input
        className="attack-search"
        placeholder={framework === 'attack' ? 'APT28, T1566, Mimikatz…' : 'F1001, mule, 3DS…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {/* Both guides, under the search box and named. An icon beside the
          title had to be found and then guessed at, and the panel has the room
          to say what it opens. Both are offered whichever framework is
          selected: the question "what is the other one" is exactly the one
          somebody in front of this switch is asking. A new tab, because the
          reader has a canvas open and answering it is not a reason to take it
          away from them. */}
      <p className="attack-docs">
        <a href="#/attack" target="_blank" rel="noreferrer">
          <Icon name="help" size={12} />
          What ATT&CK is
        </a>
        <a href="#/f3" target="_blank" rel="noreferrer">
          <Icon name="help" size={12} />
          What F3 is
        </a>
      </p>
      {failed && <p className="hint">Dataset unavailable.</p>}
      {searching && loaded && results.length === 0 && <p className="hint">No results.</p>}
      <div className="attack-results">
        {results.map((entry) => {
          // An F3 result that carries an ATT&CK number IS an ATT&CK technique:
          // the two frameworks meet on it rather than forking it, and the
          // palette says so before the analyst finds one card where they
          // expected two.
          const shared = framework === 'f3' && entry.framework !== 'mitre-f3'
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
              <span className={`attack-id${shared ? ' shared' : ''}`}>{entry.id}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
