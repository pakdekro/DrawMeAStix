import { BaseEdge, getBezierPath, useInternalNode } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import { contact, outline } from '../floating'

/**
 * A relationship drawn between two ovals rather than between two handles (see
 * `floating.ts` for why). The handles stay on the card - they are what you
 * drag from to create a link - they simply no longer decide where the line is
 * drawn.
 */
export default function FloatingEdge({
  id,
  source,
  target,
  markerEnd,
  style,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
}: EdgeProps) {
  const from = useInternalNode(source)
  const to = useInternalNode(target)
  if (!from || !to) return null

  const a = outline(
    from.internals.positionAbsolute.x + (from.measured.width ?? 0) / 2,
    from.internals.positionAbsolute.y + (from.measured.height ?? 0) / 2,
    from.measured.width ?? 0,
    from.measured.height ?? 0,
  )
  const b = outline(
    to.internals.positionAbsolute.x + (to.measured.width ?? 0) / 2,
    to.internals.positionAbsolute.y + (to.measured.height ?? 0) / 2,
    to.measured.width ?? 0,
    to.measured.height ?? 0,
  )
  const start = contact(a, b)
  const end = contact(b, a)

  const [path, labelX, labelY] = getBezierPath({
    sourceX: start.x,
    sourceY: start.y,
    sourcePosition: start.side,
    targetX: end.x,
    targetY: end.y,
    targetPosition: end.side,
    // Well under the 0.25 default: with the anchors already pointing the right
    // way, a pronounced curve only adds length and crossings.
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
