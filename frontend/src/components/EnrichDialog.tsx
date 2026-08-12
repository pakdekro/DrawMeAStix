import { useEffect, useState } from 'react'
import { fetchCatalog } from '../enrich'
import type { EnrichEndpoint, EnricherInfo } from '../enrich'
import { typeMeta } from '../stixMeta'
import type { Entity } from '../types'
import Modal from './Modal'

interface Option {
  endpoint: EnrichEndpoint
  enricher: EnricherInfo
}

/**
 * Runs an enrichment on a node (#67): queries the endpoint catalogs, offers
 * only the enrichers that accept the node's type, runs one, and sends the
 * results to the triage tray.
 */
export default function EnrichDialog({
  entity,
  endpoints,
  onRun,
  onClose,
}: {
  entity: Entity
  endpoints: EnrichEndpoint[]
  onRun: (
    endpoint: EnrichEndpoint,
    enricherId: string,
  ) => Promise<{ candidates: number; notes: number; linked: number }>
  onClose: () => void
}) {
  const [options, setOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all(
      endpoints.map(async (endpoint) => {
        try {
          const cat = await fetchCatalog(endpoint)
          return cat
            .filter((e) => e.accepts.includes(entity.stix_type))
            .map((enricher) => ({ endpoint, enricher }))
        } catch {
          return []
        }
      }),
    ).then((lists) => {
      if (cancelled) return
      setOptions(lists.flat())
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [endpoints, entity.stix_type])

  const run = async (opt: Option) => {
    setBusy(`${opt.endpoint.id}:${opt.enricher.id}`)
    setRunning(opt.enricher.label)
    setMessage(null)
    try {
      const { candidates, notes, linked } = await onRun(opt.endpoint, opt.enricher.id)
      const parts: string[] = []
      if (candidates > 0) parts.push(`${candidates} candidate(s) to the triage tray`)
      if (notes > 0) parts.push(`${notes} note(s) on the entity`)
      // a fully deduplicated enrichment did produce relationships after all:
      // showing it as "no results" would be a lie (#168)
      if (linked > 0) parts.push(`${linked} already known object(s), linked to the existing ones`)
      setMessage(parts.length > 0 ? `Added: ${parts.join(', ')}.` : 'No results.')
    } catch (e) {
      setMessage(`Failed: ${(e as Error).message}`)
    } finally {
      setBusy(null)
      setRunning(null)
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={
        <>
        Enrich -{' '}
        <span style={{ color: typeMeta(entity.stix_type).color }}>{entity.name}</span>
      </>
      }
    >
      <p className="hint">
      Passive discovery only. Results land in the triage tray, never straight
      on the canvas.
      </p>

      {loading && <p className="hint">Querying endpoints…</p>}
      {!loading && options.length === 0 && (
      <p className="empty">
        No enricher applies to "{typeMeta(entity.stix_type).label}", or the endpoint
        is unreachable (check the URL, the token, HTTPS).
      </p>
      )}
      {options.map((opt) => (
        <button
          key={`${opt.endpoint.id}:${opt.enricher.id}`}
          className="palette-btn enrich-option"
          disabled={busy !== null}
          onClick={() => run(opt)}
        >
          <span className="enrich-label">
            {opt.enricher.label}
            <span className="enrich-desc">{opt.enricher.description}</span>
          </span>
          <span className="enrich-endpoint">{opt.endpoint.label}</span>
        </button>
      ))}

      {/* some public sources (crt.sh) answer in tens of seconds, retries
          included: without this feedback, the wait looks like a crash
          (#124) */}
      {running && (
      <p className="hint enrich-running">
        {running} running… some public sources are slow, allow up to a minute.
      </p>
      )}
      {message && <p className="hint">{message}</p>}
      <div className="actions">
      <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
