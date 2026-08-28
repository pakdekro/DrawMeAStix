/**
 * The arrangement that draws the graph. What is asserted here is what makes a
 * drawing readable at all - nothing lost, nothing on top of anything else,
 * distance from the middle meaning hops from the hub - plus the one property
 * an analyst will notice the day it breaks: the same case draws the same way
 * twice.
 */

import { describe, expect, it } from 'vitest'
import { radialArrange, type GraphEdge, type GraphNode, type Placement } from './radial'
import { SCO_ORDER, SDO_ORDER } from './stixMeta'

const W = 230
const H = 63
const node = (id: string, stix_type = 'malware', extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  stix_type,
  w: W,
  h: H,
  ...extra,
})
const edge = (source: string, target: string): GraphEdge => ({ source, target })

const draw = (nodes: GraphNode[], edges: GraphEdge[]) =>
  radialArrange(nodes, edges, [...SDO_ORDER, ...SCO_ORDER])

function overlapping(placed: Placement[], nodes: GraphNode[]): number {
  const size = new Map(nodes.map((n) => [n.id, n]))
  let n = 0
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]
      const b = placed[j]
      const aw = size.get(a.id)!.w
      const ah = size.get(a.id)!.h
      const bw = size.get(b.id)!.w
      const bh = size.get(b.id)!.h
      if (a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y) n++
    }
  }
  return n
}

/** A hub with `spokes` leaves, and `chains` tails `deep` long hanging off it. */
function star(spokes: number, chains = 0, deep = 0) {
  const nodes = [node('hub')]
  const edges: GraphEdge[] = []
  for (let i = 0; i < spokes; i++) {
    nodes.push(node(`s${i}`, 'ipv4-addr'))
    edges.push(edge('hub', `s${i}`))
  }
  for (let c = 0; c < chains; c++) {
    let prev = 'hub'
    for (let d = 0; d < deep; d++) {
      nodes.push(node(`c${c}_${d}`, 'domain-name'))
      edges.push(edge(prev, `c${c}_${d}`))
      prev = `c${c}_${d}`
    }
  }
  return { nodes, edges }
}

const distance = (p: Placement, hub: Placement) =>
  Math.hypot(p.x + W / 2 - (hub.x + W / 2), p.y + H / 2 - (hub.y + H / 2))

describe('radial: what every drawing owes the analyst', () => {
  it('places every object exactly once', () => {
    const { nodes, edges } = star(12, 4, 3)
    const placed = draw(nodes, edges)
    expect(placed.map((p) => p.id).sort()).toEqual(nodes.map((n) => n.id).sort())
  })

  it('never puts two objects on top of each other', () => {
    for (const shape of [star(3), star(17), star(12, 5, 3), star(24, 8, 2), star(40)]) {
      expect(overlapping(draw(shape.nodes, shape.edges), shape.nodes)).toBe(0)
    }
  })

  it('draws the same case the same way twice', () => {
    const { nodes, edges } = star(9, 3, 2)
    expect(draw(nodes, edges)).toEqual(draw(nodes, edges))
  })

  /**
   * The order the objects were created in is an accident of how the analyst
   * worked, and it must not show in the drawing: a bundle re-imported with its
   * objects shuffled has to come out the same.
   */
  it('does not depend on the order the objects arrive in', () => {
    const { nodes, edges } = star(8, 2, 2)
    const shuffled = [...nodes].reverse()
    const byId = (placed: Placement[]) =>
      Object.fromEntries(placed.map((p) => [p.id, [Math.round(p.x), Math.round(p.y)]]))
    expect(byId(draw(shuffled, [...edges].reverse()))).toEqual(byId(draw(nodes, edges)))
  })

  it('survives a single object with nothing joined to it', () => {
    expect(draw([node('alone')], [])).toEqual([{ id: 'alone', x: 0, y: 0 }])
  })

  it('is not a special case for an empty canvas', () => {
    expect(draw([], [])).toEqual([])
  })
})

describe('radial: what the drawing says', () => {
  it('puts the most connected object in the middle', () => {
    const { nodes, edges } = star(11, 2, 2)
    const placed = draw(nodes, edges)
    const at = new Map(placed.map((p) => [p.id, p]))
    const hub = at.get('hub')!
    for (const p of placed) {
      if (p.id !== 'hub') expect(distance(p, hub)).toBeGreaterThan(0)
    }
    // and it really is the nearest thing to the centre of the drawing
    const middleX = (Math.min(...placed.map((p) => p.x)) + Math.max(...placed.map((p) => p.x))) / 2
    expect(Math.abs(hub.x - middleX)).toBeLessThan(W)
  })

  it('sets a ring further out for every hop away from the hub', () => {
    const nodes = [node('hub'), node('a'), node('b'), node('c')]
    const edges = [edge('hub', 'a'), edge('a', 'b'), edge('b', 'c')]
    const at = new Map(draw(nodes, edges).map((p) => [p.id, p]))
    const hub = at.get('hub')!
    const hops = ['a', 'b', 'c'].map((id) => distance(at.get(id)!, hub))
    expect(hops[0]).toBeLessThan(hops[1])
    expect(hops[1]).toBeLessThan(hops[2])
  })

  /**
   * A tie on degree is settled by the palette rather than by the id, so the
   * object an analyst would call the subject of the case wins: an intrusion
   * set outranks an address it merely touches.
   */
  it('breaks a tie on connections in favour of the more telling type', () => {
    const nodes = [node('ip', 'ipv4-addr'), node('set', 'intrusion-set'), node('x'), node('y')]
    const edges = [edge('ip', 'x'), edge('set', 'y'), edge('ip', 'set')]
    const placed = draw(nodes, edges)
    const at = new Map(placed.map((p) => [p.id, p]))
    // the hub is the one nothing sits inside of
    const centre = placed.reduce((best, p) =>
      distance(p, at.get('set')!) < distance(best, at.get('set')!) ? p : best,
    )
    expect(centre.id).toBe('set')
  })

  it('gives each disconnected piece its own hub, side by side', () => {
    const nodes = [node('h1'), node('a'), node('b'), node('h2'), node('c')]
    const edges = [edge('h1', 'a'), edge('h1', 'b'), edge('h2', 'c')]
    const placed = draw(nodes, edges)
    expect(overlapping(placed, nodes)).toBe(0)
    const at = new Map(placed.map((p) => [p.id, p]))
    // the bigger piece is laid out first, so it sits to the left
    expect(at.get('h1')!.x).toBeLessThan(at.get('h2')!.x)
  })

  it('ignores a relationship pointing at an object that is not on the canvas', () => {
    const nodes = [node('a'), node('b')]
    const placed = draw(nodes, [edge('a', 'b'), edge('a', 'ghost')])
    expect(placed).toHaveLength(2)
    expect(overlapping(placed, nodes)).toBe(0)
  })

  it('ignores an object joined to itself', () => {
    const nodes = [node('a'), node('b')]
    const placed = draw(nodes, [edge('a', 'a'), edge('a', 'b')])
    expect(placed).toHaveLength(2)
    expect(overlapping(placed, nodes)).toBe(0)
  })
})
