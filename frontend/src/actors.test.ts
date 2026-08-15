/**
 * The actor aliases distilled from the MISP galaxy.
 *
 * The interesting property is not that the file has entries: it is that it
 * CONTRADICTS NOTHING. Our identifiers derive from the name, so an actor
 * offered under two canonical names is a duplicate we manufacture ourselves.
 * The arbitration happens in `backend/scripts/build_actors_dataset.py`; what
 * is checked here is the shipped result, because that is what analysts type
 * against, and because ATT&CK adopting a name later would silently break the
 * property on the next regeneration.
 */

import { describe, expect, it } from "vitest";

import { entryToCreation, searchAttack } from "./attack";
import type { AttackEntry } from "./attack";
import actorsFile from "../public/actors-dataset.json";
import attackFile from "../public/attack-dataset.json";

const ACTORS = (actorsFile as { entries: AttackEntry[] }).entries;
const ATTACK = (attackFile as { entries: AttackEntry[] }).entries;

/** Case, spaces and punctuation carry no meaning when comparing two names. */
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const RESOLVED_BY_ATTACK = new Set(
  ATTACK.filter((e) => e.type === "intrusion-set").flatMap((e) => [
    key(e.name),
    ...(e.aliases ?? []).map(key),
  ]),
);

describe("the arbitration holds in the shipped file", () => {
  it("no name or alias is one ATT&CK already resolves", () => {
    const offenders = ACTORS.filter((actor) =>
      [actor.name, ...(actor.aliases ?? [])].some((n) => RESOLVED_BY_ATTACK.has(key(n))),
    ).map((a) => a.name);
    expect(offenders).toEqual([]);
  });

  it("no name is claimed twice, inside the file or across its aliases", () => {
    const claims = new Map<string, string[]>();
    for (const actor of ACTORS) {
      for (const name of [actor.name, ...(actor.aliases ?? [])]) {
        claims.set(key(name), [...(claims.get(key(name)) ?? []), actor.name]);
      }
    }
    expect([...claims].filter(([, owners]) => owners.length > 1)).toEqual([]);
  });

  it("every entry names somebody, and names them cleanly", () => {
    expect(ACTORS.length).toBeGreaterThan(500);
    for (const actor of ACTORS) {
      expect(actor.type).toBe("intrusion-set");
      expect(actor.name.trim()).toBe(actor.name);
      expect(actor.name.startsWith("[")).toBe(false);
      // no MITRE number: that is what tells the interface not to claim one
      expect(actor.id).toBeUndefined();
    }
  });
});

describe("an entry without an ATT&CK number", () => {
  const actor: AttackEntry = {
    type: "intrusion-set",
    name: "Storm-2603",
    aliases: ["CL-CRI-1040"],
  };

  it("creates a plain intrusion-set, with no fabricated MITRE reference", () => {
    const creation = entryToCreation(actor);
    expect(creation.stix_type).toBe("intrusion-set");
    expect(creation.name).toBe("Storm-2603");
    expect(creation.properties.aliases).toEqual(["CL-CRI-1040"]);
    expect(creation.properties.external_references).toBeUndefined();
    expect(creation.properties.x_mitre_id).toBeUndefined();
  });

  it("is still reachable by name and by alias", () => {
    const corpus = [actor, ...ATTACK.filter((e) => e.type === "intrusion-set")];
    expect(searchAttack(corpus, "Storm-2603")[0].name).toBe("Storm-2603");
    expect(searchAttack(corpus, "CL-CRI-1040")[0].name).toBe("Storm-2603");
  });

  it("does not outrank an ATT&CK entry that matches exactly", () => {
    // "APT29" is ATT&CK's; a nameless-numbered entry must never displace it
    const corpus = [actor, ...ATTACK.filter((e) => e.type === "intrusion-set")];
    expect(searchAttack(corpus, "APT29")[0].id).toBe("G0016");
  });
});
