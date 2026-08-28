import { BaseEdge, getBezierPath, useInternalNode } from '@xyflow/react'
import type { EdgeProps, InternalNode, Node } from '@xyflow/react'
import { contact, type Outline } from '../floating'
import { DISC_SIZE, type NodeShape } from '../nodeShape'

/**
 * The outline this node offers an edge.
 *
 * For a card or a pill it is the measured box. For a disc it is NOT: the box
 * holds the circle and the caption underneath it, so its centre falls in the
 * text. The circle sits at the top and is always the same size, so we can say
 * exactly where it is without measuring anything.
 */
function outlineOf(node: InternalNode<Node>, shape: NodeShape): Outline {
  const { x, y } = node.internals.positionAbsolute
  const w = node.measured.width ?? 0
  const h = node.measured.height ?? 0
  if (shape === 'disc' && node.type === 'entity') {
    const r = DISC_SIZE / 2
    return { cx: x + w / 2, cy: y + r, hw: r, hh: r, round: true }
  }
  return { cx: x + w / 2, cy: y + h / 2, hw: w / 2, hh: h / 2, round: false }
}

/**
 * A relationship drawn between two outlines rather than between two handles
 * (see `floating.ts` for why). The handles stay on the node - they are what
 * you drag from to create a link - they just no longer decide where the line
 * is drawn.
 */
export default function FloatingEdge({
  id,
  source,
  target,
  markerEnd,
  style,
  data,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
}: EdgeProps) {
  const from = useInternalNode(source)
  const to = useInternalNode(target)
  if (!from || !to) return null

  const shape = (data?.shape as NodeShape | undefined) ?? 'card'
  const a = outlineOf(from, shape)
  const b = outlineOf(to, shape)
  // Asymmetric padding: the tail only needs to clear the border, the head has
  // an arrowhead to park in front of it.
  const start = contact(a, b, 2)
  const end = contact(b, a, 5)

  const [path, labelX, labelY] = getBezierPath({
    sourceX: start.x,
    sourceY: start.y,
    sourcePosition: start.side,
    targetX: end.x,
    targetY: end.y,
    targetPosition: end.side,
    // Well under the 0.25 default: with the anchors already pointing the
    // right way, a pronounced curve only adds length and crossings.
    curvature: 0.15,
  })

  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
      markerEnd={markerEnd}
      label={label}
      labelX={labelX}
      labelY={labelY}
      labelStyle={labelStyle}
      labelShowBg
      labelBgStyle={labelBgStyle}
      labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius}
    />
  )
}
