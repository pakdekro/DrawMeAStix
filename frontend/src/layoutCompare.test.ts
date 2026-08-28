/**
 * The layouts, side by side, on the shapes a CTI investigation actually takes.
 *
 * This file exists because the last two attempts at drawing this graph were
 * settled by opinion and both were wrong. It prints a table and asserts the
 * few things that were the whole argument, so the next attempt has to beat a
 * number rather than a feeling.
 *
 * What the numbers said when the radial went in, on 28 August 2026:
 *
 *   Operation Aviary   dagre 1 crossing  2830x1710 | radial 4  3161x1404
 *   pure star (17)     dagre 0           4294x 246 | radial 0  1846x1018
 *   star with tails    dagre 0           4294x 612 | radial 0  2435x1369
 *   big star (41)      dagre 0           8104x 429 | radial 0  3576x2031
 *
 * Neither wins outright, and that is the finding. Dagre draws a chain better
 * and a star as a ribbon a screen and a half wide at 250px tall, which is the
 * layout that was thrown out for being unreadable. The radial holds a star in
 * a block you can actually look at, and pays for it with a handful of
 * crossings on the graphs that were flow-shaped to begin with.
 */
import { describe, expect, it } from 'vitest'
import dagre from '@dagrejs/dagre'
import { radialArrange, type GraphEdge, type GraphNode, type Placement } from './radial'
import { SCO_ORDER, SDO_ORDER } from './stixMeta'
// The bundle the app ships as its worked example, read as data rather than
// through the importer: what is being measured is the shape of the graph.
import aviary from '../public/examples/operation-voliere.stix.json'

const KNOWN = new Set([...SDO_ORDER, ...SCO_ORDER])
const W = 230
const H = 63

function load() {
  const bundle = aviary as unknown as {
    objects: {
      id: string
      type: string
      source_ref?: string
      target_ref?: string
      relationship_type?: string
    }[]
  }
  const nodes: GraphNode[] = bundle.objects
    .filter((o) => KNOWN.has(o.type))
    .map((o) => ({ id: o.id, stix_type: o.type, w: W, h: H }))
  const ids = new Set(nodes.map((n) => n.id))
  const edges: GraphEdge[] = bundle.objects
    .filter((o) => o.type === 'relationship' && ids.has(o.source_ref!) && ids.has(o.target_ref!))
    .map((o) => ({ source: o.source_ref!, target: o.target_ref! }))
  return { nodes, edges }
}

const centre = (p: Placement) => ({ x: p.x + W / 2, y: p.y + H / 2 })

function crossings(at: Map<string, Placement>, edges: GraphEdge[]): number {
  const segs = edges
    .map((e) => ({ e, a: at.get(e.source), b: at.get(e.target) }))
    .filter((s) => s.a && s.b)
    .map((s) => ({ ...s.e, p: centre(s.a!), q: centre(s.b!) }))
  let n = 0
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const u = segs[i]
      const v = segs[j]
      if (u.source === v.source || u.source === v.target) continue
      if (u.target === v.source || u.target === v.target) continue
      if (cross(u.p, u.q, v.p, v.q)) n++
    }
  }
  return n
}

type P = { x: number; y: number }
const turn = (a: P, b: P, c: P) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
const cross = (a: P, b: P, c: P, d: P) =>
  turn(a, b, c) !== turn(a, b, d) && turn(c, d, a) !== turn(c, d, b)

function box(placed: Placement[]) {
  const w = Math.max(...placed.map((p) => p.x + W)) - Math.min(...placed.map((p) => p.x))
  const h = Math.max(...placed.map((p) => p.y + H)) - Math.min(...placed.map((p) => p.y))
  return { w: Math.round(w), h: Math.round(h) }
}

function dagreTB(nodes: GraphNode[], edges: GraphEdge[]): Placement[] {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 24, ranksep: 120 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes) g.setNode(n.id, { width: W, height: H })
  for (const e of edges) g.setEdge(e.source, e.target)
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    return { id: n.id, x: p.x - W / 2, y: p.y - H / 2 }
  })
}

function overlaps(placed: Placement[]): number {
  let n = 0
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]
      const b = placed[j]
      if (a.x < b.x + W && a.x + W > b.x && a.y < b.y + H && a.y + H > b.y) n++
    }
  }
  return n
}

const node = (id: string, stix_type = 'malware'): GraphNode => ({ id, stix_type, w: W, h: H })

/** A hub with `spokes` leaves, and `chains` tails of length `deep` off it. */
function star(spokes: number, chains: number, deep: number) {
  const nodes = [node('hub', 'malware')]
  const edges: GraphEdge[] = []
  for (let i = 0; i < spokes; i++) {
    nodes.push(node(`s${i}`, 'ipv4-addr'))
    edges.push({ source: 'hub', target: `s${i}` })
  }
  for (let c = 0; c < chains; c++) {
    let prev = 'hub'
    for (let d = 0; d < deep; d++) {
      const id = `c${c}_${d}`
      nodes.push(node(id, 'domain-name'))
      edges.push({ source: prev, target: id })
      prev = id
    }
  }
  return { nodes, edges }
}

const radial = (nodes: GraphNode[], edges: GraphEdge[]) =>
  radialArrange(nodes, edges, [...SDO_ORDER, ...SCO_ORDER])

function report(title: string, nodes: GraphNode[], edges: GraphEdge[]) {
  const runs: [string, Placement[]][] = [
    ['dagre TB', dagreTB(nodes, edges)],
    ['radial', radial(nodes, edges)],
  ]
  console.log(`\n${title}: ${nodes.length} objects, ${edges.length} relationships`)
  for (const [name, placed] of runs) {
    const at = new Map(placed.map((p) => [p.id, p]))
    const b = box(placed)
    console.log(
      `  ${name.padEnd(16)} ${String(crossings(at, edges)).padStart(4)} crossings   ` +
        `${String(b.w).padStart(5)} x ${String(b.h).padStart(5)} px   ` +
        `${overlaps(placed)} overlaps   ${placed.length} placed`,
    )
  }
}

describe('measurement', () => {
  it('compares the layouts', () => {
    report('Operation Aviary', ...Object.values(load()) as [GraphNode[], GraphEdge[]])
    const pureStar = star(17, 0, 0)
    report('pure star (17 spokes)', pureStar.nodes, pureStar.edges)
    const mixed = star(12, 5, 3)
    report('star with tails', mixed.nodes, mixed.edges)
    const wide = star(24, 8, 2)
    report('big star', wide.nodes, wide.edges)
    console.log('')
  })

  it('never lays one object on top of another, whatever the shape', () => {
    const shapes = [load(), star(17, 0, 0), star(12, 5, 3), star(24, 8, 2), star(40, 0, 0)]
    for (const shape of shapes) {
      expect(overlaps(radial(shape.nodes, shape.edges))).toBe(0)
    }
  })

  /**
   * The reason this arrangement exists. A star laid out in ranks is a ribbon:
   * 17 objects on one rank came to 4294px, and 24 to 8104, at around 250px
   * tall. You cannot read either without zooming out until the text is gone.
   */
  it('holds a star in something you can look at, where ranks cannot', () => {
    for (const spokes of [17, 24, 40]) {
      const { nodes, edges } = star(spokes, 0, 0)
      const ranked = box(dagreTB(nodes, edges))
      const round = box(radial(nodes, edges))
      expect(round.w).toBeLessThan(ranked.w * 0.7)
      // and it comes out roughly screen shaped rather than square or ribbon
      expect(round.w / round.h).toBeGreaterThan(1.2)
      expect(round.w / round.h).toBeLessThan(3.5)
    }
  })

  /**
   * The shape the whole thing was built for. A hub and its spokes has a
   * drawing with no crossings at all, and the radial has to find it: if it
   * ever does not, the wedge arithmetic has drifted.
   */
  it('draws a star with nothing crossing', () => {
    for (const spokes of [8, 17, 40]) {
      const { nodes, edges } = star(spokes, 0, 0)
      const placed = radial(nodes, edges)
      expect(crossings(new Map(placed.map((p) => [p.id, p])), edges)).toBe(0)
    }
  })

  /**
   * And the shape it is weakest on, kept honest rather than quiet: Aviary is
   * flow-shaped, ranks draw it with one crossing, the radial with four. The
   * bound is there so a change that makes this much worse has to be noticed
   * and argued for.
   */
  it('stays close to ranks on a graph that is really a flow', () => {
    const { nodes, edges } = load()
    const count = (placed: Placement[]) =>
      crossings(new Map(placed.map((p) => [p.id, p])), edges)
    expect(count(radial(nodes, edges))).toBeLessThanOrEqual(8)
  })
})
