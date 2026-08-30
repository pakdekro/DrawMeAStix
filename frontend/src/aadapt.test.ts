/**
 * MITRE AADAPT beside the other three.
 *
 * The hybrid: its tactics ARE ATT&CK's, ten of eleven, the way F3's are, while
 * its techniques are all its own, the way ATLAS's are. So this file checks the
 * two halves separately, and one thing neither of the others needed: that a
 * framework publishing no version is carried as publishing none, rather than
 * as publishing the version of the framework it was forked from.
 */

import { describe, expect, it } from "vitest";

import aadaptFile from "../public/aadapt-dataset.json";
import attackFile from "../public/attack-dataset.json";
import { entryToCreation, searchAttack } from "./attack";
import type { AttackEntry } from "./attack";
import type { AadaptDataset } from "./aadapt";
import { extractFromText } from "./extract";
import { mitreIdWarning } from "./ioc";
import { buildBundle } from "./stix/bundle";
import { importBundle } from "./stix/importer";
import type { ExportOptions, InvestigationState } from "./stix/types";

const AADAPT = aadaptFile as unknown as AadaptDataset;
const ENTRIES = AADAPT.entries;
const ATTACK = (attackFile as { entries: AttackEntry[] }).entries;

const OPTS: ExportOptions = {
  container: "grouping",
  tlp: "none",
  author_name: null,
  author_class: "organization",
  include_notes: false,
  confidence: null,
};

function stateWith(entry: AttackEntry): InvestigationState {
  const creation = entryToCreation(entry);
  return {
    investigation: {
      id: "i1",
      name: "AADAPT",
      description: "",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    entities: [
      {
        id: "e1",
        investigation_id: "i1",
        stix_type: creation.stix_type,
        name: creation.name,
        properties: JSON.stringify(creation.properties),
        status: "confirmed",
        source: "manual",
        position_x: 0,
        position_y: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    relationships: [],
    notes: [],
  } as unknown as InvestigationState;
}

describe("the distilled dataset", () => {
  it("is populated and well formed", () => {
    expect(ENTRIES).toHaveLength(68);
    expect(AADAPT.tactics).toHaveLength(11);
    for (const e of ENTRIES) {
      expect(e.type).toBe("attack-pattern");
      expect(e.id).toMatch(/^ADT\d{4}(\.\d{3})?$/);
      expect(e.framework).toBe("mitre-aadapt");
      expect(e.name.length).toBeGreaterThan(0);
    }
    expect(new Set(ENTRIES.map((e) => e.id)).size).toBe(ENTRIES.length);
  });

  it("publishes no version, and none is invented for it", () => {
    // The file carries `version: 4.4.0`, which is the ATLAS data version its
    // tooling was forked from. Shipping it would put a wrong number in the
    // panel and, worse, make a real release look like an old one.
    expect(aadaptFile).not.toHaveProperty("aadapt_version");
    expect(JSON.stringify(aadaptFile)).not.toContain("4.4.0");
  });

  it("takes ten tactics from ATT&CK and keeps one of its own", () => {
    const own = AADAPT.tactics.filter((t) => t.framework === "mitre-aadapt");
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ id: "ADTA0001", name: "Fraud" });
    for (const t of AADAPT.tactics) {
      if (t.framework === "mitre-attack") expect(t.id).toMatch(/^TA\d{4}$/);
    }
  });

  it("borrows no technique identifier, and says what it adapts", () => {
    const attackIds = new Set(ATTACK.filter((e) => e.id).map((e) => e.id!));
    for (const e of ENTRIES) expect(attackIds.has(e.id!)).toBe(false);
    const adapting = ENTRIES.filter((e) => e.attack !== undefined);
    expect(adapting).toHaveLength(4);
    // and what it points at is an ATT&CK number we actually ship
    for (const e of adapting) expect(attackIds.has(e.attack!)).toBe(true);
  });
});

describe("the palette and the prose", () => {
  it("finds a technique by number and by name", () => {
    expect(searchAttack(ENTRIES, "ADT3003").map((e) => e.id)).toContain("ADT3003");
    expect(searchAttack(ENTRIES, "wallet").length).toBeGreaterThan(0);
  });

  it("accepts an AADAPT number in the MITRE ID field", () => {
    expect(mitreIdWarning("ADT3003")).toBeNull();
    expect(mitreIdWarning("ADT3003.001")).toBeNull();
    expect(mitreIdWarning("ADTA0001")).toBeNull();
    expect(mitreIdWarning("ADX3003")).not.toBeNull();
  });

  it("is extracted from prose by number, never by name", () => {
    const found = extractFromText("Reported as ADT3003 by the exchange.", [], ENTRIES);
    expect(found.map((c) => c.name)).toEqual(["Chain Reorganization"]);
    expect(extractFromText("They mentioned a supply chain compromise.", [], ENTRIES)).toEqual(
      [],
    );
    expect(extractFromText("See ADT9999 for details.", [], ENTRIES)).toEqual([]);
  });
});

describe("the bundle", () => {
  it("claims AADAPT and nothing else, url included", async () => {
    const entry = ENTRIES.find((e) => e.id === "ADT1195")!;
    // the one adapted from T1195: the reference stays AADAPT's
    expect(entry.attack).toBe("T1195");
    const { bundle } = await buildBundle(stateWith(entry), OPTS);
    const obj = bundle.objects.find((o) => o.type === "attack-pattern")!;
    expect(obj.external_references).toEqual([
      {
        source_name: "mitre-aadapt",
        external_id: "ADT1195",
        url: "https://aadapt.mitre.org/techniques/ADT1195",
      },
    ]);
  });

  it("reads its own reference back on import", async () => {
    const entry = ENTRIES.find((e) => e.id === "ADT3003")!;
    const { bundle } = await buildBundle(stateWith(entry), OPTS);
    const { state } = importBundle(bundle as never);
    const props = JSON.parse(state.entities[0].properties) as Record<string, unknown>;
    expect(props.x_mitre_id).toBe("ADT3003");
    expect(props.mitre_framework).toBe("mitre-aadapt");
  });
});
