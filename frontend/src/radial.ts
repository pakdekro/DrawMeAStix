/**
 * The arrangement that does draw the graph.
 *
 * Every other arrangement in `layout.ts` deliberately ignores the
 * relationships: they answer "where am I" by sorting the objects into
 * clusters. This one answers "what does this look like", which is the
 * question a layered layout failed at. It failed for a reason worth stating,
 * because it is the reason this shape is different: a CTI investigation is a
 * STAR, not a flow. One malware wired to seventeen objects has no good drawing
 * in ranks - the rank holding the seventeen is 5700px wide, and every trick
 * for narrowing it buys the width back in crossings.
 *
 * A star does have a good drawing. Put the hub in the middle, put what it
 * touches on a ring around it, put what those touch on the next ring out. The
 * distance from the centre then means something an analyst reads for free:
 * how many hops from the thing the case is about. And it only became
 * drawable once the edges stopped leaving from a fixed handle, because a ring
 * needs its spokes to radiate.
 *
 * Angles come from the breadth-first tree. Each object owns a wedge of the
 * circle, splits it between its children in proportion to how much hangs off
 * each of them, and sits in the middle of its own. Subtrees therefore stay
 * together instead of being interleaved. When a wedge gets too narrow to hold
 * what is in it - deep chains do this - that ring gives up on wedges and
 * shares itself out evenly instead, keeping the order so the subtrees stay
 * contiguous. That is the one place the drawing bends, and it bends towards
 * "readable but not nested" rather than towards a ring a mile wide.
 *
 * Relationships that are not tree edges are simply chords. Nothing is done
 * about them, and they are what the crossings are made of.
 */

import type { ArrangeEdge, ArrangeNode, Placement } from './layout'

/** Air between two objects, whether side by side on a ring or ring to ring. */
const GAP = 40
/** Air between two disconnected pieces of the investigation. */
const GUTTER = 160
/**
 * How much wider a ring may get than the one inside it before the wedges are
 * abandoned. Three rings' worth of room is generous; past that the drawing has
 * stopped being a drawing.
 */
const STRETCH = 3
/**
 * How much wider than tall a ring is. Perfect circles were the first cut and
 * they waste the screen twice over: a card is nearly four times wider than it
 * is tall, so the rings have to stand far enough apart for the widest case and
 * that spacing is then paid on the vertical too; and the screen it lands on is
 * wider than it is tall to begin with. Squashing the rings took the tallest
 * measured case from 2639px down to about 1400 for the same width.
 */
const OBLATE = 1.7

interface Ready {
  node: ArrangeNode
  /** hops from the centre of its piece */
  depth: number
  angle: number
  /** the slice of the circle this object and its descendants own */
  wedge: number
}

/** Half the room the card needs ALONG the ring it sits on. */
function tangential(n: ArrangeNode, angle: number): number {
  return (n.w * Math.abs(Math.sin(angle)) + n.h * Math.abs(Math.cos(angle))) / 2
}

/** Half the room the card needs ACROSS the rings, pointing at the centre. */
function radial(n: ArrangeNode, angle: number): number {
  return (n.w * Math.abs(Math.cos(angle)) + n.h * Math.abs(Math.sin(angle))) / 2
}

/** Half the room a card of this size needs pointing AT the centre, at `angle`. */
function inward(w: number, h: number, angle: number): number {
  return (w * Math.abs(Math.cos(angle)) + h * Math.abs(Math.sin(angle))) / 2
}

/**
 * How fast arc length runs per radian at `angle`, for a ring one unit wide.
 * On a circle this is 1 everywhere; squashed, the top and the bottom of the
 * ring travel further per radian than its sides do.
 */
function arcRate(angle: number): number {
  return Math.hypot(Math.sin(angle), Math.cos(angle) / OBLATE)
}

/** The same, outwards: how far apart two rings are along the ray at `angle`. */
function stepRate(angle: number): number {
  return Math.hypot(Math.cos(angle), Math.sin(angle) / OBLATE)
}

/** Undirected neighbours, both ways, each id listed once per neighbour. */
function neighbours(nodes: ArrangeNode[], edges: ArrangeEdge[]): Map<string, string[]> {
  const known = new Set(nodes.map((n) => n.id))
  const out = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    if (e.source === e.target) continue
    if (!known.has(e.source) || !known.has(e.target)) continue
    out.get(e.source)!.push(e.target)
    out.get(e.target)!.push(e.source)
  }
  return out
}

/** The pieces of the investigation that are not joined to each other. */
function pieces(nodes: ArrangeNode[], near: Map<string, string[]>): ArrangeNode[][] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  const out: ArrangeNode[][] = []
  for (const start of nodes) {
    if (seen.has(start.id)) continue
    const piece: ArrangeNode[] = []
    const queue = [start.id]
    seen.add(start.id)
    while (queue.length > 0) {
      const id = queue.shift()!
      piece.push(byId.get(id)!)
      for (const next of near.get(id) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    out.push(piece)
  }
  // Biggest first: the piece that carries the case gets the reading position,
  // and the strays that follow it are visibly strays.
  return out.sort((a, b) => b.length - a.length || a[0].id.localeCompare(b[0].id))
}

/**
 * What the piece is about: the most connected object. Ties go to the one the
 * palette lists first - an intrusion set outranks a domain at equal degree,
 * which is the reading an analyst would make anyway - and then to the id, so
 * the same investigation always draws the same way.
 */
function hub(piece: ArrangeNode[], near: Map<string, string[]>, rank: Map<string, number>): ArrangeNode {
  return [...piece].sort(
    (a, b) =>
      (near.get(b.id)?.length ?? 0) - (near.get(a.id)?.length ?? 0) ||
      (rank.get(a.stix_type) ?? 99) - (rank.get(b.stix_type) ?? 99) ||
      a.id.localeCompare(b.id),
  )[0]
}

/** Breadth-first from the hub: depth for everyone, children for the wedges. */
function tree(centre: string, piece: ArrangeNode[], near: Map<string, string[]>) {
  const inPiece = new Set(piece.map((n) => n.id))
  const depth = new Map<string, number>([[centre, 0]])
  const children = new Map<string, string[]>(piece.map((n) => [n.id, []]))
  const queue = [centre]
  while (queue.length > 0) {
    const id = queue.shift()!
    // Sorted: breadth-first order must not depend on the order the edges
    // happened to be created in, or the same case draws differently twice.
    for (const next of [...(near.get(id) ?? [])].sort()) {
      if (!inPiece.has(next) || depth.has(next)) continue
      depth.set(next, depth.get(id)! + 1)
      children.get(id)!.push(next)
      queue.push(next)
    }
  }
  return { depth, children }
}

/** How much of the circle a subtree deserves: its number of leaves, at least one. */
function weigh(id: string, children: Map<string, string[]>, into: Map<string, number>): number {
  const kids = children.get(id) ?? []
  const total = kids.reduce((sum, k) => sum + weigh(k, children, into), 0)
  const w = Math.max(1, total)
  into.set(id, w)
  return w
}

/**
 * The wedge angle everyone would get if no ring ever ran out of room. Not the
 * final answer - a crowded ring gives up on wedges - but a good enough map to
 * decide what order to put siblings in.
 */
function wedgeAngles(
  root: string,
  children: Map<string, string[]>,
  weight: Map<string, number>,
  depth: Map<string, number>,
): Map<string, { angle: number; wedge: number }> {
  const out = new Map([[root, { angle: 0, wedge: 2 * Math.PI }]])
  const byDepth = [...depth.entries()].sort((a, b) => a[1] - b[1])
  for (const [id] of byDepth) {
    const kids = children.get(id) ?? []
    if (kids.length === 0) continue
    const mine = out.get(id)!
    const share = kids.reduce((sum, k) => sum + (weight.get(k) ?? 1), 0)
    let taken = 0
    for (const k of kids) {
      const wedge = (mine.wedge * (weight.get(k) ?? 1)) / share
      out.set(k, { angle: mine.angle - mine.wedge / 2 + taken + wedge / 2, wedge })
      taken += wedge
    }
  }
  return out
}

/** Mean direction of a set of angles, which is not their arithmetic mean. */
function meanAngle(angles: number[]): number | null {
  if (angles.length === 0) return null
  const x = angles.reduce((sum, a) => sum + Math.cos(a), 0)
  const y = angles.reduce((sum, a) => sum + Math.sin(a), 0)
  return x === 0 && y === 0 ? null : Math.atan2(y, x)
}

/**
 * Puts siblings in the order that drags the chords shortest.
 *
 * Wedges keep a subtree together, which is most of the battle, but they say
 * nothing about the order INSIDE a wedge, and that order is what the
 * relationships that are not tree edges have to live with. Each object is
 * pulled towards the mean direction of the objects it is joined to elsewhere
 * on the drawing, and its siblings are re-sorted by that pull. Three sweeps,
 * because the pull depends on where everyone ended up last time; it settles
 * long before that on the sizes we draw.
 */
function untangle(
  root: string,
  children: Map<string, string[]>,
  weight: Map<string, number>,
  depth: Map<string, number>,
  near: Map<string, string[]>,
): void {
  const tied = new Set<string>()
  for (const [id, kids] of children) for (const k of kids) tied.add(`${id}|${k}`)
  const chordsOf = (id: string) =>
    (near.get(id) ?? []).filter((n) => !tied.has(`${id}|${n}`) && !tied.has(`${n}|${id}`))

  for (let sweep = 0; sweep < 3; sweep++) {
    const at = wedgeAngles(root, children, weight, depth)
    for (const [parent, kids] of children) {
      if (kids.length < 2) continue
      const start = at.get(parent)!.angle - at.get(parent)!.wedge / 2
      // Everything is measured from where the parent's wedge begins, so the
      // comparison never straddles the seam at twelve o'clock.
      const since = (angle: number) => ((angle - start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
      const pull = new Map(
        kids.map((k) => {
          const wanted = meanAngle(
            chordsOf(k)
              .map((n) => at.get(n)?.angle)
              .filter((a): a is number => a !== undefined),
          )
          return [k, since(wanted ?? at.get(k)!.angle)]
        }),
      )
      kids.sort((a, b) => pull.get(a)! - pull.get(b)! || a.localeCompare(b))
    }
  }
}

/** One disconnected piece, drawn around its hub, positions relative to it. */
function draw(
  piece: ArrangeNode[],
  near: Map<string, string[]>,
  rank: Map<string, number>,
): { at: Placement[]; w: number; h: number } {
  const centre = hub(piece, near, rank)
  const { depth, children } = tree(centre.id, piece, near)
  const weight = new Map<string, number>()
  weigh(centre.id, children, weight)
  untangle(centre.id, children, weight, depth, near)
  const parentOf = new Map<string, string>()
  for (const [id, kids] of children) for (const k of kids) parentOf.set(k, id)

  const ready = new Map<string, Ready>([
    [centre.id, { node: centre, depth: 0, angle: 0, wedge: 2 * Math.PI }],
  ])
  /** Half-width of each ring; its half-height is that over OBLATE. */
  const widthAt = new Map<number, number>([[0, 0]])

  const deepest = Math.max(0, ...depth.values())
  // Ring 0 is the hub itself, and what the first ring has to clear is the hub
  // seen from its own angle: its full width straight out to the side, only its
  // height straight above it.
  let prevW = centre.w
  let prevH = centre.h
  let across = 0

  for (let d = 1; d <= deepest; d++) {
    const ring = piece.filter((n) => depth.get(n.id) === d)
    if (ring.length === 0) continue

    // Where each object WANTS to be: the middle of the wedge its parent hands
    // it, the parents being laid out already, one ring in.
    const wanted = ring.map((node) => {
      const parent = parentOf.get(node.id)
      const from = parent ? ready.get(parent)! : { angle: 0, wedge: 2 * Math.PI }
      const kids = parent ? children.get(parent)! : [node.id]
      const share = kids.reduce((sum, k) => sum + (weight.get(k) ?? 1), 0)
      const before = kids
        .slice(0, kids.indexOf(node.id))
        .reduce((sum, k) => sum + (weight.get(k) ?? 1), 0)
      const wedge = (from.wedge * (weight.get(node.id) ?? 1)) / share
      const start = from.angle - from.wedge / 2 + (from.wedge * before) / share
      return { node, angle: start + wedge / 2, wedge }
    })
    wanted.sort((a, b) => a.angle - b.angle || a.node.id.localeCompare(b.node.id))

    /** How wide the ring has to be for one object to stand in `span` radians. */
    const room = (s: { node: ArrangeNode; angle: number }, span: number) =>
      (tangential(s.node, s.angle) * 2 + GAP) / (span * arcRate(s.angle))
    /** How far out it has to be to clear the ring inside it. */
    const floor =
      across +
      Math.max(
        ...wanted.map(
          (s) =>
            (inward(prevW, prevH, s.angle) + radial(s.node, s.angle) + GAP) /
            stepRate(s.angle),
        ),
      )

    const wedged = Math.max(...wanted.map((s) => room(s, s.wedge)))
    if (wedged <= floor * STRETCH) {
      across = Math.max(floor, wedged)
      for (const s of wanted) {
        ready.set(s.node.id, { node: s.node, depth: d, angle: s.angle, wedge: s.wedge })
      }
    } else {
      // The wedges have run out of room. Equal shares, in the order the wedges
      // asked for, so the subtrees stay next to each other even though they no
      // longer own a slice of the circle. The ring is then sized for the object
      // that needs the most room, not for the average: an equal share of angle
      // is not an equal share of arc once the ring is squashed.
      const step = (2 * Math.PI) / wanted.length
      const spread = wanted.map((s, i) => ({ ...s, angle: wanted[0].angle + i * step }))
      across = Math.max(floor, ...spread.map((s) => room(s, step)))
      for (const s of spread) {
        ready.set(s.node.id, { node: s.node, depth: d, angle: s.angle, wedge: step })
      }
    }
    widthAt.set(d, across)
    prevW = Math.max(...ring.map((n) => n.w))
    prevH = Math.max(...ring.map((n) => n.h))
  }

  const placed = piece.map((node) => {
    const r = ready.get(node.id)
    // Cannot happen: the piece is connected, so the walk reaches everything.
    // Parked rather than dropped, because losing an object off the canvas is
    // the one outcome with no way back.
    const angle = r?.angle ?? 0
    const at = widthAt.get(r?.depth ?? 0) ?? 0
    return {
      id: node.id,
      x: Math.cos(angle) * at - node.w / 2,
      y: (Math.sin(angle) * at) / OBLATE - node.h / 2,
      node,
    }
  })

  const left = Math.min(...placed.map((p) => p.x))
  const top = Math.min(...placed.map((p) => p.y))
  return {
    at: placed.map((p) => ({ id: p.id, x: p.x - left, y: p.y - top })),
    w: Math.max(...placed.map((p) => p.x + p.node.w)) - left,
    h: Math.max(...placed.map((p) => p.y + p.node.h)) - top,
  }
}

/**
 * The whole canvas: every piece drawn around its own hub, then laid out left
 * to right in reading order, the one that carries the case first.
 */
export function radialArrange(
  nodes: ArrangeNode[],
  edges: ArrangeEdge[],
  typeRank: string[],
): Placement[] {
  if (nodes.length === 0) return []
  const rank = new Map(typeRank.map((t, i) => [t, i]))
  const near = neighbours(nodes, edges)
  const out: Placement[] = []
  let x = 0
  for (const piece of pieces(nodes, near)) {
    const block = draw(piece, near, rank)
    for (const p of block.at) out.push({ id: p.id, x: x + p.x, y: p.y })
    x += block.w + GUTTER
  }
  return out
}
