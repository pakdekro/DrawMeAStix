import { useEffect, useState } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import type { CaptureItem } from '../types'
import Icon from './Icon'

export type CaptureNodeType = Node<
  { capture: CaptureItem; onOpen: (capture: CaptureItem) => void },
  'annotCapture'
>

/**
 * Screenshot pinned on the canvas (#136): local, never exported in the
 * bundle. Double-click to enlarge; the side handle creates an annotation
 * link (dashed) to an entity, outside the STIX matrix.
 */
export default function CaptureNode({ id, data, selected }: NodeProps<CaptureNodeType>) {
  // Blob URL created in the effect (not useMemo): in StrictMode the double
  // mount's cleanup would revoke a URL the memo does not recompute
  const [url, setUrl] = useState<string>()
  const { deleteElements } = useReactFlow()
  useEffect(() => {
    const u = URL.createObjectURL(data.capture.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [data.capture.blob])
  return (
    <div
      className={`annot-capture${selected ? ' selected' : ''}`}
      title="Double-click to enlarge"
    >
      <button
        className="node-close nodrag"
        title="Delete capture (Delete key works too)"
        onClick={(e) => {
          e.stopPropagation()
          void deleteElements({ nodes: [{ id }] })
        }}
      >
        <Icon name="cross" size={12} />
      </button>
      <img
        src={url}
        alt="capture"
        draggable={false}
        onDoubleClick={() => data.onOpen(data.capture)}
      />
      <Handle type="source" position={Position.Left} id="annot" isConnectableEnd={false} />
      {/* also receives a link dragged from an entity's annotation handle */}
      <Handle type="target" position={Position.Left} id="annot-in" isConnectableStart={false} />
    </div>
  )
}
