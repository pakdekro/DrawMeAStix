import { useMemo, useState } from 'react'
import { refang } from '../ioc'
import { patternFromObservable } from '../pattern'

/**
 * STIX pattern builder (#35): observable type dropdown + value →
 * the pattern is generated and shown before being applied to the field. The
 * pattern field stays editable by hand (expert mode, AND/OR…) -
 * the tool shows the syntax instead of hiding it.
 */

const KINDS: { key: string; label: string }[] = [
  { key: 'ipv4-addr', label: 'IPv4' },
  { key: 'ipv6-addr', label: 'IPv6' },
  { key: 'domain-name', label: 'Domain' },
  { key: 'url', label: 'URL' },
  { key: 'email-addr', label: 'Email' },
  { key: 'file-hash', label: 'File hash' },
  { key: 'file-name', label: 'File name' },
  { key: 'autonomous-system', label: 'AS' },
]

const ALGOS = ['SHA-256', 'SHA-1', 'MD5']

export default function PatternBuilder({
  onGenerate,
}: {
  onGenerate: (pattern: string) => void
}) {
  const [kind, setKind] = useState('ipv4-addr')
  const [value, setValue] = useState('')
  const [algo, setAlgo] = useState('SHA-256')

  const pattern = useMemo(() => {
    const v = refang(value)
    if (!v.trim()) return null
    if (kind === 'file-hash') {
      return patternFromObservable('file', v, { hashes: { [algo]: v.trim() } })
    }
    if (kind === 'file-name') {
      return patternFromObservable('file', v, { file_name: v.trim() })
    }
    return patternFromObservable(kind, v)
  }, [kind, value, algo])

  return (
    <div className="pattern-builder">
      <label>Pattern builder</label>
      <div className="pattern-builder-row">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
        {kind === 'file-hash' && (
          <select value={algo} onChange={(e) => setAlgo(e.target.value)}>
            {ALGOS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
        <input
          placeholder={kind === 'file-hash' ? 'hash…' : 'value…'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      {pattern && (
        <div className="pattern-preview">
          <code>{pattern}</code>
          <button
            type="button"
            className="primary"
            onClick={() => {
              onGenerate(pattern)
              setValue('')
            }}
          >
            Utiliser
          </button>
        </div>
      )}
    </div>
  )
}
