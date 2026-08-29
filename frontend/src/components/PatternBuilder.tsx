import { useMemo, useState } from 'react'
import { refang } from '../ioc'
import { patternFromObservable } from '../pattern'

/**
 * STIX pattern builder (#35): observable type dropdown + value →
 * the pattern is generated and shown before being applied to the field. The
 * pattern field stays editable by hand (expert mode, AND/OR…) -
 * the tool shows the syntax instead of hiding it.
 *
 * The list below covers EVERY observable the application supports, and a test
 * sweeps it against `SCO_TYPES` so it cannot fall behind again. It had: the
 * second batch of observables (accounts, software, certificates, MAC, mutex,
 * directory) reached `patternFromObservable` through the inspector's "Generate
 * an indicator" button and never reached this dropdown. The pattern was
 * therefore perfectly expressible and looked impossible to write, which is a
 * worse failure than a missing feature: an analyst concludes the format
 * cannot say the thing, and models around it.
 */

/** `prop`: the value feeds that property instead of the observable's value. */
const KINDS: { key: string; label: string; type: string; prop?: string; placeholder?: string }[] = [
  { key: 'ipv4-addr', label: 'IPv4', type: 'ipv4-addr', placeholder: '198.51.100.7' },
  { key: 'ipv6-addr', label: 'IPv6', type: 'ipv6-addr', placeholder: '2001:db8::1' },
  { key: 'domain-name', label: 'Domain', type: 'domain-name', placeholder: 'evil.example' },
  { key: 'url', label: 'URL', type: 'url', placeholder: 'https://evil.example/p' },
  { key: 'email-addr', label: 'Email', type: 'email-addr', placeholder: 'rh@evil.example' },
  { key: 'file-hash', label: 'File hash', type: 'file', prop: 'hash' },
  { key: 'file-name', label: 'File name', type: 'file', prop: 'file_name', placeholder: 'payload.exe' },
  { key: 'autonomous-system', label: 'AS', type: 'autonomous-system', placeholder: '64500' },
  { key: 'mac-addr', label: 'MAC', type: 'mac-addr', placeholder: '00:1a:2b:3c:4d:5e' },
  { key: 'mutex', label: 'Mutex', type: 'mutex', placeholder: 'Global\\Zeus' },
  { key: 'directory', label: 'Directory', type: 'directory', placeholder: 'C:\\Windows\\Temp' },
  { key: 'software-name', label: 'Software', type: 'software', placeholder: 'Apache HTTP Server' },
  {
    key: 'software-cpe', label: 'Software (CPE)', type: 'software', prop: 'cpe',
    placeholder: 'cpe:2.3:a:apache:http_server:2.4.49:*:*:*:*:*:*:*',
  },
  { key: 'account-login', label: 'Account login', type: 'user-account', placeholder: 'j.smith' },
  // The account identifier rather than its login. A bank account is the case
  // that makes the difference visible: an IBAN written into `account_login`
  // says the holder logs in with it, which is not a small imprecision when the
  // pattern is what a bank screens against.
  {
    key: 'account-id', label: 'Account ID (IBAN, SID…)', type: 'user-account', prop: 'user_id',
    placeholder: 'FR7630004000031234567890143',
  },
  {
    key: 'x509-certificate', label: 'Certificate', type: 'x509-certificate',
    placeholder: 'fingerprint, or serial number',
  },
]

/** Exported for the coverage sweep in `pattern.test.ts`. */
export const PATTERN_KINDS = KINDS

const ALGOS = ['SHA-256', 'SHA-1', 'MD5']

export default function PatternBuilder({
  onGenerate,
}: {
  onGenerate: (pattern: string) => void
}) {
  const [kind, setKind] = useState('ipv4-addr')
  const [value, setValue] = useState('')
  const [algo, setAlgo] = useState('SHA-256')

  const current = KINDS.find((k) => k.key === kind) ?? KINDS[0]

  const pattern = useMemo(() => {
    const v = refang(value)
    if (!v.trim()) return null
    if (current.prop === 'hash') {
      return patternFromObservable('file', v, { hashes: { [algo]: v.trim() } })
    }
    // The value is passed EMPTY when it belongs in a property: several
    // resolvers read the observable's value first, and `user-account` is the
    // one where that matters - a non-empty value comes back out as a login.
    if (current.prop !== undefined) {
      return patternFromObservable(current.type, '', { [current.prop]: v.trim() })
    }
    return patternFromObservable(current.type, v)
  }, [current, value, algo])

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
          placeholder={current.prop === 'hash' ? 'hash…' : (current.placeholder ?? 'value…')}
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
            Use
          </button>
        </div>
      )}
    </div>
  )
}
