import { Fragment } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { TLP_META, typeMeta } from '../stixMeta'
import type { Entity } from '../types'
import Icon from './Icon'

export type EntityNodeType = Node<{ entity: Entity }, 'entity'>

/**
 * A grip on each side of the card.
 *
 * There used to be two, a triangle pointing in at the top and one pointing out
 * at the bottom, and they were honest while every line arrived at the top and
 * left from the bottom. Now that a relationship meets the card wherever the
 * other object happens to be, a triangle at twelve o'clock claims something
 * that is no longer true. So the card offers a grip on every side, and they
 * are circles: a triangle points, and there is nothing left to point at.
 *
 * Each side carries a source and a target laid over each other - the same
 * trick the annotation grip has always used - so you can start a link from any
 * side and finish one on any side.
 */
const SIDES = [
  { id: 'n', at: Position.Top },
  { id: 'e', at: Position.Right },
  { id: 's', at: Position.Bottom },
  { id: 'w', at: Position.Left },
]

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
      {SIDES.map((side) => (
        <Fragment key={side.id}>
          <Handle
            type="target"
            position={side.at}
            id={`${side.id}-in`}
            className="link-handle link-in"
            isConnectableStart={false}
          />
          <Handle
            type="source"
            position={side.at}
            id={`${side.id}-out`}
            className="link-handle"
            isConnectableEnd={false}
          />
        </Fragment>
      ))}
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
