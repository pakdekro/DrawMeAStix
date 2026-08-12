import { useState } from 'react'
import { relationHelp } from '../relationHelp'
import Modal from './Modal'
import type { Entity } from '../types'

export interface PendingConnection {
  source: Entity
  target: Entity
  allowed: string[]
  /**
   * Concrete pairs to create, a single one in the ordinary case.
   *
   * In bulk, the "many" side can be the source OR the target: the STIX
   * matrix decides the direction. Linking four IPs to an infrastructure is
   * written `infrastructure consists-of ip`, not the reverse - an observable
   * is not the source of a relationship towards an SDO. Explicit pairs avoid
   * having to carry that direction in a flag.
   */
  pairs: [Entity, Entity][]
  /** display labels, the many side being summarised ("4 IPv4") */
  fromLabel: string
  toLabel: string
}

/** Relationship type choice between two nodes, limited to the STIX matrix. */
export default function RelationDialog({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: PendingConnection
  onCancel: () => void
  onSubmit: (relType: string) => void
}) {
  const [relType, setRelType] = useState(pending.allowed[0])
  const from = pending.fromLabel
  const to = pending.toLabel
  const count = pending.pairs.length
  return (
    <Modal
      title={count > 1 ? `New relationships (${count})` : 'New relationship'}
      onClose={onCancel}
    >
      <p>
        <strong>{from}</strong> → <strong>{to}</strong>
      </p>
      <label>Relationship type (STIX 2.1)</label>
      <select value={relType} onChange={(e) => setRelType(e.target.value)}>
        {pending.allowed.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {relationHelp(relType) && (
        <p className="rel-help">
          <strong>{from}</strong> {relType} <strong>{to}</strong> : {relationHelp(relType)}
        </p>
      )}
      <p className="hint">
        {count > 1
          ? 'Only relationships the STIX spec allows for every selected object are offered.'
          : 'Only relationships the STIX spec allows between these two types are offered.'}
      </p>
      <div className="actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={() => onSubmit(relType)}>
          {count > 1 ? `Create ${count} relationships` : 'Create'}
        </button>
      </div>
    </Modal>
  )
}
