import { Handle, Position, useReactFlow } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import type { NoteItem } from '../types'
import Icon from './Icon'

export type NoteNodeType = Node<{ note: NoteItem }, 'annotNote'>

/**
 * Note pinned on the canvas (#136): annotation layer, not a STIX object of
 * the graph. Dashed link to its entity; the "-" button (or Delete) unpins
 * it without removing it from the notes panel.
 */
export default function NoteNode({ id, data, selected }: NodeProps<NoteNodeType>) {
  const { note } = data
  const { deleteElements } = useReactFlow()
  return (
    <div className={`annot-note${selected ? ' selected' : ''}`}>
      <div className="annot-note-kind">
        <Icon name="note" size={11} />{' '}
        {note.kind === 'opinion' ? `opinion: ${note.opinion_value}` : 'note'}
      </div>
      <button
        className="node-close nodrag"
        title="Remove from canvas - the note stays in the notes panel"
        onClick={(e) => {
          e.stopPropagation()
          void deleteElements({ nodes: [{ id }] })
        }}
      >
        <Icon name="minus" size={12} />
      </button>
      <div className="annot-note-content">{note.content}</div>
      <Handle type="source" position={Position.Left} id="annot" isConnectable={false} />
    </div>
  )
}
