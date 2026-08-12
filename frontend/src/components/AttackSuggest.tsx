import { useEffect, useMemo, useRef, useState } from 'react'
import { loadAttackDataset, searchAttack } from '../attack'
import type { AttackDataset, AttackEntry } from '../attack'

/**
 * Entity type → type of ATT&CK dataset entries to suggest.
 * ATT&CK groups are intrusion-sets, but a threat-actor shares
 * the same universe of names/aliases: it benefits from them too.
 */
const SUGGEST_FROM: Record<string, string> = {
  'intrusion-set': 'intrusion-set',
  'threat-actor': 'intrusion-set',
  malware: 'malware',
  tool: 'tool',
  'attack-pattern': 'attack-pattern',
}

/**
 * Name field with ATT&CK autocompletion: for the types covered by the
 * dataset (groups, malware, tools, techniques), the known entries are
 * suggested while typing - name, alias and ID; picking a suggestion
 * prefills aliases and references through `onPick`. For the other types,
 * a plain text field.
 */
export default function AttackSuggestInput({
  stixType,
  value,
  onChange,
  onPick,
  placeholder,
  autoFocus,
  onEnter,
}: {
  stixType: string
  value: string
  onChange: (value: string) => void
  onPick?: (entry: AttackEntry) => void
  placeholder?: string
  autoFocus?: boolean
  onEnter?: () => void
}) {
  const suggestFrom = SUGGEST_FROM[stixType]
  const suggestible = suggestFrom !== undefined
  const [dataset, setDataset] = useState<AttackDataset | null>(null)
  const [focused, setFocused] = useState(false)
  const picked = useRef<string | null>(null)

  useEffect(() => {
    if (suggestible && focused && value.trim().length >= 2 && !dataset) {
      loadAttackDataset()
        .then(setDataset)
        .catch(() => undefined)
    }
  }, [suggestible, focused, value, dataset])

  const results = useMemo(() => {
    if (!suggestible || !dataset || value.trim().length < 2) return []
    if (picked.current === value) return []
    return searchAttack(
      dataset.entries.filter((e) => e.type === suggestFrom),
      value,
      6,
    )
  }, [suggestible, dataset, value, suggestFrom])

  return (
    <div className="suggest-wrap">
      <input
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          picked.current = null
          onChange(e.target.value)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
      {focused && results.length > 0 && (
        <div className="suggest-list">
          {results.map((entry) => (
            <button
              key={entry.id}
              className="suggest-item"
              title={entry.aliases?.length ? `Alias : ${entry.aliases.join(', ')}` : undefined}
              onMouseDown={(e) => {
                e.preventDefault()
                picked.current = entry.name
                onChange(entry.name)
                onPick?.(entry)
              }}
            >
              <span className="suggest-name">{entry.name}</span>
              <span className="attack-id">{entry.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
