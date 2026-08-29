import { useEffect, useMemo, useState } from 'react'
import { loadAttackDataset, searchAttack } from '../attack'
import type { AttackDataset, AttackEntry } from '../attack'
import { loadF3Dataset, techniquesOfTactic } from '../f3'
import type { F3Dataset } from '../f3'
import { typeMeta } from '../stixMeta'

/**
 * Framework palette (#10): searches the bundled datasets and adds to the
 * canvas in one click, with aliases and MITRE references pre-filled.
 *
 * Two corpora behind one switch rather than one merged list. ATT&CK and F3
 * share 43 identifiers, so a single list would show the same technique twice
 * and make the lookup of a shared id depend on the order of the map. The
 * switch also keeps the promise the panel makes on screen: what it says is
 * what it searches.
 *
 * The two are not browsed the same way, and that is deliberate. ATT&CK is
 * searched, because an analyst knows what they are looking for. F3 is browsed
 * by tactic first, because an unknown framework cannot be searched: you have
 * to be able to read the matrix before you can name anything in it.
 */
export default function AttackPalette({ onPick }: { onPick: (entry: AttackEntry) => void }) {
  const [framework, setFramework] = useState<'attack' | 'f3'>('attack')
  const [query, setQuery] = useState('')
  const [tactic, setTactic] = useState<string | null>(null)
  const [dataset, setDataset] = useState<AttackDataset | null>(null)
  const [f3, setF3] = useState<F3Dataset | null>(null)
  const [failed, setFailed] = useState(false)

  const searching = query.trim().length >= 2

  useEffect(() => {
    if (framework !== 'attack' || !searching || dataset || failed) return
    loadAttackDataset()
      .then(setDataset)
      .catch(() => setFailed(true))
  }, [framework, searching, dataset, failed])

  // F3 loads on entering the tab, not on typing: its tactics ARE the way in,
  // and they have to be on screen before anything can be searched.
  useEffect(() => {
    if (framework !== 'f3' || f3 || failed) return
    loadF3Dataset()
      .then(setF3)
      .catch(() => setFailed(true))
  }, [framework, f3, failed])

  const results = useMemo(() => {
    if (framework === 'attack') {
      return dataset && searching ? searchAttack(dataset.entries, query) : []
    }
    if (!f3) return []
    if (searching) return searchAttack(f3.entries, query, 40)
    return tactic ? techniquesOfTactic(f3.entries, tactic) : []
  }, [framework, dataset, f3, query, searching, tactic])

  const version = framework === 'attack' ? dataset?.attack_version : f3?.f3_version
  const loaded = framework === 'attack' ? dataset !== null : f3 !== null

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
              setTactic(null)
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
      {failed && <p className="hint">Dataset unavailable.</p>}

      {/* The fraud lifecycle in its own order, not alphabetical: the matrix
          reads left to right, from reconnaissance to cashing out. */}
      {framework === 'f3' && f3 && !searching && (
        <div className="chip-grid f3-tactics">
          {f3.tactics.map((t) => (
            <button
              key={t.id}
              className={`chip${tactic === t.shortname ? ' on' : ''}`}
              aria-pressed={tactic === t.shortname}
              title={
                t.framework === 'mitre-attack'
                  ? `${t.name} (${t.id}), a tactic F3 shares with ATT&CK`
                  : `${t.name} (${t.id}), specific to fraud`
              }
              onClick={() => setTactic(tactic === t.shortname ? null : t.shortname)}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {searching && loaded && results.length === 0 && <p className="hint">No results.</p>}
      <div className="attack-results">
        {results.map((entry) => {
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
