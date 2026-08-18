/**
 * Post-processing of the Dagre layout: folding ranks that are too wide.
 *
 * Dagre lays a graph out in ranks and never wraps one. A CTI graph is shallow
 * and very broad - one intrusion set, one malware, then fifteen observables
 * all sitting on the same rank - so a top-to-bottom layout came out as a
 * 4000px ribbon: technically a descending tree, in practice a horizontal
 * band, only readable at a zoom where the labels are gone. The descent is the
 * part that carries the reading order, and it was the part you could not see.
 *
 * So we keep what Dagre is good at - the rank assignment and the ordering
 * inside a rank, which is the crossing minimisation and the hard part - and
 * only fold a rank that is too wide into several rows, pushing what follows
 * further down. The graph gains height, which a canvas scrolls, and loses
 * width, which a canvas does not.
 *
 * The price is honest and worth naming: an edge landing on the second row of
 * a folded rank passes over the first row. It stays legible because folding
 * mostly hits terminal ranks (the observables at the bottom of a graph rarely
 * have children), and a ribbon nobody can read has no crossings either.
 */

import { NODE_H, NODE_W } from "./placement";

export interface PlacedNode {
  id: string;
  x: number;
  y: number;
}

/**
 * The two Dagre knobs, kept here next to the folding they have to agree with.
 *
 * `NODE_SEP` is the gap between two neighbours on one rank and `RANK_SEP` the
 * drop from one rank to the next; a node being three times wider than it is
 * tall, equal values would already read as a band. Tightening the first and
 * loosening the second buys height, which the canvas scrolls, against width,
 * which it does not.
 */
export const NODE_SEP = 24;
export const RANK_SEP = 120;

/** Above this many nodes, a rank is folded into several rows. */
export const MAX_PER_ROW = 5;
/**
 * Vertical gap between two rows of one rank. Deliberately much tighter than
 * `RANK_SEP`, so a fold reads as one rank continued rather than a step down.
 */
export const ROW_GAP = 32;

/** Splits `n` items into balanced chunks of at most `max` (7 → 4 + 3, not 5 + 2). */
function balancedChunks<T>(items: T[], max: number): T[][] {
  const rows = Math.ceil(items.length / max);
  if (rows <= 1) return [items];
  const per = Math.ceil(items.length / rows);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per));
  return out;
}

/**
 * Takes the top-left corners Dagre produced for a top-to-bottom layout and
 * returns the same nodes with the over-wide ranks folded. Nodes are assumed
 * to share the NODE_W × NODE_H footprint, which is what was fed to Dagre.
 */
export function foldWideRanks(
  nodes: PlacedNode[],
  maxPerRow: number = MAX_PER_ROW,
): PlacedNode[] {
  // Every node of a rank carries the same height, so Dagre gives them all the
  // same y: the y is the rank identifier, no other grouping needed.
  const ranks = new Map<number, PlacedNode[]>();
  for (const node of nodes) {
    const rank = ranks.get(node.y);
    if (rank) rank.push(node);
    else ranks.set(node.y, [node]);
  }

  const out: PlacedNode[] = [];
  let shift = 0; // height the folds above have already consumed
  for (const y of [...ranks.keys()].sort((a, b) => a - b)) {
    // left to right, which is the order Dagre chose to minimise crossings;
    // the id only breaks a tie, so the result never depends on input order
    const rank = ranks
      .get(y)!
      .slice()
      .sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1));
    const chunks = balancedChunks(rank, maxPerRow);
    if (chunks.length === 1) {
      for (const node of rank) out.push({ ...node, y: y + shift });
      continue;
    }
    // the folded rows are centred on the rank they replace, so the parents
    // Dagre had centred above their children stay roughly above them
    const left = Math.min(...rank.map((n) => n.x));
    const centre = (left + Math.max(...rank.map((n) => n.x)) + NODE_W) / 2;
    chunks.forEach((chunk, row) => {
      const width = chunk.length * NODE_W + (chunk.length - 1) * NODE_SEP;
      const start = Math.round(centre - width / 2);
      chunk.forEach((node, i) => {
        out.push({
          id: node.id,
          x: start + i * (NODE_W + NODE_SEP),
          y: y + shift + row * (NODE_H + ROW_GAP),
        });
      });
    });
    shift += (chunks.length - 1) * (NODE_H + ROW_GAP);
  }
  return out;
}
