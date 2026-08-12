/** Overlap-free placement (#79): deterministic, as close to the wish as possible. */

import { describe, expect, it } from "vitest";

import { NODE_H, NODE_W, findFreeSpot, type Rect } from "./placement";

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
