import { useEffect, useRef, useState } from 'react'
import type { AttackEntry } from '../attack'
import type { Country } from '../countries'
import {
  fieldOption,
  fieldsFor,
  requiredFilled,
  toFormValues,
  toProperties,
  valuePlaceholder,
} from '../entityFields'
import { hashWarning, mitreIdWarning, valueWarning } from '../ioc'
import { typeMeta } from '../stixMeta'
import SuggestInput from './Suggest'
import Icon from './Icon'
import PatternBuilder from './PatternBuilder'

// Input validation (#130): per-field warnings, never blocking.
const FIELD_WARNINGS: Record<string, (value: string) => string | null> = {
  hash_md5: (v) => hashWarning('MD5', v),
  hash_sha1: (v) => hashWarning('SHA-1', v),
  hash_sha256: (v) => hashWarning('SHA-256', v),
  x_mitre_id: mitreIdWarning,
}

function FieldWarning({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="field-warn">
      <Icon name="warning" size={12} /> {message}
    </p>
  )
}

interface Props {
  stixType: string
  initialName?: string
  initialProperties?: Record<string, unknown>
  submitLabel: string
  /**
   * Take focus on open. True in the create dialog, where the field is the
   * whole point of the screen. FALSE in the inspector: selecting a node
   * there parked the caret in a text field, and the next keypress (Del, or
   * a triage shortcut) went into it instead of acting on the canvas.
   */
  autoFocus?: boolean
  onSubmit: (name: string, properties: Record<string, unknown>) => void
  onCancel?: () => void
}

/** Guided form for one entity: name + fields specific to the type. */
export default function EntityForm({
  stixType,
  autoFocus = false,
  initialName = '',
  initialProperties = {},
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName] = useState(initialName)
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    toFormValues(initialProperties),
  )
  const meta = typeMeta(stixType)
  const fields = fieldsFor(stixType)

  /**
   * What the form was handed the last time it resynced.
   *
   * This is how we tell whether the analyst has changed anything: without the
   * reference, the component cannot separate "nothing moved" from "everything
   * on screen was just typed", so it either never resyncs or resyncs over
   * what is being typed.
   */
  const baseline = useRef({ name: initialName, values: toFormValues(initialProperties) })
  const dirty =
    name !== baseline.current.name ||
    JSON.stringify(values) !== JSON.stringify(baseline.current.values)

  /**
   * Pick the stored value back up when it changes, and ONLY if nothing is
   * being typed.
   *
   * The inspector used to remount this form on every `updated_at` change (it
   * was part of its `key`): an enrichment or a bulk edit during typing wiped
   * what had been entered, without a word. Same lesson as the work notes -
   * never rewrite an input being typed into - but the opposite remedy: here
   * we do have to resync, only not at just any moment.
   */
  const source = JSON.stringify({ initialName, initialProperties })
  useEffect(() => {
    if (dirty) return
    baseline.current = { name: initialName, values: toFormValues(initialProperties) }
    setName(baseline.current.name)
    setValues(baseline.current.values)
    // `dirty` deliberately kept out of the deps: this effect exists to react
    // to the SOURCE, not to re-run whenever the typing changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  const valid = name.trim() !== '' && requiredFilled(stixType, values)
  const set = (key: string, value: unknown) => setValues((v) => ({ ...v, [key]: value }))
  const submit = () => {
    if (!valid) return
    // The baseline becomes the new reference BEFORE the parent answers:
    // otherwise the form stays marked as modified after a successful save,
    // and accepts no resync ever again.
    //
    // The trimmed name is also written back into the field, and that is not
    // cosmetic. The baseline held `name.trim()` while `dirty` compared it
    // against the untyped state, so saving a name typed with a trailing space
    // left `dirty` true for good: the effect above returned early from then
    // on, and the form never picked up an outside change again. Exactly the
    // failure this comment claims to prevent.
    const clean = name.trim()
    baseline.current = { name: clean, values }
    setName(clean)
    onSubmit(clean, toProperties(stixType, values))
  }

  // picking an ATT&CK suggestion pre-fills the aliases and the MITRE ID
  const applySuggestion = (entry: AttackEntry) => {
    setValues((v) => ({
      ...v,
      ...(entry.aliases?.length ? { aliases: entry.aliases.join(', ') } : {}),
      ...(entry.type === 'attack-pattern' ? { x_mitre_id: entry.id } : {}),
    }))
  }

  /**
   * Picking a country fills the two fields that go with the name. The type is
   * forced rather than merely defaulted: the spec asks for one of country,
   * region or coordinates, and a country picked from the list that came out
   * typed as a region would be wrong in the bundle and wrong in its id.
   */
  const applyCountry = (country: Country) => {
    setValues((v) => ({ ...v, country: country.code, location_type: 'Country' }))
  }

  return (
    <div>
      <label>{meta.kind === 'sco' ? 'Value' : 'Name'} *</label>
      <SuggestInput
        autoFocus={autoFocus}
        stixType={stixType}
        value={name}
        placeholder={meta.kind === 'sco' ? valuePlaceholder(stixType) : 'Name'}
        onChange={setName}
        onPick={applySuggestion}
        onPickCountry={applyCountry}
        onEnter={submit}
      />
      <FieldWarning message={valueWarning(stixType, name)} />
      {stixType === 'indicator' && (
        <PatternBuilder onGenerate={(pattern) => set('pattern', pattern)} />
      )}
      {fields.map((f) => (
        <div key={f.key}>
          <label>
            {f.label}
            {f.required ? ' *' : ''}
          </label>
          {f.type === 'text' && (
            <>
              <input
                value={String(values[f.key] ?? '')}
                placeholder={f.placeholder}
                onChange={(e) => set(f.key, e.target.value)}
              />
              <FieldWarning
                message={FIELD_WARNINGS[f.key]?.(String(values[f.key] ?? '')) ?? null}
              />
            </>
          )}
          {f.type === 'textarea' && (
            <textarea
              rows={3}
              value={String(values[f.key] ?? '')}
              placeholder={f.placeholder}
              onChange={(e) => set(f.key, e.target.value)}
            />
          )}
          {f.type === 'date' && (
            <input
              type="date"
              value={String(values[f.key] ?? '')}
              onChange={(e) => set(f.key, e.target.value)}
            />
          )}
          {f.type === 'select' && (
            <select
              value={String(values[f.key] ?? fieldOption(f.options![0]).value)}
              onChange={(e) => set(f.key, e.target.value)}
            >
              {f.options!.map(fieldOption).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {f.type === 'checkbox' && (
            <input
              type="checkbox"
              className="checkbox"
              checked={Boolean(values[f.key])}
              onChange={(e) => set(f.key, e.target.checked)}
            />
          )}
          {f.help && <p className="hint">{f.help}</p>}
        </div>
      ))}
      <div className="actions form-actions">
        {/* Make the modified state VISIBLE: what made the loss silent was that
            nothing said there was anything left to save before clicking
            elsewhere. */}
        {dirty && <span className="form-dirty">unsaved changes</span>}
        {onCancel && <button onClick={onCancel}>Cancel</button>}
        <button className="primary" disabled={!valid} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
