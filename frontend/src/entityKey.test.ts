import { describe, expect, it } from "vitest";
import { entityKey } from "./entityKey";
import { SCO_TYPES, SDO_TYPES } from "./stix/relationships";

describe("clé métier d'une entité", () => {
  it("ignore la casse", () => {
    expect(entityKey({ stix_type: "domain-name", name: "Nest.Corax.Example" })).toBe(
      entityKey({ stix_type: "domain-name", name: "nest.corax.example" }),
    );
  });

  it("ignore les espaces de bordure", () => {
    // The divergence that motivated the extraction: the lint applied `trim()`,
    // the canvas deduplication did not. Two entities differing only by a
    // trailing space were a duplicate for one, two objects for the other.
    expect(entityKey({ stix_type: "malware", name: "  EggShell " })).toBe(
      entityKey({ stix_type: "malware", name: "EggShell" }),
    );
  });

  it("sépare deux types portant le même nom", () => {
    // "Corax" can be both an intrusion-set and a campaign: those are two
    // objects, and merging them would erase a distinction meant to be there.
    expect(entityKey({ stix_type: "intrusion-set", name: "Corax" })).not.toBe(
      entityKey({ stix_type: "campaign", name: "Corax" }),
    );
  });

  it("le séparateur n'est levé d'ambiguïté que par le vocabulaire des types", () => {
    // `malware` + `a|b` and `malware|a` + `b` give the SAME key. That is not
    // a guarantee on offer, it is a collision the data keeps out of reach:
    // `stix_type` comes from a closed vocabulary where no type contains a
    // vertical bar. Written down here so that nobody credits this key with a
    // robustness it does not have.
    expect(entityKey({ stix_type: "malware", name: "a|b" })).toBe(
      entityKey({ stix_type: "malware|a", name: "b" }),
    );
    for (const type of [...SDO_TYPES, ...SCO_TYPES]) {
      expect(type).not.toContain("|");
    }
  });
});
