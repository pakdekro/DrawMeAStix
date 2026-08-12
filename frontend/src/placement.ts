/**
 * Placement of new nodes on the canvas (#79): a node that is created
 * (palette, ATT&CK, generated indicator, canonical bridge, accepted from
 * the triage bin) must never cover an existing node. We look for the
 * free cell closest to the wanted point on an expanding grid -
 * deterministic, no randomness.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** default footprint of a node not measured yet */
export const NODE_W = 260;
export const NODE_H = 88;
/** minimum gap kept between two nodes */
const MARGIN = 24;
/** step of the search grid */
const STEP_X = NODE_W + 2 * MARGIN;
const STEP_Y = NODE_H + 2 * MARGIN;
/** search radius (in cells) - beyond it, we return the requested point */
const SHELLS = 6;

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w + MARGIN &&
    a.x + a.w + MARGIN > b.x &&
    a.y < b.y + b.h + MARGIN &&
    a.y + a.h + MARGIN > b.y
  );
}

/** offsets (dx, dy) sorted nearest to farthest, computed once */
const OFFSETS: { dx: number; dy: number }[] = (() => {
  const cells: { dx: number; dy: number; d2: number }[] = [];
  for (let i = -SHELLS; i <= SHELLS; i++) {
    for (let j = -SHELLS; j <= SHELLS; j++) {
      const dx = i * STEP_X;
      const dy = j * STEP_Y;
      cells.push({ dx, dy, d2: dx * dx + dy * dy });
    }
  }
  // stable tie-break at equal distance: rightmost first, then topmost
  cells.sort((a, b) => a.d2 - b.d2 || b.dx - a.dx || a.dy - b.dy);
  return cells.map(({ dx, dy }) => ({ dx, dy }));
})();

/**
 * Returns the free position closest to `preferred` for a node of
 * footprint `size` (NODE_W × NODE_H by default; the #136 annotations
 * pass their measured size). If the whole neighbourhood is taken (very
 * dense canvas), we return the requested point: an overlap beats a node
 * thrown out of sight.
 */
export function findFreeSpot(
  preferred: { x: number; y: number },
  occupied: Rect[],
  size: { w: number; h: number } = { w: NODE_W, h: NODE_H },
): { x: number; y: number } {
  for (const { dx, dy } of OFFSETS) {
    const spot: Rect = { x: preferred.x + dx, y: preferred.y + dy, w: size.w, h: size.h };
    if (!occupied.some((r) => overlaps(spot, r))) {
      return { x: spot.x, y: spot.y };
    }
  }
  return { x: preferred.x, y: preferred.y };
}
