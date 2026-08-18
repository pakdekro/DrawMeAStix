/**
 * Canvas arrangements: each one answers a question about where the
 * investigation stands, and the order of the clusters is the answer.
 */

import { describe, expect, it } from "vitest";

import { ARRANGEMENTS, arrange, type ArrangeEdge, type ArrangeNode } from "./layout";

const node = (
  id: string,
  stix_type: string,
  extra: Partial<ArrangeNode> = {},
): ArrangeNode => ({
  id,
  stix_type,
  tlp: "",
  source: "manual",
  tactics: [],
  flagged: false,
  w: 230,
  h: 63,
  ...extra,
});
const edge = (source: string, target: string, rel_type: string): ArrangeEdge => ({
  source,
  target,
  rel_type,
});

/** ids in reading order: clusters left to right, rows of clusters top down. */
const reading = (placed: { id: string; x: number; y: number }[]) =>
  [...placed].sort((a, b) => a.y - b.y || a.x - b.x).map((p) => p.id);

describe("arrange: the shape shared by every arrangement", () => {
  it("draws a group as a near-square cluster, not as a row", () => {
    // twelve in a line is a band again, and reads as one
    const nodes = Array.from({ length: 12 }, (_, i) => node(`n${i}`, "malware"));
    const placed = arrange("type", nodes, []);
    expect(new Set(placed.map((p) => p.x)).size).toBe(4);
    expect(new Set(placed.map((p) => p.y)).size).toBe(3);
  });

  it("gives a single object a cluster of one", () => {
    expect(arrange("type", [node("a", "malware")], [])).toEqual([{ id: "a", x: 0, y: 0 }]);
  });

  it("leaves far more air between two clusters than inside one", () => {
    const placed = arrange(
      "type",
      [node("m1", "malware"), node("m2", "malware"), node("u", "url")],
      [],
    );
    const at = Object.fromEntries(placed.map((p) => [p.id, p]));
    // edge to edge, not corner to corner: the node's own width is not air
    const inside = at.m2.x - (at.m1.x + 230);
    const between = at.u.x - (at.m2.x + 230);
    expect(between).toBeGreaterThan(inside * 3);
  });

  it("never lets two objects overlap, whatever the cluster", () => {
    const nodes = [
      ...Array.from({ length: 9 }, (_, i) => node(`m${i}`, "malware")),
      ...Array.from({ length: 7 }, (_, i) => node(`u${i}`, "url")),
      ...Array.from({ length: 4 }, (_, i) => node(`t${i}`, "tool")),
    ];
    const at = arrange("type", nodes, []);
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        const [a, b] = [at[i], at[j]];
        const hit = a.x < b.x + 230 && a.x + 230 > b.x && a.y < b.y + 63 && a.y + 63 > b.y;
        expect(hit, `${a.id} covers ${b.id}`).toBe(false);
      }
    }
  });

  it("wraps into a new row of clusters rather than running off sideways", () => {
    // eight groups of six: in one line that would be some 8000px across
    const nodes = [
      "malware", "tool", "indicator", "identity",
      "url", "file", "domain-name", "ipv4-addr",
    ].flatMap((t) => Array.from({ length: 6 }, (_, i) => node(`${t}${i}`, t)));
    const at = arrange("type", nodes, []);
    expect(Math.max(...at.map((p) => p.x))).toBeLessThan(3000);
    expect(new Set(at.map((p) => p.y)).size).toBeGreaterThan(3);
  });

  it("an empty canvas is not a special case for the caller", () => {
    for (const a of ARRANGEMENTS) expect(arrange(a.id, [], [])).toEqual([]);
  });

  it("every arrangement places every object exactly once", () => {
    const nodes = [
      node("a", "threat-actor"),
      node("b", "indicator"),
      node("c", "url", { tlp: "amber" }),
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
    expect(reading(arrange("type", nodes, []))).toEqual(["a", "m", "u"]);
  });

  it("keeps a type the palette does not know, at the end", () => {
    const nodes = [node("p", "process"), node("m", "malware")];
    expect(reading(arrange("type", nodes, []))).toEqual(["m", "p"]);
  });
});

describe("arrange: by detection", () => {
  const nodes = [
    node("covered", "domain-name"),
    node("bare", "ipv4-addr"),
    node("ind", "indicator"),
  ];
  const edges = [edge("ind", "covered", "indicates")];

  it("puts what carries no indicator first", () => {
    expect(reading(arrange("indicators", nodes, edges))).toEqual(["bare", "covered", "ind"]);
  });

  it("gives the indicators a cluster of their own", () => {
    // they are the detection, not a gap in it: lumping them with the uncovered
    // would make an investigation look worse the more work had been done on it
    expect(reading(arrange("indicators", nodes, edges))[0]).not.toBe("ind");
  });

  it("only `indicates` counts as coverage", () => {
    const other = [edge("ind", "covered", "related-to")];
    expect(reading(arrange("indicators", nodes, other)).slice(0, 2).sort()).toEqual([
      "bare",
      "covered",
    ]);
  });
});

describe("arrange: by TLP", () => {
  it("unmarked first, then least to most restricted", () => {
    const nodes = [
      node("r", "url", { tlp: "red" }),
      node("none", "url"),
      node("g", "url", { tlp: "green" }),
      node("c", "url", { tlp: "clear" }),
      node("a", "url", { tlp: "amber" }),
    ];
    expect(reading(arrange("tlp", nodes, []))).toEqual(["none", "c", "g", "a", "r"]);
  });

  it("reads the old spelling of CLEAR as CLEAR", () => {
    const nodes = [node("w", "url", { tlp: "white" }), node("c", "url", { tlp: "clear" })];
    // one cluster of two, side by side, not two clusters a gutter apart
    expect(arrange("tlp", nodes, []).map((p) => p.x)).toEqual([0, 254]);
  });
});

describe("arrange: loose ends", () => {
  it("puts what no relationship touches first", () => {
    const nodes = [node("linked", "malware"), node("orphan", "url"), node("other", "malware")];
    const edges = [edge("linked", "other", "uses")];
    expect(reading(arrange("isolated", nodes, edges))).toEqual(["orphan", "linked", "other"]);
  });

  it("a relationship in either direction counts as touched", () => {
    const nodes = [node("a", "malware"), node("b", "url")];
    const at = arrange("isolated", nodes, [edge("b", "a", "communicates-with")]);
    expect(at.map((p) => p.x)).toEqual([0, 254]); // one cluster, nothing left alone
  });
});

describe("arrange: by provenance", () => {
  it("goes from furthest from the analyst to closest", () => {
    const nodes = [
      node("typed", "url", { source: "manual" }),
      node("vt", "url", { source: "enrich:virustotal" }),
      node("pasted", "url", { source: "paste" }),
      node("bundle", "url", { source: "import" }),
      node("report", "url", { source: "doc:report.pdf" }),
    ];
    expect(reading(arrange("source", nodes, []))).toEqual([
      "vt",
      "bundle",
      "report",
      "pasted",
      "typed",
    ]);
  });

  it("collapses the payload, one cluster per kind and not per file", () => {
    // `doc:a.pdf` and `doc:b.pdf` are both "a report said so"
    const nodes = [
      node("a", "url", { source: "doc:a.pdf" }),
      node("b", "url", { source: "doc:b.pdf" }),
    ];
    expect(arrange("source", nodes, []).map((p) => p.x)).toEqual([0, 254]);
  });

  it("an object without a source counts as hand-made", () => {
    const nodes = [node("bare", "url", { source: "" }), node("typed", "url")];
    expect(arrange("source", nodes, []).map((p) => p.x)).toEqual([0, 254]);
  });
});

describe("arrange: by validation", () => {
  it("puts what the export will complain about first", () => {
    const nodes = [node("fine", "url"), node("broken", "url", { flagged: true })];
    expect(reading(arrange("lint", nodes, []))).toEqual(["broken", "fine"]);
  });

  it("a clean investigation is one cluster, not an empty one and a full one", () => {
    const nodes = [node("a", "url"), node("b", "url")];
    expect(arrange("lint", nodes, []).map((p) => p.x)).toEqual([0, 254]);
  });
});

describe("arrange: by ATT&CK tactic", () => {
  const tech = (id: string, ...tactics: string[]) =>
    node(id, "attack-pattern", { tactics });

  it("follows the kill chain, not the alphabet", () => {
    const nodes = [
      tech("impact", "impact"),
      tech("recon", "reconnaissance"),
      tech("exec", "execution"),
    ];
    expect(reading(arrange("tactic", nodes, []))).toEqual(["recon", "exec", "impact"]);
  });

  it("places a technique once, under its first tactic", () => {
    const nodes = [tech("dual", "persistence", "privilege-escalation"), tech("p", "persistence")];
    const at = arrange("tactic", nodes, []);
    expect(at).toHaveLength(2);
    expect(at.map((p) => p.x)).toEqual([0, 254]); // same cluster
  });

  it("keeps a tactic the list does not know, at the end of the chain", () => {
    // the dataset gains one and the technique must not vanish
    const nodes = [tech("new", "quantum-tampering"), tech("recon", "reconnaissance")];
    expect(reading(arrange("tactic", nodes, []))).toEqual(["recon", "new"]);
  });

  it("gathers what cannot be placed on the chain, after it", () => {
    const nodes = [node("host", "domain-name"), tech("recon", "reconnaissance")];
    expect(reading(arrange("tactic", nodes, []))).toEqual(["recon", "host"]);
  });

  it("an investigation without a single technique still arranges", () => {
    const nodes = [node("a", "url"), node("b", "malware")];
    expect(arrange("tactic", nodes, []).map((p) => p.x)).toEqual([0, 254]);
  });
});
