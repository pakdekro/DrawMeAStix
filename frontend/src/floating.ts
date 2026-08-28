/**
 * Where a relationship meets an object.
 *
 * Until now every edge left the bottom of its source and entered the top of
 * its target, because that is where the two handles are. On a graph drawn top
 * to bottom that reads fine. On a graph the analyst has arranged by hand it is
 * the main source of the spaghetti: an edge pointing UP has to leave
 * downwards, swing around the whole card and come back. The detour carries no
 * information, and there is one per edge.
 *
 * So the anchor moves. What says which way a relationship runs is the
 * arrowhead, which it always did; where the line touched the card was never
 * carrying that, it was an artefact of the handles.
 *
 * Two rules decide where it goes, in this order:
 *
 *  1. It picks the SIDE that faces the other object, and sits at the middle of
 *     that side, a little clear of the border. Not at the point where the ray
 *     between the two centres crosses the outline: that is the honest answer
 *     geometrically, and it looks wrong, because a card with a single link
 *     ends up joined at a corner for no reason the eye can see.
 *  2. It only leaves that middle when it has to. Several edges on the same
 *     side fan out around it, in the order their targets appear along that
 *     side, so the lines do not cross each other in the last few pixels.
 *
 * Which means the anchors have to be worked out for the whole graph at once,
 * rather than by each edge on its own: an edge cannot know how many others
 * are competing for the side it wants.
 */

import { Position } from '@xyflow/react'

export interface AnchorNode {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface AnchorEdge {
  id: string
  source: string
  target: string
}

export interface Contact {
  x: number
  y: number
  /** which way the curve leaves, so the bezier does not fold back on itself */
  side: Position
}

export interface EdgeContacts {
  from: Contact
  to: Contact
}

/** How far clear of the border an anchor sits, leaving room for an arrowhead. */
export const PAD = 14
/** Distance between two anchors sharing a side, when there is room for it. */
export const PITCH = 18
/** How close to a corner the fan may reach. */
export const CORNER = 16

interface Slot {
  edge: string
  end: 'from' | 'to'
  side: Position
  /** direction towards the other object, used to order the fan */
  dx: number
  dy: number
}

/**
 * The side a ray leaves a card through. `|dy| * w` against `|dx| * h` is the
 * rectangle's own diagonal test: it accounts for the card being nearly four
 * times wider than it is tall, so a target up and to the right of a wide card
 * leaves through the TOP, which is the short way out.
 */
function sideOf(dx: number, dy: number, node: AnchorNode): Position {
  if (Math.abs(dy) * node.w > Math.abs(dx) * node.h) {
    return dy >= 0 ? Position.Bottom : Position.Top
  }
  return dx >= 0 ? Position.Right : Position.Left
}

function place(node: AnchorNode, side: Position, offset: number): Contact {
  const cx = node.x + node.w / 2
  const cy = node.y + node.h / 2
  switch (side) {
    case Position.Top:
      return { x: cx + offset, y: node.y - PAD, side }
    case Position.Bottom:
      return { x: cx + offset, y: node.y + node.h + PAD, side }
    case Position.Left:
      return { x: node.x - PAD, y: cy + offset, side }
    default:
      return { x: node.x + node.w + PAD, y: cy + offset, side }
  }
}

/**
 * The offsets for `count` anchors sharing one side, centred on its middle.
 * One anchor gets the middle itself. The fan widens by `PITCH` until it would
 * reach the corners, then tightens to fit rather than spilling over them.
 */
function fan(count: number, span: number): number[] {
  if (count <= 1) return [0]
  const pitch = Math.min(PITCH, span / (count - 1))
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * pitch)
}

/**
 * Both ends of every edge, keyed by edge id. Edges whose endpoints are not in
 * `nodes` are left out; so is an edge whose two cards share a centre, which
 * has no direction to speak of.
 */
export function anchor(
  nodes: AnchorNode[],
  edges: AnchorEdge[],
): Map<string, EdgeContacts> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const slots = new Map<string, Slot[]>()
  const add = (id: string, slot: Slot) => {
    const list = slots.get(id)
    if (list) list.push(slot)
    else slots.set(id, [slot])
  }

  for (const e of edges) {
    const a = byId.get(e.source)
    const b = byId.get(e.target)
    if (!a || !b) continue
    const dx = b.x + b.w / 2 - (a.x + a.w / 2)
    const dy = b.y + b.h / 2 - (a.y + a.h / 2)
    if (dx === 0 && dy === 0) continue
    add(a.id, { edge: e.id, end: 'from', side: sideOf(dx, dy, a), dx, dy })
    add(b.id, { edge: e.id, end: 'to', side: sideOf(-dx, -dy, b), dx: -dx, dy: -dy })
  }

  const out = new Map<string, EdgeContacts>()
  const contact = (edge: string, end: 'from' | 'to', c: Contact) => {
    const pair = out.get(edge)
    if (pair) pair[end] = c
    else out.set(edge, { from: c, to: c })
  }

  for (const [id, list] of slots) {
    const node = byId.get(id)
    if (!node) continue
    for (const side of [Position.Top, Position.Bottom, Position.Left, Position.Right]) {
      const here = list.filter((s) => s.side === side)
      if (here.length === 0) continue
      // Ordered the way their targets lie along the side, so two edges leaving
      // the same border do not swap places and cross on the doorstep.
      const across = side === Position.Top || side === Position.Bottom
      here.sort((p, q) => (across ? p.dx - q.dx : p.dy - q.dy))
      const span = Math.max((across ? node.w : node.h) - 2 * CORNER, 0)
      const offsets = fan(here.length, span)
      here.forEach((slot, i) => contact(slot.edge, slot.end, place(node, side, offsets[i])))
    }
  }
  return out
}
