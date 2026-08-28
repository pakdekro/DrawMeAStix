/**
 * Questions asked OF the canvas, answered on the canvas.
 *
 * These used to be arrangements: the button re-laid the whole investigation
 * into blocks, one per answer. That was built in a world where the graph could
 * not be drawn at all, and it made a virtue of ignoring the relationships -
 * nothing about them could be misread if nothing about them was drawn. Once
 * `radial.ts` could draw them, ignoring them stopped being a precaution and
 * became a loss: the answer to every one of these questions is a SET of
 * objects, and moving them into a pile takes away the very context that makes
 * them mean something. Which of my uncovered objects is wired to the malware
 * is the interesting half, and the pile threw it away.
 *
 * So a lens does not move anything. It lights up what matches and steps the
 * rest back, on whatever layout the analyst is looking at, the way the link
 * focus already does for neighbours.
 *
 * Only questions with a yes-or-no answer live here. "By type" and "by ATT&CK
 * tactic" were partitions rather than questions, and the first of them was
 * telling the analyst something every card already says in its own colour.
 */

export type Lens = 'uncovered' | 'loose' | 'unmarked' | 'machine' | 'flagged'

/**
 * What the canvas is being asked, whichever way it was asked. One of the five
 * fixed questions, or a label the analyst coined, which is the same shape of
 * question - "which objects are these" - and must share the same dimming, or
 * two answers would fight over it.
 */
export type LensChoice =
  | { kind: 'question'; id: Lens }
  | { kind: 'label'; value: string }

export interface LensNode {
  id: string
  stix_type: string
  /** `properties.labels`, the analyst's own vocabulary */
  labels: string[]
  /** `properties.tlp`; empty when the object inherits the export's marking */
  tlp: string
  /** where it came from: `manual`, `paste`, `import`, `doc:…`, `enrich:…` */
  source: string
  /** true when the validator has something to say about this object */
  flagged: boolean
}

export interface LensEdge {
  source: string
  target: string
  rel_type: string
}

export const LENSES: { id: Lens; label: string; hint: string }[] = [
  {
    id: 'uncovered',
    label: 'No indicator on it',
    hint: 'Objects nothing would detect yet',
  },
  {
    id: 'loose',
    label: 'No relationship at all',
    hint: 'Objects sitting on the canvas unattached',
  },
  {
    id: 'unmarked',
    label: 'No TLP of its own',
    hint: "Objects that will inherit the export's marking",
  },
  {
    id: 'machine',
    label: 'Machine-supplied',
    hint: 'Came from an import, a document or an enricher',
  },
  {
    id: 'flagged',
    label: 'The export will complain',
    hint: 'What the validator has something to say about',
  },
]

/**
 * The objects a lens lights up. Everything else steps back, so an empty answer
 * is a real answer - "nothing here is uncovered" - and the caller shows it as
 * a canvas with nothing lit rather than as a canvas with nothing dimmed.
 */
export function lensHits(lens: Lens, nodes: LensNode[], edges: LensEdge[]): Set<string> {
  switch (lens) {
    case 'uncovered': {
      // An indicator is not itself something an indicator covers. Counting it
      // as uncovered would light up the very objects doing the covering.
      const covered = new Set(
        edges.filter((e) => e.rel_type === 'indicates').map((e) => e.target),
      )
      return new Set(
        nodes
          .filter((n) => n.stix_type !== 'indicator' && !covered.has(n.id))
          .map((n) => n.id),
      )
    }
    case 'loose': {
      const touched = new Set(edges.flatMap((e) => [e.source, e.target]))
      return new Set(nodes.filter((n) => !touched.has(n.id)).map((n) => n.id))
    }
    case 'unmarked':
      return new Set(nodes.filter((n) => n.tlp === '').map((n) => n.id))
    case 'machine':
      return new Set(nodes.filter((n) => machineMade(n.source)).map((n) => n.id))
    default:
      return new Set(nodes.filter((n) => n.flagged).map((n) => n.id))
  }
}

/**
 * Pasting IOCs is the analyst reading a report and typing, so it counts as
 * hand-made however fast it was. What this asks is "did a human look at it",
 * not "was it typed one character at a time".
 */
function machineMade(source: string): boolean {
  return source === 'import' || source.startsWith('doc:') || source.startsWith('enrich:')
}

/**
 * The labels in use, with how many objects carry each, most used first and
 * then alphabetical so the same investigation always lists them the same way.
 *
 * Compared exactly, never case-folded. STIX labels are free text and they
 * drift - `ransomware` and `Ransomware` are two labels, and a bundle will
 * export them as two. Folding them here would hide the drift at exactly the
 * moment a list makes it visible, which is half of what this list is for.
 */
export function labelIndex(nodes: LensNode[]): { value: string; count: number }[] {
  const seen = new Map<string, number>()
  for (const n of nodes) {
    for (const label of new Set(n.labels)) seen.set(label, (seen.get(label) ?? 0) + 1)
  }
  return [...seen]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/** The objects carrying one label. */
export function labelHits(value: string, nodes: LensNode[]): Set<string> {
  return new Set(nodes.filter((n) => n.labels.includes(value)).map((n) => n.id))
}
