import { describe, expect, it } from "vitest";
import {
  ALL_TYPES,
  byVerb,
  canLink,
  incoming,
  observableSourcesTowardSdo,
  outgoing,
  patternExamples,
} from "./guide";
import { patternFromObservable } from "./pattern";
import { relationHelp } from "./relationHelp";
import { SCO_ORDER, SDO_ORDER } from "./stixMeta";

describe("guide dérivé de la matrice", () => {
  it("un observable n'est jamais source d'une relation vers un objet", () => {
    // The page's central rule: it is CHECKED against the matrix, not asserted
    // in a paragraph. If the matrix ever changes, this test falls over before
    // the help page turns into a lie.
    expect(observableSourcesTowardSdo()).toEqual([]);
  });

  it("chaque verbe affiché porte son explication", () => {
    // A bare "Threat Actor uses Malware" line leaves the reader exactly where
    // they started: that is the gap the help exists to fill.
    const verbs = new Set(ALL_TYPES.flatMap((t) => outgoing(t)).map((l) => l.rel));
    expect(verbs.size).toBeGreaterThan(0);
    for (const rel of verbs) {
      expect(relationHelp(rel), `verbe sans explication : ${rel}`).toBeDefined();
    }
  });

  it("related-to est écarté de l'explorateur", () => {
    // Legal between every pair of objects, it would drown the verbs that inform.
    const all = ALL_TYPES.flatMap((t) => [...outgoing(t), ...incoming(t)]);
    expect(all.some((l) => l.rel === "related-to")).toBe(false);
  });

  it("sortantes et entrantes décrivent la même matrice", () => {
    const asSource = new Set(
      ALL_TYPES.flatMap((t) => outgoing(t)).map((l) => `${l.from}|${l.rel}|${l.to}`),
    );
    const asTarget = new Set(
      ALL_TYPES.flatMap((t) => incoming(t)).map((l) => `${l.from}|${l.rel}|${l.to}`),
    );
    expect([...asSource].sort()).toEqual([...asTarget].sort());
  });

  it("un type sans relation sortante reste consultable", () => {
    // location, vulnerability: targets only. The page has to hold up without
    // crashing or showing a misleading empty section.
    expect(outgoing("location")).toEqual([]);
    expect(incoming("location").length).toBeGreaterThan(0);
  });
});

describe("exemples de patterns", () => {
  it("chaque exemple produit bien un pattern", () => {
    // If the generator stopped covering a type, the example would quietly
    // vanish from the page instead of failing here.
    expect(patternExamples()).toHaveLength(3);
  });

  it("les patterns sortent du générateur, pas d'une recopie", () => {
    const byType = new Map(patternExamples().map((e) => [e.observableType, e]));
    for (const [type, ex] of byType) {
      expect(ex.pattern).toBe(patternFromObservable(type, ex.value, ex.pattern.includes("hashes")
        ? { hashes: { "SHA-256": /'([0-9a-f]{64})'/.exec(ex.pattern)![1] } }
        : {}));
    }
  });

  it("les valeurs d'exemple ne ressemblent pas à de vrais IOC", () => {
    // Ranges reserved for documentation: nobody must be able to mistake the
    // help page for real intelligence.
    const values = patternExamples().map((e) => e.value);
    expect(values.some((v) => v.endsWith(".example"))).toBe(true);
    expect(values).toContain("203.0.113.42"); // RFC 5737, TEST-NET-3
  });

  it("l'indicateur relie bien les deux familles", () => {
    // The whole reason the section exists: the indicator is the only object
    // that reaches back down to the observables.
    const verbs = byVerb(outgoing("indicator"), "to");
    const basedOn = verbs.find((v) => v.rel === "based-on");
    expect(basedOn?.types.every((t) => SCO_ORDER.includes(t))).toBe(true);
    const indicates = verbs.find((v) => v.rel === "indicates");
    expect(indicates?.types.every((t) => SDO_ORDER.includes(t))).toBe(true);
  });
});

describe("byVerb", () => {
  it("collecte l'extrémité demandée", () => {
    const groups = byVerb(outgoing("threat-actor"), "to");
    const uses = groups.find((g) => g.rel === "uses");
    expect(uses?.types).toContain("malware");
    expect(uses?.types).toContain("tool");
  });

  it("ne se trompe pas sur une relation d'un type vers lui-même", () => {
    // `malware variant-of malware`: both ends are the same type, and picking
    // the endpoint by comparison used to return nonsense here.
    const groups = byVerb(outgoing("malware"), "to");
    expect(groups.find((g) => g.rel === "variant-of")?.types).toEqual(["malware"]);
  });
});

describe("canLink", () => {
  it("répond direct quand la matrice le permet", () => {
    const v = canLink("threat-actor", "malware");
    expect(v.kind).toBe("direct");
    if (v.kind === "direct") {
      expect(v.relations.map((r) => r.rel)).toContain("uses");
      expect(v.relations[0].help).toBeDefined();
    }
  });

  it("propose le sens inverse plutôt qu'un pont", () => {
    // Four IPs toward an infrastructure: illegal in that direction, but
    // `infrastructure consists-of ipv4-addr` exists. A direct relationship
    // pointing the right way always beats an intermediate object.
    const v = canLink("ipv4-addr", "infrastructure");
    expect(v.kind).toBe("reversed");
    if (v.kind === "reversed") {
      expect(v.relations.map((r) => r.rel)).toContain("consists-of");
      expect(v.relations[0].from).toBe("infrastructure");
    }
  });

  it("bascule sur les ponts canoniques quand aucun sens ne marche", () => {
    const v = canLink("threat-actor", "ipv4-addr");
    expect(v.kind).toBe("bridge");
    if (v.kind === "bridge") {
      expect(v.recipes.length).toBeGreaterThan(0);
    }
  });

  it("déplie la chaîne avec les types réellement choisis", () => {
    // The complaint that started this: "uses → infrastructure →
    // communicates-with" says neither where you start nor where you land.
    const v = canLink("threat-actor", "ipv4-addr");
    if (v.kind !== "bridge") throw new Error("attendu : pont");
    const infra = v.recipes.find((r) => r.nodes[1] === "infrastructure");
    expect(infra?.nodes).toEqual(["threat-actor", "infrastructure", "ipv4-addr"]);
    expect(infra?.steps).toEqual([
      { rel: "uses", back: false },
      { rel: "communicates-with", back: false },
    ]);
  });

  it("garde le sens réel des relations de la recette indicateur", () => {
    // Trap: the indicator is the source of BOTH its relationships.
    // `indicates` runs up toward the object. A chain forced to read left to
    // right would display "threat-actor indicates indicator", which does not exist.
    const v = canLink("threat-actor", "ipv4-addr");
    if (v.kind !== "bridge") throw new Error("attendu : pont");
    const ind = v.recipes.find((r) => r.nodes[1] === "indicator");
    expect(ind?.steps).toEqual([
      { rel: "indicates", back: true },
      { rel: "based-on", back: false },
    ]);
  });

  it("chaque recette déplie exactement deux étapes", () => {
    // A step lost by the reconstruction would leave a mute gap between two
    // nodes, with nothing anywhere to signal it.
    for (const a of ALL_TYPES) {
      for (const b of ALL_TYPES) {
        const v = canLink(a, b);
        if (v.kind !== "bridge") continue;
        for (const r of v.recipes) {
          expect(r.nodes).toHaveLength(3);
          expect(r.steps, `${a} → ${b} : ${r.label}`).toHaveLength(2);
        }
      }
    }
  });

  it("la chaîne se lit de l'objet vers l'observable, quel que soit l'ordre choisi", () => {
    const forward = canLink("threat-actor", "ipv4-addr");
    const backward = canLink("ipv4-addr", "threat-actor");
    expect(backward).toEqual(forward);
  });

  it("signale related-to comme dernier recours entre objets", () => {
    const v = canLink("location", "vulnerability");
    expect(v.kind).toBe("generic");
  });

  it("dit non quand c'est non", () => {
    // Two observables with no planned link: no verb, no bridge. The help must
    // be able to say "these do not link" rather than invent a path.
    expect(canLink("email-addr", "file").kind).toBe("none");
  });

  it("couvre tous les couples sans lever d'exception", () => {
    for (const a of ALL_TYPES) {
      for (const b of ALL_TYPES) {
        expect(() => canLink(a, b)).not.toThrow();
      }
    }
  });

  it("les observables entre eux n'ont que quelques liens", () => {
    const linkable = SCO_ORDER.flatMap((a) =>
      SCO_ORDER.filter((b) => canLink(a, b).kind === "direct").map((b) => `${a}->${b}`),
    );
    expect(linkable).toContain("domain-name->ipv4-addr");
    expect(linkable).toContain("ipv4-addr->autonomous-system");
  });

  it("l'univers du guide couvre la matrice", () => {
    expect(ALL_TYPES).toEqual([...SDO_ORDER, ...SCO_ORDER]);
    expect(new Set(ALL_TYPES).size).toBe(ALL_TYPES.length);
  });
});
