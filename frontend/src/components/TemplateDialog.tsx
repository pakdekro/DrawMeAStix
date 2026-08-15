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
  const [values, setValues] = useState<Record<string, string[]>>({})
  const [hashes, setHashes] = useState<Record<string, string[]>>({})
  const [picked, setPicked] = useState<Record<string, (AttackEntry | undefined)[]>>({})
  const [error, setError] = useState<string | null>(null)
  /** `slot#line` of the line that has just been added, to be typed into straight away */
  const [fresh, setFresh] = useState<string | null>(null)

  const editable = template.slots.filter((s) => !s.fixed)
  const fixed = template.slots.filter((s) => s.fixed)

  /**
   * A slot always holds at least one line, and holds more as soon as the
   * analyst asks for it (#6). One IP address for a C2 was the exception,
   * not the rule.
   */
  const linesOf = (key: string) => values[key] ?? ['']

  /** Same operation on the three parallel maps: the line index is the join. */
  const editLine = <T,>(
    set: React.Dispatch<React.SetStateAction<Record<string, T[]>>>,
    key: string,
    change: (lines: T[]) => T[],
  ) => set((prev) => ({ ...prev, [key]: change(prev[key] ?? []) }))

  const setLine = (key: string, i: number, value: string) =>
    editLine<string>(setValues, key, (lines) => {
      const next = [...lines]
      while (next.length <= i) next.push('')
      next[i] = value
      return next
    })

  const addLine = (key: string) => {
    const at = linesOf(key).length
    editLine<string>(setValues, key, (lines) => [...(lines.length ? lines : ['']), ''])
    setFresh(`${key}#${at}`)
  }

  const dropLine = (key: string, i: number) => {
    const without = <T,>(lines: T[]) => lines.filter((_, j) => j !== i)
    editLine<string>(setValues, key, without)
    editLine<string>(setHashes, key, without)
    editLine<AttackEntry | undefined>(setPicked, key, without)
  }

  // preview recomputed on every keystroke: warn BEFORE generating that some
  // objects will stay isolated, and say which empty slots would link them (#82)
  const plan = buildPlan(template, values, hashes)
  const { isolated, connectors } = planIsolation(template, plan)

  const submit = () => {
    const built = buildPlan(template, values, hashes)
    if (built.entities.length === 0) {
      setError('Fill in at least one field.')
      return
    }
    // picked ATT&CK suggestions: aliases and MITRE references enrich the
    // plan (the template prefill keeps priority). Matched on the name rather
    // than on the line index, which moves when a line is removed.
    built.entities = built.entities.map((e) => {
      const entry = (picked[e.slotKey] ?? []).find((p) => p?.name === e.name)
      if (!entry) return e
      return {
        ...e,
        properties: { ...entryToCreation(entry).properties, ...e.properties },
      }
    })
    onApply(built)
  }

  return (
    <Modal title={`Scenario - ${template.name}`} onClose={onCancel}>
      {template.description && <p className="hint">{template.description}</p>}
      <p className="hint">
        Fill in what you have, the rest is left out.
        {template.labels?.length ? ` Labels applied: ${template.labels.join(', ')}.` : ''}
      </p>
      {editable.map((slot) => {
        const lines = linesOf(slot.key)
        return (
          <div key={slot.key} className="tpl-field">
            <label>
              <span className="dot" style={{ background: typeMeta(slot.type).color }} />
              {slot.label}{' '}
              <span className="tpl-type">({typeMeta(slot.type).label})</span>
              <button
                type="button"
                className="tpl-line-btn tpl-add"
                title={`Add another ${typeMeta(slot.type).label}`}
                aria-label={`Add another ${typeMeta(slot.type).label}`}
                onClick={() => addLine(slot.key)}
              >
                <Icon name="plus" size={12} />
              </button>
            </label>
            {lines.map((value, i) => (
              // index as key: the lines have nothing else to be told apart by,
              // and removing one renumbers those below it in any case
              <div key={i} className="tpl-line">
                <div className="tpl-line-main">
                  <AttackSuggestInput
                    stixType={slot.type}
                    placeholder={i === 0 ? (slot.placeholder ?? '') : ''}
                    value={value}
                    autoFocus={fresh === `${slot.key}#${i}`}
                    onEnter={() => addLine(slot.key)}
                    onChange={(v) => setLine(slot.key, i, v)}
                    onPick={(entry) =>
                      editLine<AttackEntry | undefined>(setPicked, slot.key, (entries) => {
                        const next = [...entries]
                        while (next.length <= i) next.push(undefined)
                        next[i] = entry
                        return next
                      })
                    }
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="tpl-line-btn"
                      title="Remove this line"
                      aria-label="Remove this line"
                      onClick={() => dropLine(slot.key, i)}
                    >
                      <Icon name="minus" size={12} />
                    </button>
                  )}
                </div>
                {slot.hash && (
                  <input
                    className="tpl-hash"
                    placeholder="SHA-256 (optional)"
                    value={hashes[slot.key]?.[i] ?? ''}
                    onChange={(e) =>
                      editLine<string>(setHashes, slot.key, (hs) => {
                        const next = [...hs]
                        while (next.length <= i) next.push('')
                        next[i] = e.target.value
                        return next
                      })
                    }
                  />
                )}
              </div>
            ))}
          </div>
        )
      })}
      {fixed.length > 0 && (
        <p className="hint">
          Always added:{' '}
          {fixed
            .map((s) => `${s.fixed}${s.prefill?.x_mitre_id ? ` (${s.prefill.x_mitre_id})` : ''}`)
            .join(', ')}
        </p>
      )}
      {/*
        Always rendered, in both states. A block that appears and disappears
        changes the height of a box that is centred vertically, so the fields
        ABOVE it slide out from under the cursor while the analyst is still
        typing into them. Found while running the second batch of observables
        through the interface: half the form was filled into the wrong fields.
      */}
      <p
        className={`hint tpl-isolation${isolated.length > 0 || plan.unpaired.length > 0 ? ' tpl-warn' : ''}`}
      >
        {isolated.length > 0 || plan.unpaired.length > 0 ? (
          <>
            <Icon name="warning" size={13} />{' '}
            {isolated.length > 0 && (
              <>
                Will stay unlinked: {isolated.map((e) => e.name).join(', ')}.
                {connectors.length > 0 &&
                  ` Fill in "${connectors.join('" or "')}" to link ${isolated.length === 1 ? 'it' : 'them'} automatically - otherwise, link by hand on the canvas.`}{' '}
              </>
            )}
            {plan.unpaired.length > 0 &&
              `Not drawn: ${plan.unpaired.map((u) => `${u.from} ${u.rel} ${u.to}`).join(', ')} - several values on both sides, so which goes with which is yours to say on the canvas.`}
          </>
        ) : (
          'Everything you fill in will come out linked.'
        )}
      </p>
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
