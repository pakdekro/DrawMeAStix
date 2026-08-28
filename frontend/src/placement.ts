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

/** A relationship, as the straight line the eye follows between two objects. */
export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

function side(x1: number, y1: number, x2: number, y2: number, x: number, y: number): number {
  return Math.sign((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1));
}

function meets(s: Segment, ax: number, ay: number, bx: number, by: number): boolean {
  const d1 = side(s.x1, s.y1, s.x2, s.y2, ax, ay);
  const d2 = side(s.x1, s.y1, s.x2, s.y2, bx, by);
  const d3 = side(ax, ay, bx, by, s.x1, s.y1);
  const d4 = side(ax, ay, bx, by, s.x2, s.y2);
  return d1 !== d2 && d3 !== d4;
}

/** Whether a line passes through a box, endpoints inside counting as through. */
export function crosses(s: Segment, r: Rect): boolean {
  const inside = (x: number, y: number) =>
    x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (inside(s.x1, s.y1) || inside(s.x2, s.y2)) return true;
  const right = r.x + r.w;
  const bottom = r.y + r.h;
  return (
    meets(s, r.x, r.y, right, r.y) ||
    meets(s, right, r.y, right, bottom) ||
    meets(s, right, bottom, r.x, bottom) ||
    meets(s, r.x, bottom, r.x, r.y)
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
 *
 * `avoid` are the relationships already drawn. A free cell is not the same
 * as a clear one: on a radial layout the space around an object is crossed by
 * its own spokes, and a note dropped into it sits on three lines while
 * overlapping nothing. So the search runs twice, once refusing the lines and
 * once ignoring them, because a note laid over a line still beats a note laid
 * over an object.
 */
export function findFreeSpot(
  preferred: { x: number; y: number },
  occupied: Rect[],
  size: { w: number; h: number } = { w: NODE_W, h: NODE_H },
  avoid: Segment[] = [],
): { x: number; y: number } {
  for (const clear of avoid.length > 0 ? [true, false] : [false]) {
    for (const { dx, dy } of OFFSETS) {
      const spot: Rect = { x: preferred.x + dx, y: preferred.y + dy, w: size.w, h: size.h };
      if (occupied.some((r) => overlaps(spot, r))) continue;
      if (clear && avoid.some((s) => crosses(s, spot))) continue;
      return { x: spot.x, y: spot.y };
    }
  }
  return { x: preferred.x, y: preferred.y };
}
