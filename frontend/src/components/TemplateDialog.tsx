import { useState } from 'react'
import { entryToCreation } from '../attack'
import type { AttackEntry } from '../attack'
import { buildPlan, planIsolation } from '../templates'
import type { ScenarioTemplate, TemplatePlan } from '../templates'
import { typeMeta } from '../stixMeta'
import AttackSuggestInput from './AttackSuggest'
import Icon from './Icon'
import Modal from './Modal'

/**
 * Scenario "easy mode" form (#28): one field per slot, the empty ones
 * are left out, the `fixed` slots (typical ATT&CK techniques) are shown
 * for information and always created.
 */
export default function TemplateDialog({
  template,
  onApply,
  onCancel,
}: {
  template: ScenarioTemplate
  onApply: (plan: TemplatePlan) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [hashes, setHashes] = useState<Record<string, string>>({})
  const [picked, setPicked] = useState<Record<string, AttackEntry>>({})
  const [error, setError] = useState<string | null>(null)

  const editable = template.slots.filter((s) => !s.fixed)
  const fixed = template.slots.filter((s) => s.fixed)

  // preview recomputed on every keystroke: warn BEFORE generating that some
  // objects will stay isolated, and say which empty slots would link them (#82)
  const { isolated, connectors } = planIsolation(template, buildPlan(template, values, hashes))

  const submit = () => {
    const plan = buildPlan(template, values, hashes)
    if (plan.entities.length === 0) {
      setError('Fill in at least one field.')
      return
    }
    // picked ATT&CK suggestions: aliases and MITRE references enrich the
    // plan (the template prefill keeps priority)
    plan.entities = plan.entities.map((e) => {
      const entry = picked[e.key]
      if (!entry || entry.name !== e.name) return e
      return {
        ...e,
        properties: { ...entryToCreation(entry).properties, ...e.properties },
      }
    })
    onApply(plan)
  }

  return (
    <Modal title={`Scenario - ${template.name}`} onClose={onCancel}>
      {template.description && <p className="hint">{template.description}</p>}
      <p className="hint">
        Fill in what you have, the rest is left out.
        {template.labels?.length ? ` Labels applied: ${template.labels.join(', ')}.` : ''}
      </p>
      {editable.map((slot) => (
        <div key={slot.key} className="tpl-field">
          <label>
            <span className="dot" style={{ background: typeMeta(slot.type).color }} />
            {slot.label}{' '}
            <span className="tpl-type">({typeMeta(slot.type).label})</span>
          </label>
          <AttackSuggestInput
            stixType={slot.type}
            placeholder={slot.placeholder ?? ''}
            value={values[slot.key] ?? ''}
            onChange={(v) => setValues((prev) => ({ ...prev, [slot.key]: v }))}
            onPick={(entry) => setPicked((p) => ({ ...p, [slot.key]: entry }))}
          />
          {slot.hash && (
            <input
              className="tpl-hash"
              placeholder="SHA-256 (optional)"
              value={hashes[slot.key] ?? ''}
              onChange={(e) => setHashes((h) => ({ ...h, [slot.key]: e.target.value }))}
            />
          )}
        </div>
      ))}
      {fixed.length > 0 && (
        <p className="hint">
          Always added:{' '}
          {fixed
            .map((s) => `${s.fixed}${s.prefill?.x_mitre_id ? ` (${s.prefill.x_mitre_id})` : ''}`)
            .join(', ')}
        </p>
      )}
      {isolated.length > 0 && (
        <p className="hint tpl-warn">
          <Icon name="warning" size={13} /> {isolated.length === 1 ? 'Will stay unlinked' : 'Will stay unlinked'}:{' '}
          {isolated.map((e) => e.name).join(', ')}.
          {connectors.length > 0 &&
            ` Fill in "${connectors.join('" or "')}" to link ${isolated.length === 1 ? 'it' : 'them'} automatically - otherwise, link by hand on the canvas.`}
        </p>
      )}
      {error && <p className="error-banner">{error}</p>}
      <div className="actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={submit}>
          Generate the subgraph
        </button>
      </div>
    </Modal>
  )
}
