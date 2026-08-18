/**
 * Per-type tally behind the status bar's object counter.
 */

import { describe, expect, it } from "vitest";

import { SCO_ORDER, SDO_ORDER, countByType } from "./stixMeta";

const of = (...types: string[]) => types.map((stix_type) => ({ stix_type }));

describe("countByType", () => {
  it("counts each type and drops the empty ones", () => {
    const out = countByType(of("malware", "ipv4-addr", "malware", "domain-name"));
    expect(out.map((t) => [t.stix_type, t.count])).toEqual([
      ["malware", 2],
      ["ipv4-addr", 1],
      ["domain-name", 1],
    ]);
    expect(out.every((t) => t.count > 0)).toBe(true);
  });

  it("follows the palette order, not the count", () => {
    // one intrusion set against nine files: sorted by count the rare object
    // would lead, and the list would reshuffle on every addition
    const out = countByType(of(...Array(9).fill("file"), "intrusion-set"));
    expect(out.map((t) => t.stix_type)).toEqual(["intrusion-set", "file"]);
  });

  it("puts every observable after every object", () => {
    const out = countByType(of("url", "campaign", "file", "tool"));
    const kinds = out.map((t) => t.kind);
    expect(kinds).toEqual([...kinds].sort().reverse()); // sdo before sco
    expect(kinds).toEqual(["sdo", "sdo", "sco", "sco"]);
  });

  it("carries the label and the colour the canvas uses", () => {
    const [malware] = countByType(of("malware"));
    expect(malware.label).toBe("Malware");
    expect(malware.color).toBe("#957fb8");
  });

  // An imported bundle can hold a type the palette does not offer. Counted in
  // the total and nowhere else, it would make the breakdown quietly disagree
  // with the number right above it.
  it("keeps a type the palette does not know, at the end", () => {
    const out = countByType(of("process", "malware", "artifact"));
    expect(out.map((t) => t.stix_type)).toEqual(["malware", "artifact", "process"]);
  });

  it("the tally always adds up to the total shown", () => {
    const entities = of("malware", "process", "file", "malware", "url", "windows-registry-key");
    const total = countByType(entities).reduce((n, t) => n + t.count, 0);
    expect(total).toBe(entities.length);
  });

  it("an empty investigation yields nothing to show", () => {
    expect(countByType([])).toEqual([]);
  });

  it("the two orders never claim the same type", () => {
    expect(SDO_ORDER.filter((t) => SCO_ORDER.includes(t))).toEqual([]);
  });
});
