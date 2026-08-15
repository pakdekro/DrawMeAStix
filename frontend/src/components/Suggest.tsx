import { useEffect, useMemo, useRef, useState } from 'react'
import { loadActorAliases, loadAttackDataset, searchAttack } from '../attack'
import type { AttackDataset, AttackEntry } from '../attack'
import { loadCountries, searchCountries } from '../countries'
import type { Country, CountryDataset } from '../countries'

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
 * Name field with suggestions, from three sources that never overlap.
 *
 * For the types the ATT&CK dataset covers (groups, malware, tools,
 * techniques), the known entries are offered while typing - name, alias and
 * ID; picking one prefills aliases and references through `onPick`.
 *
 * For the two types that name an adversary, the actor aliases distilled from
 * the MISP galaxy are offered alongside: eight hundred names MITRE never
 * adopted, arbitrated at build time so that none of them contradicts ATT&CK.
 * They carry no MITRE number and say so in the list.
 *
 * For a `location`, the ISO 3166-1 countries are offered instead. Same
 * intent, different reason to care: a location identifier is derived from its
 * name, so an analyst free-typing "FR" one day and "France" the next has made
 * two countries that will never merge again. Picking one fills the country
 * code through `onPickCountry`.
 *
 * For everything else, a plain text field.
 */
export default function SuggestInput({
  stixType,
  value,
  onChange,
  onPick,
  onPickCountry,
  placeholder,
  autoFocus,
  onEnter,
}: {
  stixType: string
  value: string
  onChange: (value: string) => void
  onPick?: (entry: AttackEntry) => void
  onPickCountry?: (country: Country) => void
  placeholder?: string
  autoFocus?: boolean
  onEnter?: () => void
}) {
  const suggestFrom = SUGGEST_FROM[stixType]
  const isLocation = stixType === 'location'
  const suggestible = suggestFrom !== undefined || isLocation
  const [dataset, setDataset] = useState<AttackDataset | null>(null)
  const [actors, setActors] = useState<AttackEntry[]>([])
  const [countries, setCountries] = useState<CountryDataset | null>(null)
  const [focused, setFocused] = useState(false)
  const picked = useRef<string | null>(null)

  useEffect(() => {
    if (!focused || value.trim().length < 2) return
    if (isLocation) {
      if (!countries) loadCountries().then(setCountries).catch(() => undefined)
      return
    }
    if (suggestFrom === undefined) return
    if (!dataset) {
      loadAttackDataset()
        .then(setDataset)
        .catch(() => undefined)
    }
    // The actor aliases ride alongside for the two types that name an
    // adversary. They are a second file, so a failure to load them leaves the
    // ATT&CK suggestions working.
    if (suggestFrom === 'intrusion-set' && actors.length === 0) {
      loadActorAliases()
        .then(setActors)
        .catch(() => undefined)
    }
  }, [suggestFrom, isLocation, focused, value, dataset, actors.length, countries])

  const results = useMemo<(AttackEntry | Country)[]>(() => {
    if (!suggestible || value.trim().length < 2) return []
    if (picked.current === value) return []
    if (isLocation) {
      return countries ? searchCountries(countries.entries, value) : []
    }
    if (!dataset) return []
    return searchAttack(
      [...dataset.entries.filter((e) => e.type === suggestFrom), ...actors],
      value,
      6,
    )
  }, [suggestible, isLocation, countries, dataset, actors, value, suggestFrom])

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
          {results.map((entry) => {
            const isCountry = 'code' in entry
            return (
              <button
                key={isCountry ? entry.code : (entry.id ?? entry.name)}
                className="suggest-item"
                title={
                  !isCountry && entry.aliases?.length
                    ? `Alias : ${entry.aliases.join(', ')}`
                    : undefined
                }
                onMouseDown={(e) => {
                  e.preventDefault()
                  picked.current = entry.name
                  onChange(entry.name)
                  if (isCountry) onPickCountry?.(entry)
                  else onPick?.(entry)
                }}
              >
                <span className="suggest-name">{entry.name}</span>
                {/* the source is named when it is not ATT&CK, so that a
                    suggestion never passes for a MITRE entry it is not */}
                <span className="attack-id">
                  {isCountry ? entry.code : (entry.id ?? 'misp')}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
