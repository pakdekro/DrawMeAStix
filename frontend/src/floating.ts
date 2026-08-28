/**
 * Where a relationship meets an object.
 *
 * Until now every edge left the bottom of its source and entered the top of
 * its target, because that is where the two handles are. On a graph drawn top
 * to bottom that reads fine. On a graph the analyst has arranged by hand it is
 * the main source of the spaghetti: an edge pointing UP has to leave
 * downwards, swing around the whole node and come back. The detour carries no
 * information, and there is one per edge.
 *
 * So the anchor is not a point on the node any more, it is a point on an
 * INVISIBLE OVAL a little larger than the card, and it slides around that oval
 * to face whatever it is joining. What says which way a relationship runs is
 * the arrowhead, which it already did; where the line touches the card was
 * never carrying that meaning, it was only ever an artefact of the handles.
 *
 * The oval is a superellipse rather than a true ellipse: |x/a|^n + |y/b|^n = 1.
 * At n = 2 that is an ellipse, and an ellipse that stays outside a 230x63 card
 * has to be half as wide again, which leaves the arrowheads floating in space
 * on the left and right. Raising the exponent pulls the curve out towards the
 * corners, so the outline hugs the card at a near constant distance the whole
 * way round while staying an oval to the eye.
 */

import { Position } from '@xyflow/react'

/** The oval an edge is allowed to touch, in flow coordinates. */
export interface Outline {
  cx: number
  cy: number
  /** semi-axis across, and down */
  a: number
  b: number
}

export interface Contact {
  x: number
  y: number
  /** which way the curve should leave, so the bezier does not fold back */
  side: Position
}

/**
 * How far outside the card the oval runs, and how square it is allowed to
 * become. The pair is not free: the oval has to clear the card's CORNERS, or
 * an edge arriving diagonally would end inside the box. `outlineFits` below is
 * the check, and the test suite runs it over every card size we draw.
 */
export const PAD = 14
/**
 * 6 and not 4: an exponent of 4 draws a rounder oval and clears the corners
 * of a one-line card comfortably, but a card carrying labels and marks is
 * 230x120, nearly square, and there the rounder curve cuts the corner. 6 is
 * the roundest the tallest card we draw can take.
 */
export const ROUNDNESS = 6

/** The oval that hangs off a `w` x `h` card centred on `cx`, `cy`. */
export function outline(cx: number, cy: number, w: number, h: number): Outline {
  return { cx, cy, a: w / 2 + PAD, b: h / 2 + PAD }
}

/**
 * Whether that oval clears the corners of the card it belongs to. A corner
 * sits at (w/2, h/2), so it is outside the outline when the superellipse
 * evaluates to less than 1 there.
 */
export function outlineFits(w: number, h: number): boolean {
  const o = outline(0, 0, w, h)
  return (w / 2 / o.a) ** ROUNDNESS + (h / 2 / o.b) ** ROUNDNESS <= 1
}

/** The point where the ray from `from` towards `to` crosses `from`'s oval. */
export function contact(from: Outline, to: Outline): Contact {
  const dx = to.cx - from.cx
  const dy = to.cy - from.cy
  // Two cards exactly on top of each other: no direction to speak of. Any
  // answer is wrong, so return the centre rather than dividing by zero.
  if (dx === 0 && dy === 0) return { x: from.cx, y: from.cy, side: Position.Top }

  const t =
    1 /
    (Math.abs(dx / from.a) ** ROUNDNESS + Math.abs(dy / from.b) ** ROUNDNESS) **
      (1 / ROUNDNESS)
  return { x: from.cx + dx * t, y: from.cy + dy * t, side: sideOf(dx, dy, from) }
}

/**
 * The quarter of the oval the ray leaves through, which is what the curve
 * uses to decide where to bulge. Compared as `|dx|*b` against `|dy|*a` rather
 * than as an angle: same test without a trig call, and it accounts for the
 * card being far wider than it is tall.
 */
function sideOf(dx: number, dy: number, o: Outline): Position {
  if (Math.abs(dx) * o.b >= Math.abs(dy) * o.a) {
    return dx >= 0 ? Position.Right : Position.Left
  }
  return dy >= 0 ? Position.Bottom : Position.Top
}
