/**
 * Bundled ATT&CK dataset: integrity of the distilled JSON, search by
 * name/alias/ID, and mapping onto canvas entities (MITRE properties
 * prefilled, consistent with the deterministic ID recipes).
 */

import { describe, expect, it } from "vitest";

import dataset from "../public/attack-dataset.json";
import { entryToCreation, searchAttack } from "./attack";
import type { AttackEntry } from "./attack";
import { attackPatternId } from "./stix/ids";

const ENTRIES = dataset.entries as AttackEntry[];

describe("dataset distillé", () => {
  it("est peuplé et bien formé", () => {
    expect(ENTRIES.length).toBeGreaterThan(1500);
    for (const e of ENTRIES) {
      expect(["attack-pattern", "intrusion-set", "malware", "tool"]).toContain(e.type);
      expect(e.id).toMatch(/^[TGS]\d{4}(\.\d{3})?$/);
      expect(e.name.length).toBeGreaterThan(0);
    }
  });

  it("contient les classiques", () => {
    expect(ENTRIES.find((e) => e.id === "T1566")?.name).toBe("Phishing");
    const apt28 = ENTRIES.find((e) => e.id === "G0007");
    expect(apt28?.name).toBe("APT28");
    expect(apt28?.aliases).toContain("Fancy Bear");
  });
});

describe("recherche", () => {
  it("par nom, insensible à la casse", () => {
    expect(searchAttack(ENTRIES, "apt28")[0].id).toBe("G0007");
  });

  it("par alias", () => {
    expect(searchAttack(ENTRIES, "fancy bear")[0].id).toBe("G0007");
  });

  it("par ID de technique, sous-techniques comprises", () => {
    const ids = searchAttack(ENTRIES, "T1566").map((e) => e.id);
    expect(ids[0]).toBe("T1566");
    expect(ids).toContain("T1566.001");
  });

  it("moins de 2 caractères : rien", () => {
    expect(searchAttack(ENTRIES, "t")).toEqual([]);
  });
});

describe("mapping vers entités", () => {
  it("technique → attack-pattern avec x_mitre_id (ID déterministe stable)", () => {
    const t1566 = ENTRIES.find((e) => e.id === "T1566")!;
    const c = entryToCreation(t1566);
    expect(c.stix_type).toBe("attack-pattern");
    expect(c.properties.x_mitre_id).toBe("T1566");
    // same recipe as the pycti golden vector
    expect(attackPatternId({ x_mitre_id: "T1566" })).toBe(
      attackPatternId({ name: "peu importe", x_mitre_id: " t1566 " }),
    );
  });

  it("groupe → intrusion-set avec alias et référence MITRE", () => {
    const apt28 = ENTRIES.find((e) => e.id === "G0007")!;
    const c = entryToCreation(apt28);
    expect(c.stix_type).toBe("intrusion-set");
    expect(c.properties.aliases).toContain("Fancy Bear");
    expect(c.properties.external_references).toEqual([
      {
        source_name: "mitre-attack",
        external_id: "G0007",
        url: "https://attack.mitre.org/groups/G0007",
      },
    ]);
  });

  it("malware → is_family, sous-technique → URL avec slash", () => {
    const malware = ENTRIES.find((e) => e.type === "malware")!;
    expect(entryToCreation(malware).properties.is_family).toBe(true);
    const sub = ENTRIES.find((e) => e.id === "T1566.001")!;
    expect(entryToCreation(sub).properties.x_mitre_id).toBe("T1566.001");
  });
});
