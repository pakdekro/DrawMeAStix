import { Handle, Position, useReactFlow } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { TLP_META, typeMeta } from '../stixMeta'
import type { Entity } from '../types'
import Icon from './Icon'

export type EntityNodeType = Node<{ entity: Entity }, 'entity'>

export default function EntityNode({ id, data, selected }: NodeProps<EntityNodeType>) {
  const meta = typeMeta(data.entity.stix_type)
  const { deleteElements } = useReactFlow()
  const props = data.entity.properties ?? {}
  const tlp = TLP_META[String(props.tlp ?? '')]
  const confidence = typeof props.confidence === 'number' ? props.confidence : null
  // Belt and braces: the importer already normalises these lists, but an
  // entity can also come from a restored save or an older base. Rendering an
  // object as a JSX child tears the root down on EVERY open, the bad row
  // being stored - the one failure with no way out from inside the app.
  const labels = Array.isArray(props.labels)
    ? props.labels.filter((l): l is string => typeof l === 'string')
    : []
  return (
    <div
      className={`entity-node${selected ? ' selected' : ''}`}
      style={{ borderColor: meta.color }}
    >
      {/* STIX flow top to bottom (same axis as the re-layout button) */}
      <Handle type="target" position={Position.Top} />
      {/* quick delete on hover (#136): same path as the Delete key */}
      <button
        className="node-close nodrag"
        title="Deletes the entity, its relationships and its notes (Delete key works too)"
        onClick={(e) => {
          e.stopPropagation()
          void deleteElements({ nodes: [{ id }] })
        }}
      >
        <Icon name="cross" size={12} />
      </button>
      {/* Type badge, only drawn by the disc shape: three letters and the
          type's colour where a card would have shown the label. */}
      <div className="node-glyph" style={{ color: meta.color, borderColor: meta.color }}>
        {meta.abbr}
      </div>
      <div className="node-type" style={{ color: meta.color }}>
        {meta.label}
      </div>
      <div className="node-name" title={data.entity.name}>
        {data.entity.name}
      </div>
      {labels.length > 0 && (
        <div className="node-labels">
          {labels.slice(0, 3).map((l) => (
            <span key={l} className="node-label">
              {l}
            </span>
          ))}
          {labels.length > 3 && <span className="node-label">+{labels.length - 3}</span>}
        </div>
      )}
      {(tlp || confidence !== null) && (
        <div className="node-marks">
          {tlp && (
            <span className="node-tlp" style={{ color: tlp.color, borderColor: tlp.color }}>
              {tlp.label}
            </span>
          )}
          {confidence !== null && (
            <span className="node-conf" title="Confidence (0-100)">
              {confidence}
            </span>
          )}
        </div>
      )}
      {data.entity.status === 'candidate' && <div className="node-badge">candidate</div>}
      <Handle type="source" position={Position.Bottom} />
      {/* annotation handle (#136) on the side: notes/captures links only,
          in both directions (overlaid source/target pair). onConnect drops
          any STIX link that would start from here. */}
      <Handle
        type="target"
        position={Position.Right}
        id="annot"
        className="annot-handle"
        isConnectableStart={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="annot-out"
        className="annot-handle"
        isConnectableEnd={false}
      />
    </div>
  )
}
