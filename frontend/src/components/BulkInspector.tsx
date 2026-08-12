import { useMemo, useState } from 'react'
import {
  commonLabels,
  commonValue,
  isEmptyPatch,
  parseLabels,
  type BulkPatch,
} from '../bulk'
import { TLP_META, typeMeta } from '../stixMeta'
import type { Entity } from '../types'
import Icon from './Icon'

/**
 * Bulk edit (#185): apply TLP, confidence and labels to a selection.
 *
 * The inspector only ever handled one entity: setting TLP:AMBER on twelve
 * objects meant doing it twelve times, while React Flow already knows how to
 * select with a rubber band.
 *
 * The name is NOT editable here: it is what drives the deterministic OpenCTI
 * identifier, and renaming in bulk would merge distinct objects on export.
 *
 * The merge rules (mixed, adding/removing labels) live in bulk.ts and are
 * tested there; this component is only the input.
 */

const TLP_CHOICES = ['clear', 'green', 'amber', 'red'] as const

export default function BulkInspector({
  entities,
  onApply,
}: {
  entities: Entity[]
  onApply: (patch: BulkPatch) => void
}) {
  // `undefined` = the objects disagree: the field shows "mixed" and writes
  // nothing as long as it is left untouched
  const shared = useMemo(() => {
    const props = entities.map((e) => e.properties ?? {})
    return {
      tlp: commonValue(props.map((p) => (p.tlp === undefined ? '' : String(p.tlp)))),
      confidence: commonValue(
        props.map((p) => (typeof p.confidence === 'number' ? p.confidence : null)),
      ),
      labels: commonLabels(
        props.map((p) => (Array.isArray(p.labels) ? (p.labels as string[]) : [])),
      ),
    }
  }, [entities])

  const [tlp, setTlp] = useState<string | null>(null)
  const [confidence, setConfidence] = useState<string | null>(null)
  const [addLabels, setAddLabels] = useState('')
  const [removed, setRemoved] = useState<string[]>([])

  const types = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of entities) counts.set(e.stix_type, (counts.get(e.stix_type) ?? 0) + 1)
    return [...counts.entries()]
  }, [entities])

  const patch: BulkPatch = {
    ...(tlp === null ? {} : { tlp: tlp === '' ? null : tlp }),
    ...(confidence === null
      ? {}
      : { confidence: confidence === '' ? null : Number(confidence) }),
    ...(parseLabels(addLabels).length > 0 ? { addLabels: parseLabels(addLabels) } : {}),
    ...(removed.length > 0 ? { removeLabels: removed } : {}),
  }

  const invalidConfidence =
    confidence !== null &&
    confidence !== '' &&
    (Number.isNaN(Number(confidence)) || Number(confidence) < 0 || Number(confidence) > 100)

  const apply = () => {
    if (isEmptyPatch(patch) || invalidConfidence) return
    onApply(patch)
    setTlp(null)
    setConfidence(null)
    setAddLabels('')
    setRemoved([])
  }

  return (
    <div className="inspector bulk">
      <h3>
        {entities.length} objects selected
        <span className="bulk-types">
          {types.map(([t, n]) => (
            <span key={t} className="bulk-type">
              <span className="dot" style={{ background: typeMeta(t).color }} />
              {typeMeta(t).label}
              {n > 1 ? ` ×${n}` : ''}
            </span>
          ))}
        </span>
      </h3>

      <p className="hint">
        Only the fields you touch are written. The name is never editable in bulk: it drives
        the deterministic STIX identifier.
      </p>

      <label>TLP</label>
      <select
        value={tlp ?? (shared.tlp === undefined ? '__mixed__' : shared.tlp)}
        onChange={(e) => setTlp(e.target.value)}
      >
        {shared.tlp === undefined && (
          <option value="__mixed__" disabled>
            mixed - leave untouched
          </option>
        )}
        <option value="">no marking</option>
        {TLP_CHOICES.map((c) => (
          <option key={c} value={c}>
            {TLP_META[c].label}
          </option>
        ))}
      </select>

      <label>Confidence (0-100)</label>
      <input
        type="number"
        min={0}
        max={100}
        value={
          confidence ??
          (shared.confidence === undefined
            ? ''
            : shared.confidence === null
              ? ''
              : String(shared.confidence))
        }
        placeholder={shared.confidence === undefined ? 'mixed - leave untouched' : 'empty = none'}
        onChange={(e) => setConfidence(e.target.value)}
      />
      {invalidConfidence && <p className="field-warn">Confidence must be between 0 and 100.</p>}

      <label>Add labels (comma separated)</label>
      <input
        value={addLabels}
        placeholder="ransomware, campaign-2026…"
        onChange={(e) => setAddLabels(e.target.value)}
      />

      {shared.labels.length > 0 && (
        <>
          <label>Labels on every selected object</label>
          <div className="bulk-labels">
            {shared.labels.map((l) => (
              <button
                key={l}
                className={`bulk-label${removed.includes(l) ? ' dropped' : ''}`}
                title={removed.includes(l) ? 'Will be removed - click to keep' : 'Remove from all'}
                onClick={() =>
                  setRemoved((r) => (r.includes(l) ? r.filter((x) => x !== l) : [...r, l]))
                }
              >
                {l}
                <Icon name="cross" size={11} />
              </button>
            ))}
          </div>
        </>
      )}

      <button
        className="primary bulk-apply"
        disabled={isEmptyPatch(patch) || invalidConfidence}
        onClick={apply}
      >
        Apply to {entities.length} objects
      </button>
    </div>
  )
}
