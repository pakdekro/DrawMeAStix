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
 * Each group is drawn as a CLUSTER: a near-square block of its own, with air
 * all around it. Full-width bands stacked on top of each other were the first
 * try and they read badly - two rows of objects separated by a slightly bigger
 * gap look like one list with a hiccup, not like two groups. Nothing on the
 * canvas names a group, so its shape has to do the naming. And since these
 * arrangements gave up on drawing the graph, the space a cluster costs is not
 * a cost: no edge has to stay short any more.
 */

import { SCO_ORDER, SDO_ORDER } from './stixMeta'

export interface ArrangeNode {
  id: string
  stix_type: string
  /** `properties.tlp`; empty when the object inherits the export's marking */
  tlp: string
  /** where it came from: `manual`, `paste`, `import`, `doc:…`, `enrich:…` */
  source: string
  /** ATT&CK tactics of a technique, resolved from its `x_mitre_id` */
  tactics: string[]
  /** true when the validator has something to say about this object */
  flagged: boolean
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

export type Arrangement =
  | 'type'
  | 'indicators'
  | 'tlp'
  | 'isolated'
  | 'source'
  | 'lint'
  | 'tactic'

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
  {
    id: 'source',
    label: 'By provenance',
    hint: 'Machine-supplied first, hand-made last',
  },
  { id: 'lint', label: 'By validation', hint: 'What the export will complain about, first' },
  { id: 'tactic', label: 'By ATT&CK tactic', hint: 'Kill chain order; techniques only' },
]

/* -- geometry -------------------------------------------------------------- */

/** Gap between two neighbours inside a cluster. */
const GAP = 24
/**
 * Air around a cluster: a full node's width, and deliberately far more than a
 * design layout would ever spend. These arrangements gave up on drawing the
 * graph, so no edge has to stay short, and the whitespace is doing the one job
 * nothing else does - saying where a group ends. A timid gutter and the
 * clusters read as one crowd again.
 */
const GUTTER = 230
/** Width past which the next cluster starts a new row of clusters. */
const ROW_WIDTH = 3200

/**
 * One group as a block, near square, positions relative to its own corner.
 *
 * Square rather than a row: a group of twelve laid out in a line is a band
 * again, and reads as one at a glance. Four by three reads as a pile.
 */
function cluster(group: ArrangeNode[]): { at: (Placement & { node: ArrangeNode })[]; w: number; h: number } {
  const columns = Math.ceil(Math.sqrt(group.length))
  const at: (Placement & { node: ArrangeNode })[] = []
  let y = 0
  let w = 0
  for (let i = 0; i < group.length; i += columns) {
    const row = group.slice(i, i + columns)
    let x = 0
    for (const node of row) {
      at.push({ id: node.id, x, y, node })
      x += node.w + GAP
    }
    w = Math.max(w, x - GAP)
    y += Math.max(...row.map((n) => n.h)) + GAP
  }
  return { at, w, h: y - GAP }
}

/**
 * Lays the clusters out left to right in reading order, wrapping into a new
 * row of clusters rather than running off sideways forever.
 */
function spread(groups: ArrangeNode[][]): Placement[] {
  const out: Placement[] = []
  let x = 0
  let y = 0
  let tallest = 0
  for (const group of groups) {
    if (group.length === 0) continue
    const block = cluster(group)
    if (x > 0 && x + block.w > ROW_WIDTH) {
      x = 0
      y += tallest + GUTTER
      tallest = 0
    }
    for (const p of block.at) out.push({ id: p.id, x: x + p.x, y: y + p.y })
    x += block.w + GUTTER
    tallest = Math.max(tallest, block.h)
  }
  return out
}

/* -- the groupings --------------------------------------------------------- */

/** One cluster per STIX type, palette order; an unknown type lands at the end. */
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
 * Where an object came from, as one word.
 *
 * The stored `source` carries a payload for two of its shapes (`doc:report.pdf`,
 * `enrich:virustotal`), which would make one cluster per file and per enricher
 * and defeat the point.
 */
function provenance(node: ArrangeNode): string {
  const source = node.source || 'manual'
  if (source.startsWith('doc:')) return 'document'
  if (source.startsWith('enrich:')) return 'enrichment'
  return source
}

/**
 * Furthest from the analyst first: an enricher asserted it, a stranger's
 * bundle carried it, a report mentioned it, you pasted it, you typed it. That
 * ordering is the question the arrangement answers - what is in here on
 * somebody else's word.
 */
const SOURCE_ORDER = ['enrichment', 'import', 'document', 'paste', 'manual']

function bySource(nodes: ArrangeNode[]): ArrangeNode[][] {
  const present = [...new Set(nodes.map(provenance))]
  const unknown = present.filter((p) => !SOURCE_ORDER.includes(p)).sort()
  return [...SOURCE_ORDER, ...unknown].map((p) => nodes.filter((n) => provenance(n) === p))
}

/** What the export will complain about, first. The status bar counts these
 *  without ever saying which they are. */
function byLint(nodes: ArrangeNode[]): ArrangeNode[][] {
  return [nodes.filter((n) => n.flagged), nodes.filter((n) => !n.flagged)]
}

/**
 * ATT&CK Enterprise matrix order. Hardcoded because the dataset carries the
 * tactics of a technique but not the order of the tactics themselves; a tactic
 * missing from this list still gets its cluster, at the end, so a dataset
 * refresh adding one never drops techniques on the floor.
 *
 * `defense-impairment` and `stealth` are where `defense-evasion` used to be:
 * ATT&CK split it in two, and the shipped dataset is on the new spelling.
 */
const TACTIC_ORDER = [
  'reconnaissance',
  'resource-development',
  'initial-access',
  'execution',
  'persistence',
  'privilege-escalation',
  'defense-impairment',
  'stealth',
  'credential-access',
  'discovery',
  'lateral-movement',
  'collection',
  'command-and-control',
  'exfiltration',
  'impact',
]

/**
 * Kill chain coverage. A technique sits in its FIRST tactic, so it appears
 * once even when ATT&CK lists it under several; everything that is not a
 * technique cannot be placed on the chain at all and lands in one cluster at
 * the end rather than being scattered or dropped.
 */
function byTactic(nodes: ArrangeNode[]): ArrangeNode[][] {
  const chained = nodes.filter((n) => n.tactics.length > 0)
  const present = [...new Set(chained.map((n) => n.tactics[0]))]
  const unknown = present.filter((t) => !TACTIC_ORDER.includes(t)).sort()
  return [
    ...[...TACTIC_ORDER, ...unknown].map((t) => chained.filter((n) => n.tactics[0] === t)),
    nodes.filter((n) => n.tactics.length === 0),
  ]
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
      return spread(byDetection(nodes, edges))
    case 'tlp':
      return spread(byTlp(nodes))
    case 'isolated':
      return spread(byIsolation(nodes, edges))
    case 'source':
      return spread(bySource(nodes))
    case 'lint':
      return spread(byLint(nodes))
    case 'tactic':
      return spread(byTactic(nodes))
    default:
      return spread(byType(nodes))
  }
}
