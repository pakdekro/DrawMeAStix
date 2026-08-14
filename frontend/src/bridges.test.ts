/**
 * Canonical bridges (#37): recipes offered per type pair, in both drag
 * directions, and - crucially - every relationship of every recipe must be
 * legal according to the STIX matrix.
 */

import { describe, expect, it } from "vitest";

import { findBridges } from "./bridges";
import type { BridgeEndpoint } from "./bridges";
import { allowedRelationships, SCO_TYPES, SDO_TYPES } from "./stix/relationships";

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

  // A hand-written list of pairs stops covering the types added after it. This
  // sweeps the matrix instead, so a new observable either works or breaks a
  // test on the day it is declared.
  describe("couverture exhaustive des observables", () => {
    const SAMPLE: Record<string, string> = {
      "ipv4-addr": "203.0.113.5",
      "ipv6-addr": "2001:db8::1",
      "domain-name": "evil.example",
      url: "https://evil.example/p",
      "email-addr": "a@evil.example",
      file: "dropper.dll",
      "autonomous-system": "AS64496",
      "mac-addr": "00:1a:2b:3c:4d:5e",
      mutex: "Global\\Zeus",
      directory: "C:\\Windows\\Temp",
      software: "Apache HTTP Server",
      "user-account": "jdoe",
      "x509-certificate": "36:f7:d4:2e:1a",
    };

    it("chaque observable a une valeur d'exemple ici", () => {
      // Guards the sweep below: a type absent from SAMPLE would be tested with
      // `undefined` and pass by accident.
      expect([...SCO_TYPES].filter((t) => SAMPLE[t] === undefined)).toEqual([]);
    });

    it("tout observable obtient un pont indicateur, et ce pont a un pattern", () => {
      // An indicator with no pattern is refused at export: a bridge that
      // produced one would offer a dead end in one click.
      for (const sco of SCO_TYPES) {
        const match = findBridges(APT, e(sco, SAMPLE[sco]));
        expect(match, `${sco} : aucun pont`).not.toBeNull();
        const indicator = match!.recipes.find((r) => r.key === "indicator");
        expect(indicator, `${sco} : pas de pont indicateur`).toBeDefined();
        expect(
          indicator!.bridgeProperties(match!.sco).pattern,
          `${sco} : indicateur sans pattern`,
        ).toBeTruthy();
      }
    });

    it("toute recette de tout couple SDO × SCO reste légale", () => {
      for (const sdo of SDO_TYPES) {
        for (const sco of SCO_TYPES) {
          const match = findBridges(e(sdo, "X"), e(sco, SAMPLE[sco]));
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
      }
    });

    it("un certificat ou un compte passe par consists-of, pas par communicates-with", () => {
      // These are what an infrastructure is MADE OF; `communicates-with` is
      // reserved for network endpoints, and the spec agrees.
      const match = findBridges(APT, e("x509-certificate", "36:f7:d4:2e:1a"))!;
      const part = match.recipes.find((r) => r.key === "infrastructure-part")!;
      expect(part.legs.map((l) => l.rel)).toEqual(["uses", "consists-of"]);
      expect(match.recipes.map((r) => r.key)).not.toContain("infrastructure");
    });

    it("un mutex ou un répertoire n'obtient que le pont indicateur", () => {
      // Malware artefacts on a victim host, not infrastructure - and STIX 2.1
      // offers no relationship from a malware to either. Inventing one is what
      // the bridges exist to avoid.
      for (const type of ["mutex", "directory"]) {
        const match = findBridges(APT, e(type, SAMPLE[type]))!;
        expect(match.recipes.map((r) => r.key), type).toEqual(["indicator"]);
      }
    });
  });

  it("le pont indicateur arrive avec son pattern généré", () => {
    const match = findBridges(APT, FILE)!;
    const indicator = match.recipes.find((r) => r.key === "indicator")!;
    expect(indicator.bridgeProperties(match.sco).pattern).toBe(
      "[file:hashes.'SHA-256' = 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f']",
    );
  });
});
