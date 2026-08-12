/**
 * Canonical bridges (#37): recipes offered per type pair, in both drag
 * directions, and - crucially - every relationship of every recipe must be
 * legal according to the STIX matrix.
 */

import { describe, expect, it } from "vitest";

import { findBridges } from "./bridges";
import type { BridgeEndpoint } from "./bridges";
import { allowedRelationships } from "./stix/relationships";

const e = (stix_type: string, name: string, properties = {}): BridgeEndpoint => ({
  stix_type,
  name,
  properties,
});

const APT = e("threat-actor", "APT28");
const IP = e("ipv4-addr", "203.0.113.5");
const FILE = e("file", "dropper.dll", {
  hashes: { "SHA-256": "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f" },
});

describe("recettes par paire", () => {
  it("threat-actor × ipv4 : infrastructure puis indicateur", () => {
    const match = findBridges(APT, IP)!;
    expect(match.recipes.map((r) => r.key)).toEqual(["infrastructure", "indicator"]);
    expect(match.recipes[0].defaultName(match.sdo, match.sco)).toBe("C2 - 203.0.113.5");
  });

  it("normalise le sens du drag (ipv4 → threat-actor)", () => {
    const match = findBridges(IP, APT)!;
    expect(match.sdo.stix_type).toBe("threat-actor");
    expect(match.sco.stix_type).toBe("ipv4-addr");
    expect(match.recipes.map((r) => r.key)).toEqual(["infrastructure", "indicator"]);
  });

  it("threat-actor × file : malware puis indicateur", () => {
    const match = findBridges(APT, FILE)!;
    expect(match.recipes.map((r) => r.key)).toEqual(["malware", "indicator"]);
  });

  it("identity × ipv4 : rien (ni opérateur, ni indicable)", () => {
    expect(findBridges(e("identity", "ACME"), IP)).toBeNull();
  });

  it("SDO × SDO et SCO × SCO : hors périmètre", () => {
    expect(findBridges(APT, e("malware", "X-Agent"))).toBeNull();
    expect(findBridges(IP, e("url", "https://x.example"))).toBeNull();
  });
});

describe("légalité des recettes", () => {
  it("chaque relation de chaque recette est permise par la matrice", () => {
    const pairs: [BridgeEndpoint, BridgeEndpoint][] = [
      [APT, IP],
      [APT, FILE],
      [e("campaign", "Op X"), e("domain-name", "evil.example")],
      [e("intrusion-set", "APT28"), e("url", "https://evil.example")],
      [e("malware", "X-Agent"), e("email-addr", "a@b.example")],
    ];
    for (const [a, b] of pairs) {
      const match = findBridges(a, b);
      if (match === null) continue;
      for (const recipe of match.recipes) {
        const typeOf = (role: string) =>
          role === "bridge"
            ? recipe.bridgeType
            : role === "sdo"
              ? match.sdo.stix_type
              : match.sco.stix_type;
        for (const leg of recipe.legs) {
          expect(
            allowedRelationships(typeOf(leg.from), typeOf(leg.to)),
            `${recipe.key} : ${typeOf(leg.from)} -[${leg.rel}]-> ${typeOf(leg.to)}`,
          ).toContain(leg.rel);
        }
      }
    }
  });

  it("le pont indicateur arrive avec son pattern généré", () => {
    const match = findBridges(APT, FILE)!;
    const indicator = match.recipes.find((r) => r.key === "indicator")!;
    expect(indicator.bridgeProperties(match.sco).pattern).toBe(
      "[file:hashes.'SHA-256' = 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f']",
    );
  });
});
