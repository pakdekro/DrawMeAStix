/**
 * Canvas arrangements: laying the objects out as an answer to a question,
 * rather than as a drawing of the graph.
 *
 * The button used to run Dagre and draw the structure. On a CTI graph that is
 * a losing game, and it was measured rather than guessed: a shape that reads
 * top to bottom comes out 5700px wide on a real investigation, and every way
 * of narrowing it - folding the wide ranks, packing them, ranking nodes by
 * their STIX type - buys the width back in edge crossings, two to five times
 * as many. A star with one malware wired to seventeen objects has no good
 * layered drawing; no setting was going to find one.
 *
 * So the button stopped answering "what does this mean" and started answering
 * "where am I". Each arrangement partitions the canvas into bands, in a fixed
 * order, with whatever needs the analyst's attention on top. The relationships
 * are not drawn upon at all, so nothing about them can be misread, and the
 * arrangement of meaning stays the analyst's job - which is what it was in
 * practice anyway.
 *
 * Bands stack downwards rather than sitting side by side: a canvas scrolls
 * down comfortably and sideways badly, and stacking works the same from two
 * bands to fifteen, where columns stop working after three.
 */

import { SCO_ORDER, SDO_ORDER } from './stixMeta'

export interface ArrangeNode {
  id: string
  stix_type: string
  /** `properties.tlp`; empty when the object inherits the export's marking */
  tlp: string
  w: number
  h: number
}

export interface ArrangeEdge {
  source: string
  target: string
  rel_type: string
}

export interface Placement {
  id: string
  x: number
  y: number
}

export type Arrangement = 'type' | 'indicators' | 'tlp' | 'isolated'

/** The menu, in the order it is shown. `hint` says what the bands mean. */
export const ARRANGEMENTS: { id: Arrangement; label: string; hint: string }[] = [
  { id: 'type', label: 'By type', hint: 'One block per STIX type, palette order' },
  {
    id: 'indicators',
    label: 'By detection',
    hint: 'What carries no indicator first, then what does',
  },
  { id: 'tlp', label: 'By TLP marking', hint: 'Unmarked first, then CLEAR to RED' },
  { id: 'isolated', label: 'Loose ends first', hint: 'Objects with no relationship on top' },
]

/* -- geometry -------------------------------------------------------------- */

/** Nodes per row inside a band, past which the block gets another row. */
const PER_ROW = 5
/** Gap between two neighbours, and between two rows of one band. */
const GAP = 24
/** Gap between two bands. Wider on purpose: it is the only thing on screen
 *  saying where one group ends and the next begins. */
const BAND_GAP = 72

/** Splits into balanced rows of at most `max` (13 → 5 + 4 + 4, not 5 + 5 + 3). */
function rowsOf(items: ArrangeNode[], max: number): ArrangeNode[][] {
  const count = Math.ceil(items.length / max)
  const per = Math.ceil(items.length / count)
  const out: ArrangeNode[][] = []
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per))
  return out
}

/**
 * Stacks the bands, every one left-aligned on the same axis. Blocks sharing an
 * edge read as a list; centred ones read as a pyramid, which says something
 * about importance that is not meant.
 */
function stack(bands: ArrangeNode[][]): Placement[] {
  const out: Placement[] = []
  let y = 0
  for (const band of bands) {
    if (band.length === 0) continue
    for (const row of rowsOf(band, PER_ROW)) {
      let x = 0
      for (const node of row) {
        out.push({ id: node.id, x, y })
        x += node.w + GAP
      }
      y += Math.max(...row.map((n) => n.h)) + GAP
    }
    y += BAND_GAP - GAP
  }
  return out
}

/* -- the groupings --------------------------------------------------------- */

/** One band per STIX type, palette order; an unknown type lands at the end. */
function byType(nodes: ArrangeNode[]): ArrangeNode[][] {
  const known = [...SDO_ORDER, ...SCO_ORDER]
  const present = [...new Set(nodes.map((n) => n.stix_type))]
  const unknown = present.filter((t) => !known.includes(t)).sort()
  return [...known, ...unknown].map((t) => nodes.filter((n) => n.stix_type === t))
}

/**
 * What has no detection written for it, what has, and the indicators.
 *
 * The indicators get a band of their own rather than falling into "nothing
 * points at me", which is true of them and beside the point: they are the
 * detection, not a gap in it.
 */
function byDetection(nodes: ArrangeNode[], edges: ArrangeEdge[]): ArrangeNode[][] {
  const covered = new Set(
    edges.filter((e) => e.rel_type === 'indicates').map((e) => e.target),
  )
  const indicators = nodes.filter((n) => n.stix_type === 'indicator')
  const rest = nodes.filter((n) => n.stix_type !== 'indicator')
  return [rest.filter((n) => !covered.has(n.id)), rest.filter((n) => covered.has(n.id)), indicators]
}

/** Unmarked first: those inherit the export's marking, which is the thing to
 *  check before sharing. Then from least to most restricted. */
const TLP_ORDER = ['', 'clear', 'green', 'amber', 'red']

function byTlp(nodes: ArrangeNode[]): ArrangeNode[][] {
  // "white" is the old spelling of "clear" and the app writes both
  const marking = (n: ArrangeNode) => (n.tlp === 'white' ? 'clear' : n.tlp)
  const present = [...new Set(nodes.map(marking))]
  const unknown = present.filter((t) => !TLP_ORDER.includes(t)).sort()
  return [...TLP_ORDER, ...unknown].map((t) => nodes.filter((n) => marking(n) === t))
}

/** Objects no relationship touches, first. They are the ends an investigation
 *  left hanging, and a wide layout parks them where nobody looks. */
function byIsolation(nodes: ArrangeNode[], edges: ArrangeEdge[]): ArrangeNode[][] {
  const linked = new Set(edges.flatMap((e) => [e.source, e.target]))
  return [nodes.filter((n) => !linked.has(n.id)), nodes.filter((n) => linked.has(n.id))]
}

/**
 * Positions for one arrangement. Nodes keep the order they were handed in
 * within a band, which is the canvas order, so re-running an arrangement never
 * reshuffles what it already arranged.
 */
export function arrange(
  kind: Arrangement,
  nodes: ArrangeNode[],
  edges: ArrangeEdge[],
): Placement[] {
  if (nodes.length === 0) return []
  switch (kind) {
    case 'indicators':
      return stack(byDetection(nodes, edges))
    case 'tlp':
      return stack(byTlp(nodes))
    case 'isolated':
      return stack(byIsolation(nodes, edges))
    default:
      return stack(byType(nodes))
  }
}
