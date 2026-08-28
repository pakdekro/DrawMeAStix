/** Overlap-free placement (#79): deterministic, as close to the wish as possible. */

import { describe, expect, it } from "vitest";

import { NODE_H, NODE_W, crosses, findFreeSpot, type Rect, type Segment } from "./placement";

const at = (x: number, y: number): Rect => ({ x, y, w: NODE_W, h: NODE_H });

function overlapping(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("findFreeSpot", () => {
  it("canvas vide : rend le point demandé", () => {
    expect(findFreeSpot({ x: 100, y: 50 }, [])).toEqual({ x: 100, y: 50 });
  });

  it("point occupé : rend la case libre la plus proche, sans chevauchement", () => {
    const occupied = [at(100, 50)];
    const spot = findFreeSpot({ x: 100, y: 50 }, occupied);
    expect(spot).not.toEqual({ x: 100, y: 50 });
    expect(overlapping({ ...spot, w: NODE_W, h: NODE_H }, occupied[0])).toBe(false);
  });

  it("déterministe : deux appels identiques rendent la même case", () => {
    const occupied = [at(0, 0), at(320, 0)];
    expect(findFreeSpot({ x: 0, y: 0 }, occupied)).toEqual(
      findFreeSpot({ x: 0, y: 0 }, occupied),
    );
  });

  it("rafale : chaque nœud placé devient un obstacle pour le suivant", () => {
    const placed: Rect[] = [];
    for (let i = 0; i < 6; i++) {
      const spot = findFreeSpot({ x: 0, y: 0 }, placed);
      placed.push({ ...spot, w: NODE_W, h: NODE_H });
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlapping(placed[i], placed[j])).toBe(false);
      }
    }
  });

  it("voisinage saturé : repli sur le point demandé plutôt que hors de vue", () => {
    const wall: Rect[] = [];
    for (let i = -8; i <= 8; i++) {
      for (let j = -8; j <= 8; j++) {
        wall.push(at(i * 300, j * 130));
      }
    }
    expect(findFreeSpot({ x: 0, y: 0 }, wall)).toEqual({ x: 0, y: 0 });
  });
});

/**
 * A free cell is not the same as a clear one. On a radial layout the space
 * around an object is crossed by its own spokes, so a note dropped into it
 * overlaps nothing and still sits on three lines.
 */
describe("keeping clear of the relationships", () => {
  const size = { w: 100, h: 40 };
  const across: Segment = { x1: -500, y1: 20, x2: 500, y2: 20 };

  it("knows when a line passes through a box", () => {
    expect(crosses(across, { x: 0, y: 0, w: 100, h: 40 })).toBe(true);
    expect(crosses(across, { x: 0, y: 100, w: 100, h: 40 })).toBe(false);
  });

  it("counts a line that ends inside the box", () => {
    expect(crosses({ x1: 50, y1: 20, x2: 900, y2: 20 }, { x: 0, y: 0, w: 100, h: 40 })).toBe(
      true,
    );
  });

  it("steps aside for a line even when the cell is free", () => {
    const spot = findFreeSpot({ x: 0, y: 0 }, [], size, [across]);
    expect(crosses(across, { ...spot, ...size })).toBe(false);
  });

  it("puts objects first: a line is worth crossing to avoid one", () => {
    // every cell the search can reach is crossed by one of these
    const everywhere: Segment[] = Array.from({ length: 40 }, (_, i) => ({
      x1: -5000,
      y1: (i - 20) * 60,
      x2: 5000,
      y2: (i - 20) * 60,
    }));
    const spot = findFreeSpot({ x: 0, y: 0 }, [{ x: 0, y: 0, w: 100, h: 40 }], size, everywhere);
    expect(spot).not.toEqual({ x: 0, y: 0 });
  });

  it("behaves as it always did when it is given no lines", () => {
    expect(findFreeSpot({ x: 0, y: 0 }, [], size)).toEqual(
      findFreeSpot({ x: 0, y: 0 }, [], size, []),
    );
  });
});
