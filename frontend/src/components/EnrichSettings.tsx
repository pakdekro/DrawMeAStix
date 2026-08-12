import { useState } from 'react'
import { fetchCatalog, newEndpointId, saveEndpoints } from '../enrich'
import type { EnrichEndpoint } from '../enrich'
import Modal from './Modal'

/**
 * Enrichment endpoint settings (#67). Empty = guaranteed offline mode.
 * Endpoints are local, and never sent anywhere other than to themselves.
 *
 * The token is handled apart (#227): it only stays on disk if asked for. By
 * default it lasts for the session, and has to be typed again once the tab
 * has been closed - hence the field reappearing on a row whose token expired,
 * rather than an unexplained 401 on the first enrichment.
 */
export default function EnrichSettings({
  endpoints,
  onChange,
  onClose,
}: {
  endpoints: EnrichEndpoint[]
  onChange: (endpoints: EnrichEndpoint[]) => void
  onClose: () => void
}) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [remember, setRemember] = useState(false)
  const [tests, setTests] = useState<Record<string, string>>({})
  /** token entries in progress, per endpoint, until they are confirmed */
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const commit = (next: EnrichEndpoint[]) => {
    saveEndpoints(next)
    onChange(next)
  }

  const patch = (id: string, change: Partial<EnrichEndpoint>) =>
    commit(endpoints.map((e) => (e.id === id ? { ...e, ...change } : e)))

  const add = () => {
    if (!url.trim()) return
    commit([
      ...endpoints,
      {
        id: newEndpointId(),
        label: label.trim() || url.trim(),
        url: url.trim(),
        token: token.trim(),
        remember,
      },
    ])
    setLabel('')
    setUrl('')
    setToken('')
    setRemember(false)
  }

  const remove = (id: string) => commit(endpoints.filter((e) => e.id !== id))

  const applyDraft = (id: string) => {
    const value = (drafts[id] ?? '').trim()
    if (!value) return
    setDrafts((d) => ({ ...d, [id]: '' }))
    patch(id, { token: value })
  }

  const test = async (ep: EnrichEndpoint) => {
    setTests((t) => ({ ...t, [ep.id]: '…' }))
    try {
      const cat = await fetchCatalog(ep)
      setTests((t) => ({ ...t, [ep.id]: `✓ ${cat.length} enricher(s): ${cat.map((c) => c.id).join(', ')}` }))
    } catch (e) {
      setTests((t) => ({ ...t, [ep.id]: `✕ ${(e as Error).message}` }))
    }
  }

  return (
    <Modal title="Enrichment endpoints" onClose={onClose} wide>
      <p className="hint">
        Each endpoint is a sidecar (URL + token). No endpoint = guaranteed
        offline mode, no network call possible. In production, the endpoint
        must be on HTTPS behind a real hostname.
      </p>

      {endpoints.length === 0 && <p className="empty">No endpoint configured.</p>}
      {endpoints.map((ep) => (
        <div key={ep.id} className="endpoint-row">
          <div className="endpoint-main">
            <strong>{ep.label}</strong>
            <span className="endpoint-url">{ep.url}</span>
            {tests[ep.id] && <span className="endpoint-test">{tests[ep.id]}</span>}
            <label className="checkbox-row">
              <input
                type="checkbox"
                className="checkbox"
                checked={ep.remember}
                onChange={(e) => patch(ep.id, { remember: e.target.checked })}
              />
              Keep the token on this machine
            </label>
            {ep.token ? (
              !ep.remember && (
                <span className="hint">Token held for this session only.</span>
              )
            ) : (
              <input
                type="password"
                placeholder="Token for this session"
                value={drafts[ep.id] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [ep.id]: e.target.value }))}
                onBlur={() => applyDraft(ep.id)}
                onKeyDown={(e) => e.key === 'Enter' && applyDraft(ep.id)}
              />
            )}
          </div>
          <button onClick={() => test(ep)} disabled={!ep.token}>
            Test
          </button>
          <button className="triage-no" onClick={() => remove(ep.id)}>
            Delete
          </button>
        </div>
      ))}

      <h3>Add</h3>
      <div className="endpoint-form">
        <input placeholder="Name (e.g. CERT sidecar)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input placeholder="https://enrich.example.org" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input
          type="password"
          placeholder="Bearer token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <label className="checkbox-row">
          <input
            type="checkbox"
            className="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Keep the token on this machine, so it survives closing the tab
        </label>
        <button className="primary" onClick={add} disabled={!url.trim()}>
          Add
        </button>
      </div>

      <div className="actions">
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
