import { BaseEdge, getBezierPath } from '@xyflow/react'
import type { CSSProperties } from 'react'
import type { EdgeProps } from '@xyflow/react'
import type { EdgeContacts } from '../floating'

/**
 * A relationship drawn between two anchors rather than between two handles
 * (see `floating.ts` for why, and for where the anchors come from). The
 * handles stay on the card - they are what you drag from to create a link -
 * they simply no longer decide where the line is drawn.
 *
 * The two ends arrive through `data`, worked out for the whole graph at once:
 * an edge cannot know on its own how many others are competing for the side
 * it wants to leave from.
 */
export default function FloatingEdge({
  id,
  markerEnd,
  style,
  data,
  label,
  labelStyle,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
}: EdgeProps) {
  const ends = data?.ends as EdgeContacts | undefined
  if (!ends) return null
  const color = data?.color as string | undefined

  const [path, labelX, labelY] = getBezierPath({
    sourceX: ends.from.x,
    sourceY: ends.from.y,
    sourcePosition: ends.from.side,
    targetX: ends.to.x,
    targetY: ends.to.y,
    targetPosition: ends.to.side,
    // Well under the 0.25 default: with the anchors already pointing the right
    // way, a pronounced curve only adds length and crossings.
    curvature: 0.15,
  })

  return (
    // The family colour rides on a custom property set on a group, so both the
    // line and its verb inherit it and the link focus can override both from
    // the stylesheet, which an inline stroke would have won against.
    <g style={{ '--edge-stroke': color } as CSSProperties}>
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
    </g>
  )
}
