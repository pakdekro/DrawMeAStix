/**
 * Where a relationship meets an object.
 *
 * Until now every edge left the bottom of its source and entered the top of
 * its target, because that is where the two handles are. On a graph drawn top
 * to bottom that reads fine. On a graph the analyst has arranged by hand, or
 * that an arrangement has laid out in clusters, it is the main source of the
 * spaghetti: an edge pointing UP has to leave downwards, swing around the
 * whole node and come back, and an edge pointing sideways does the same. The
 * detour is not information, and there is one per edge.
 *
 * A floating anchor drops the two fixed points and computes, for each end,
 * where the segment joining the two centres crosses that node's outline. The
 * edge then leaves in the direction it is actually going. Nothing about the
 * node's SHAPE is assumed here beyond the outline it declares, so a card, a
 * pill and a disc all route the same way.
 */

import { Position } from '@xyflow/react'

/** The outline an edge is allowed to touch, in flow coordinates. */
export interface Outline {
  /** centre of the shape - NOT necessarily the centre of the node's box */
  cx: number
  cy: number
  /** half-width and half-height of the box, or the radius twice when round */
  hw: number
  hh: number
  round: boolean
}

export interface Contact {
  x: number
  y: number
  /** which way the curve should leave, so the bezier does not fold back */
  side: Position
}

/**
 * The point where the segment from `from` towards `to` leaves `from`'s
 * outline, pushed `pad` further out so an arrowhead has room to sit without
 * touching the border.
 */
export function contact(from: Outline, to: Outline, pad = 0): Contact {
  const dx = to.cx - from.cx
  const dy = to.cy - from.cy
  // Two nodes exactly on top of each other: no direction to speak of. Any
  // answer is wrong, so return the centre and let the edge be a dot rather
  // than dividing by zero.
  if (dx === 0 && dy === 0) return { x: from.cx, y: from.cy, side: Position.Top }

  if (from.round) {
    const r = Math.min(from.hw, from.hh) + pad
    const len = Math.hypot(dx, dy)
    return {
      x: from.cx + (dx / len) * r,
      y: from.cy + (dy / len) * r,
      side: sideOf(dx, dy, r, r),
    }
  }

  // Rectangle: scale the direction until it hits whichever half-extent it
  // reaches first. `Infinity` for a null component is deliberate - a purely
  // horizontal ray never meets the top or bottom edge.
  const hw = from.hw + pad
  const hh = from.hh + pad
  const sx = dx === 0 ? Infinity : hw / Math.abs(dx)
  const sy = dy === 0 ? Infinity : hh / Math.abs(dy)
  const s = Math.min(sx, sy)
  return { x: from.cx + dx * s, y: from.cy + dy * s, side: sideOf(dx, dy, hw, hh) }
}

/**
 * The border the ray leaves through. Compared as `|dx|*hh` against `|dy|*hw`
 * rather than as an angle: that is the same test without a trig call, and it
 * accounts for the box being wider than it is tall.
 */
function sideOf(dx: number, dy: number, hw: number, hh: number): Position {
  if (Math.abs(dx) * hh >= Math.abs(dy) * hw) {
    return dx >= 0 ? Position.Right : Position.Left
  }
  return dy >= 0 ? Position.Bottom : Position.Top
}
