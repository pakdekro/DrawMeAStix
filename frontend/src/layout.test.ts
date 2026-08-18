/**
 * Canvas arrangements: each one answers a question about where the
 * investigation stands, and the order of the bands is the answer.
 */

import { describe, expect, it } from "vitest";

import { ARRANGEMENTS, arrange, type ArrangeEdge, type ArrangeNode } from "./layout";

const node = (id: string, stix_type: string, tlp = ""): ArrangeNode => ({
  id,
  stix_type,
  tlp,
  w: 230,
  h: 63,
});
const edge = (source: string, target: string, rel_type: string): ArrangeEdge => ({
  source,
  target,
  rel_type,
});

/** ids grouped by the y they landed on, top band first. */
const bands = (placed: { id: string; x: number; y: number }[]) => {
  const rows = new Map<number, string[]>();
  for (const p of placed) rows.set(p.y, [...(rows.get(p.y) ?? []), p.id]);
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, ids]) => ids);
};

describe("arrange: geometry shared by every arrangement", () => {
  it("stacks downwards and never sideways past five per row", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => node(`n${i}`, "malware"));
    const placed = arrange("type", nodes, []);
    const rows = bands(placed);
    expect(rows.every((r) => r.length <= 5)).toBe(true);
    // 12 over three rows reads as 4 + 4 + 4, not 5 + 5 + 2
    expect(rows.map((r) => r.length)).toEqual([4, 4, 4]);
  });

  it("left-aligns every band on the same axis", () => {
    const placed = arrange("type", [node("a", "malware"), node("b", "url")], []);
    expect(new Set(placed.map((p) => p.x))).toEqual(new Set([0]));
  });

  it("leaves more room between two bands than between two rows", () => {
    const rows = arrange(
      "type",
      [...Array.from({ length: 6 }, (_, i) => node(`m${i}`, "malware")), node("u", "url")],
      [],
    );
    const ys = [...new Set(rows.map((p) => p.y))].sort((a, b) => a - b);
    // two rows of malware, then the url band further down
    expect(ys[1] - ys[0]).toBeLessThan(ys[2] - ys[1]);
  });

  it("an empty canvas is not a special case for the caller", () => {
    for (const a of ARRANGEMENTS) expect(arrange(a.id, [], [])).toEqual([]);
  });

  it("every arrangement places every object exactly once", () => {
    const nodes = [
      node("a", "threat-actor"),
      node("b", "indicator"),
      node("c", "url", "amber"),
      node("d", "process"),
    ];
    const edges = [edge("b", "c", "indicates")];
    for (const a of ARRANGEMENTS) {
      const ids = arrange(a.id, nodes, edges).map((p) => p.id);
      expect(ids.sort(), a.id).toEqual(["a", "b", "c", "d"]);
    }
  });
});

describe("arrange: by type", () => {
  it("follows the palette order, objects then observables", () => {
    const nodes = [node("u", "url"), node("m", "malware"), node("a", "threat-actor")];
    expect(bands(arrange("type", nodes, []))).toEqual([["a"], ["m"], ["u"]]);
  });

  it("keeps a type the palette does not know, at the end", () => {
    const nodes = [node("p", "process"), node("m", "malware")];
    expect(bands(arrange("type", nodes, []))).toEqual([["m"], ["p"]]);
  });
});

describe("arrange: by detection", () => {
  const nodes = [
    node("covered", "domain-name"),
    node("bare", "ipv4-addr"),
    node("ind", "indicator"),
  ];
  const edges = [edge("ind", "covered", "indicates")];

  it("puts what carries no indicator on top", () => {
    expect(bands(arrange("indicators", nodes, edges))).toEqual([
      ["bare"],
      ["covered"],
      ["ind"],
    ]);
  });

  it("gives the indicators a band of their own", () => {
    // they are the detection, not a gap in it: lumping them with the uncovered
    // would make an investigation look worse the more work had been done on it
    const [top] = bands(arrange("indicators", nodes, edges));
    expect(top).not.toContain("ind");
  });

  it("only `indicates` counts as coverage", () => {
    const other = [edge("ind", "covered", "related-to")];
    expect(bands(arrange("indicators", nodes, other))[0].sort()).toEqual(["bare", "covered"]);
  });
});

describe("arrange: by TLP", () => {
  it("unmarked first, then least to most restricted", () => {
    const nodes = [
      node("r", "url", "red"),
      node("none", "url"),
      node("g", "url", "green"),
      node("c", "url", "clear"),
      node("a", "url", "amber"),
    ];
    expect(bands(arrange("tlp", nodes, []))).toEqual([["none"], ["c"], ["g"], ["a"], ["r"]]);
  });

  it("reads the old spelling of CLEAR as CLEAR", () => {
    const nodes = [node("w", "url", "white"), node("c", "url", "clear")];
    expect(bands(arrange("tlp", nodes, []))).toEqual([["w", "c"]]);
  });
});

describe("arrange: loose ends", () => {
  it("puts what no relationship touches on top", () => {
    const nodes = [node("linked", "malware"), node("orphan", "url"), node("other", "malware")];
    const edges = [edge("linked", "other", "uses")];
    expect(bands(arrange("isolated", nodes, edges))).toEqual([["orphan"], ["linked", "other"]]);
  });

  it("a relationship in either direction counts as touched", () => {
    const nodes = [node("a", "malware"), node("b", "url")];
    expect(bands(arrange("isolated", nodes, [edge("b", "a", "communicates-with")]))).toEqual([
      ["a", "b"],
    ]);
  });
});
