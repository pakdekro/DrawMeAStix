/**
 * Folding the wide ranks of a Dagre layout: a CTI graph is shallow and broad,
 * and the re-layout has to give it height rather than width.
 */

import { describe, expect, it } from "vitest";

import { MAX_PER_ROW, RANK_SEP, ROW_GAP, foldWideRanks, type PlacedNode } from "./layout";
import { NODE_H, NODE_W } from "./placement";

/** A Dagre rank: `count` nodes side by side on the same y. */
const rank = (y: number, count: number, prefix = "n"): PlacedNode[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    x: i * (NODE_W + 60),
    y,
  }));

const widthOf = (nodes: PlacedNode[]) =>
  Math.max(...nodes.map((n) => n.x)) + NODE_W - Math.min(...nodes.map((n) => n.x));
const heightOf = (nodes: PlacedNode[]) =>
  Math.max(...nodes.map((n) => n.y)) + NODE_H - Math.min(...nodes.map((n) => n.y));

describe("foldWideRanks", () => {
  it("leaves a graph nobody complains about untouched", () => {
    const graph = [...rank(0, 1, "a"), ...rank(200, 3, "b")];
    expect(foldWideRanks(graph)).toEqual(graph);
  });

  it("trades width for height on the fan-out that motivated this", () => {
    // one actor, one malware, fifteen observables: the shape a report gives.
    // Dagre centres a parent over its children, hence the offset on the first
    // two ranks - without it the fixture would measure its own sloppiness.
    const leaves = rank(400, 15, "o");
    const middle = (Math.max(...leaves.map((n) => n.x)) - NODE_W) / 2;
    const graph = [
      { id: "a0", x: middle, y: 0 },
      { id: "m0", x: middle, y: 200 },
      ...leaves,
    ];
    const folded = foldWideRanks(graph);
    expect(folded).toHaveLength(graph.length);
    expect(widthOf(folded)).toBeLessThan(widthOf(graph) / 2);
    expect(heightOf(folded)).toBeGreaterThan(heightOf(graph));
    // and no node is left behind
    expect(folded.map((n) => n.id).sort()).toEqual(graph.map((n) => n.id).sort());
  });

  it("never puts more than MAX_PER_ROW nodes on one line", () => {
    for (const count of [6, 7, 11, 15, 40]) {
      const perRow = new Map<number, number>();
      for (const n of foldWideRanks(rank(0, count))) {
        perRow.set(n.y, (perRow.get(n.y) ?? 0) + 1);
      }
      for (const [, n] of perRow) expect(n).toBeLessThanOrEqual(MAX_PER_ROW);
    }
  });

  it("balances the rows: seven nodes read as 4 + 3, not 5 + 2", () => {
    const counts = new Map<number, number>();
    for (const n of foldWideRanks(rank(0, 7))) {
      counts.set(n.y, (counts.get(n.y) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual([4, 3]);
  });

  it("pushes the ranks below down by exactly what the fold consumed", () => {
    const folded = foldWideRanks([...rank(0, 10, "o"), ...rank(200, 2, "b")]);
    const rows = [...new Set(folded.filter((n) => n.id.startsWith("o")).map((n) => n.y))];
    expect(rows).toHaveLength(2);
    // the second rank starts one extra row lower than Dagre had put it
    const below = folded.filter((n) => n.id.startsWith("b"));
    expect(new Set(below.map((n) => n.y))).toEqual(new Set([200 + NODE_H + ROW_GAP]));
  });

  it("keeps the left-to-right order Dagre computed", () => {
    const scrambled = [
      { id: "c", x: 600, y: 0 },
      { id: "a", x: 0, y: 0 },
      { id: "d", x: 900, y: 0 },
      { id: "b", x: 300, y: 0 },
      { id: "f", x: 1500, y: 0 },
      { id: "e", x: 1200, y: 0 },
    ];
    const folded = foldWideRanks(scrambled);
    const reading = folded
      .slice()
      .sort((p, q) => p.y - q.y || p.x - q.x)
      .map((n) => n.id);
    expect(reading).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("centres the folded rows on the rank they replace", () => {
    const original = rank(0, 12);
    const centre = (nodes: PlacedNode[]) =>
      (Math.min(...nodes.map((n) => n.x)) + Math.max(...nodes.map((n) => n.x)) + NODE_W) / 2;
    expect(centre(foldWideRanks(original))).toBeCloseTo(centre(original), 0);
  });

  it("rows of one rank sit closer than two ranks do", () => {
    const folded = foldWideRanks(rank(0, 10));
    const rows = [...new Set(folded.map((n) => n.y))].sort((a, b) => a - b);
    expect(rows[1] - rows[0]).toBe(NODE_H + ROW_GAP);
    expect(rows[1] - rows[0]).toBeLessThan(NODE_H + RANK_SEP);
  });

  it("an empty graph is not a special case for the caller", () => {
    expect(foldWideRanks([])).toEqual([]);
  });
});
