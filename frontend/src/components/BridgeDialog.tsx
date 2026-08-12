import { useState } from 'react'
import type { BridgeMatch, BridgeRecipe } from '../bridges'
import { typeMeta } from '../stixMeta'
import Modal from './Modal'

/**
 * Canonical bridge (#37): the direct link is illegal in STIX, but the same
 * gesture can mean several things - the analyst picks the recipe, and the
 * intermediate entity plus its two relationships are created in one click.
 */
export default function BridgeDialog({
  match,
  onApply,
  onCancel,
}: {
  match: BridgeMatch
  onApply: (choices: { recipe: BridgeRecipe; name: string }[]) => void
  onCancel: () => void
}) {
  // several recipes can be ticked: the same gesture can mean both at once
  // (an infrastructure AND a detection indicator)
  const [picked, setPicked] = useState<Set<string>>(new Set([match.recipes[0].key]))
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      match.recipes.map((r) => [r.key, r.defaultName(match.sdo, match.sco)]),
    ),
  )

  const toggle = (recipe: BridgeRecipe) =>
    setPicked((sel) => {
      const next = new Set(sel)
      if (next.has(recipe.key)) next.delete(recipe.key)
      else next.add(recipe.key)
      return next
    })
  const chosen = match.recipes.filter((r) => picked.has(r.key))
  const valid = chosen.length > 0 && chosen.every((r) => names[r.key]?.trim())

  return (
    <Modal title="No direct STIX relationship" onClose={onCancel}>
      <p className="hint">
        <strong>{match.sdo.name}</strong> cannot be linked directly to{' '}
        <strong>{match.sco.name}</strong> ({typeMeta(match.sco.stix_type).label}).
        What do you mean? The canonical intermediate will be created with both
        relationships.
      </p>
      {match.recipes.map((recipe) => (
        <div key={recipe.key}>
          <label className="bridge-option">
            <input
              type="checkbox"
              className="checkbox"
              checked={picked.has(recipe.key)}
              onChange={() => toggle(recipe)}
            />
            <span className="dot" style={{ background: typeMeta(recipe.bridgeType).color }} />
            <span className="bridge-label">
              {recipe.label}
              <span className="bridge-hint">{recipe.hint}</span>
            </span>
          </label>
          {picked.has(recipe.key) && (
            <input
              className="bridge-name"
              value={names[recipe.key] ?? ''}
              onChange={(e) => setNames((n) => ({ ...n, [recipe.key]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <div className="actions">
        <button onClick={onCancel}>Cancel</button>
        <button
          className="primary"
          disabled={!valid}
          onClick={() =>
            onApply(chosen.map((r) => ({ recipe: r, name: names[r.key].trim() })))
          }
        >
          Create {chosen.length > 1 ? `the ${chosen.length} bridges` : 'the bridge'}
        </button>
      </div>
    </Modal>
  )
}
