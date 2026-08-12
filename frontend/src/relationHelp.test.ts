/**
 * Every verb the matrix can offer must have its explanation: otherwise the
 * analyst is left facing a silent choice (#164).
 */

import { describe, expect, it } from "vitest";

import { KNOWN_RELATIONS, relationHelp } from "./relationHelp";
import { allowedRelationships } from "./stix/relationships";

const TYPES = [
  "intrusion-set", "threat-actor", "campaign", "malware", "tool", "attack-pattern",
  "indicator", "vulnerability", "identity", "location", "infrastructure",
  "ipv4-addr", "ipv6-addr", "domain-name", "url", "email-addr", "file",
  "autonomous-system",
];

describe("explications des relations", () => {
  it("tout verbe atteignable dans la matrice est expliqué", () => {
    const reachable = new Set<string>();
    for (const a of TYPES) {
      for (const b of TYPES) {
        for (const rel of allowedRelationships(a, b)) reachable.add(rel);
      }
    }
    expect(reachable.size).toBeGreaterThan(20);
    const missing = [...reachable].filter((rel) => relationHelp(rel) === undefined);
    expect(missing, "verbes sans explication").toEqual([]);
  });

  it("les deux verbes qu'on confond sont distingués explicitement", () => {
    // the reported case: infrastructure → domain, consists-of or communicates-with?
    expect(relationHelp("consists-of")).toMatch(/component/i);
    expect(relationHelp("communicates-with")).toMatch(/without the target being part of it/i);
  });

  it("aucune explication morte : chaque entrée sert dans la matrice", () => {
    const reachable = new Set<string>();
    for (const a of TYPES) {
      for (const b of TYPES) {
        for (const rel of allowedRelationships(a, b)) reachable.add(rel);
      }
    }
    const unused = KNOWN_RELATIONS.filter((rel) => !reachable.has(rel));
    expect(unused, "explications sans usage").toEqual([]);
  });
});
