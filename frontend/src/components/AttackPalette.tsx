import { useEffect, useMemo, useState } from 'react'
import { loadAttackDataset, searchAttack } from '../attack'
import type { AttackDataset, AttackEntry } from '../attack'
import { typeMeta } from '../stixMeta'

/**
 * ATT&CK palette (#10): searches the bundled dataset (techniques, groups,
 * malware, tools) and adds to the canvas in one click, with aliases and
 * MITRE references pre-filled. The dataset is only loaded once the search
 * box holds two characters.
 */
export default function AttackPalette({ onPick }: { onPick: (entry: AttackEntry) => void }) {
  const [query, setQuery] = useState('')
  const [dataset, setDataset] = useState<AttackDataset | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2 || dataset || failed) return
    loadAttackDataset()
      .then(setDataset)
      .catch(() => setFailed(true))
  }, [query, dataset, failed])

  const results = useMemo(
    () => (dataset ? searchAttack(dataset.entries, query) : []),
    [dataset, query],
  )

  return (
    <div className="attack-palette">
      <h3>
        ATT&amp;CK
        {dataset && <span className="attack-version"> v{dataset.attack_version}</span>}
      </h3>
      <input
        className="attack-search"
        placeholder="APT28, T1566, Mimikatz…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {failed && <p className="hint">ATT&amp;CK dataset unavailable.</p>}
      {query.trim().length >= 2 && dataset && results.length === 0 && (
        <p className="hint">No results.</p>
      )}
      <div className="attack-results">
        {results.map((entry) => (
          <button
            key={entry.id}
            className="palette-btn attack-result"
            title={entry.aliases?.length ? `Alias : ${entry.aliases.join(', ')}` : undefined}
            onClick={() => {
              onPick(entry)
              setQuery('')
            }}
          >
            <span className="dot" style={{ background: typeMeta(entry.type).color }} />
            <span className="attack-name">{entry.name}</span>
            <span className="attack-id">{entry.id}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
