/**
 * MITRE ATLAS beside ATT&CK and F3.
 *
 * The framework that borrows nothing: every identifier is an `AML.*` of its
 * own, so none of the arbitration F3 needs applies here. What has to hold
 * instead is that nothing of ATLAS ever claims to be ATT&CK, in either
 * direction: 37 of its techniques adapt an ATT&CK one and 36 carry a name
 * ATT&CK also uses, and neither may leak into an identifier or a reference.
 */

import { describe, expect, it } from "vitest";

import atlasFile from "../public/atlas-dataset.json";
import attackFile from "../public/attack-dataset.json";
import { entryToCreation, searchAttack } from "./attack";
import type { AttackEntry } from "./attack";
import type { AtlasDataset } from "./atlas";
import { extractFromText } from "./extract";
import { mitreIdWarning } from "./ioc";
import { buildBundle } from "./stix/bundle";
import { attackPatternId } from "./stix/ids";
import { importBundle } from "./stix/importer";
import type { EntityRow, ExportOptions, InvestigationState } from "./stix/types";

const ATLAS = atlasFile as unknown as AtlasDataset;
const ENTRIES = ATLAS.entries;
const ATTACK = (attackFile as { entries: AttackEntry[] }).entries;

const OPTS: ExportOptions = {
  container: "grouping",
  tlp: "none",
  author_name: null,
  author_class: "organization",
  include_notes: false,
  confidence: null,
};

function stateWith(entities: EntityRow[]): InvestigationState {
  return {
    investigation: {
      id: "i1",
      name: "ATLAS",
      description: "",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    entities,
    relationships: [],
    notes: [],
  } as unknown as InvestigationState;
}

function technique(entry: AttackEntry): EntityRow {
  const creation = entryToCreation(entry);
  return {
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
  } as EntityRow;
}

describe("the distilled dataset", () => {
  it("is populated and well formed", () => {
    expect(ENTRIES).toHaveLength(178);
    expect(ATLAS.tactics).toHaveLength(16);
    for (const e of ENTRIES) {
      expect(e.type).toBe("attack-pattern");
      expect(e.id).toMatch(/^AML\.T\d{4}(\.\d{3})?$/);
      expect(e.framework).toBe("mitre-atlas");
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.tactics?.length).toBeGreaterThan(0);
    }
    expect(new Set(ENTRIES.map((e) => e.id)).size).toBe(ENTRIES.length);
  });

  it("names every tactic its techniques point at", () => {
    const known = new Set(ATLAS.tactics.map((t) => t.shortname));
    for (const e of ENTRIES) {
      for (const phase of e.tactics ?? []) expect(known).toContain(phase);
    }
    // and the matrix keeps its own order rather than an alphabetical one
    expect(ATLAS.tactics[0].id).toBe("AML.TA0002");
    expect(ATLAS.tactics.at(-1)!.id).toBe("AML.TA0011");
  });

  /**
   * The property this file exists for. F3 needed an arbitration because it
   * reuses ATT&CK numbers; ATLAS needs the opposite check, that it never does.
   */
  it("borrows no ATT&CK identifier, in either direction", () => {
    const attackIds = new Set(ATTACK.filter((e) => e.id).map((e) => e.id!));
    for (const e of ENTRIES) {
      expect(e.id!.startsWith("AML.")).toBe(true);
      expect(attackIds.has(e.id!)).toBe(false);
    }
    // an ATLAS technique may ADAPT an ATT&CK one, which is a reference and not
    // an identity: the number it adapts is ATT&CK's and stays ATT&CK's
    const adapting = ENTRIES.filter((e) => e.attack !== undefined);
    expect(adapting).toHaveLength(37);
    for (const e of adapting) expect(e.attack).toMatch(/^T\d{4}(\.\d{3})?$/);
  });

  /**
   * Thirty-six names exist in both catalogues. That is not a collision to
   * arbitrate, unlike F3's: two catalogue entries with two numbers are two
   * objects, and the identifiers keep them apart.
   */
  it("shares names with ATT&CK without sharing objects", () => {
    const attackNames = new Set(
      ATTACK.filter((e) => e.type === "attack-pattern").map((e) => e.name),
    );
    const shared = ENTRIES.filter((e) => attackNames.has(e.name));
    expect(shared.length).toBe(36);
    const twin = ATTACK.find((e) => e.type === "attack-pattern" && e.name === shared[0].name)!;
    expect(attackPatternId({ x_mitre_id: shared[0].id! })).not.toBe(
      attackPatternId({ x_mitre_id: twin.id! }),
    );
  });
});

describe("the palette and the prose", () => {
  it("finds a technique by its number and by its name", () => {
    expect(searchAttack(ENTRIES, "AML.T0051").map((e) => e.id)).toContain("AML.T0051");
    expect(searchAttack(ENTRIES, "prompt injection").length).toBeGreaterThan(0);
  });

  it("accepts an ATLAS number in the MITRE ID field", () => {
    expect(mitreIdWarning("AML.T0051")).toBeNull();
    expect(mitreIdWarning("AML.T0051.000")).toBeNull();
    expect(mitreIdWarning("AML.TA0000")).toBeNull();
    expect(mitreIdWarning("AML.X0051")).not.toBeNull();
  });

  it("is extracted from prose by number, never by name", () => {
    const found = extractFromText("Mapped to AML.T0051 in the report.", [], ENTRIES);
    expect(found.map((c) => c.name)).toEqual(["LLM Prompt Injection"]);
    // "Phishing" and "Valid Accounts" are ATLAS technique names too, and a
    // sentence containing one asserts nothing
    expect(extractFromText("They discussed phishing at length.", [], ENTRIES)).toEqual([]);
    // a number ATLAS does not publish creates no phantom technique
    expect(extractFromText("See AML.T9999 for details.", [], ENTRIES)).toEqual([]);
  });
});

describe("the bundle", () => {
  it("claims ATLAS and nothing else, url included", async () => {
    const entry = ENTRIES.find((e) => e.id === "AML.T0000")!;
    // the one that ADAPTS T1596: the reference must still be ATLAS alone
    expect(entry.attack).toBe("T1596");
    const { bundle } = await buildBundle(stateWith([technique(entry)]), OPTS);
    const obj = bundle.objects.find((o) => o.type === "attack-pattern")!;
    expect(obj.external_references).toEqual([
      {
        source_name: "mitre-atlas",
        external_id: "AML.T0000",
        url: "https://atlas.mitre.org/techniques/AML.T0000",
      },
    ]);
    expect(obj.id).toBe(attackPatternId({ x_mitre_id: "AML.T0000" }));
  });

  it("reads its own reference back on import", () => {
    const entry = ENTRIES.find((e) => e.id === "AML.T0051")!;
    return buildBundle(stateWith([technique(entry)]), OPTS).then(({ bundle }) => {
      const { state } = importBundle(bundle as never);
      const props = JSON.parse(state.entities[0].properties) as Record<string, unknown>;
      expect(props.x_mitre_id).toBe("AML.T0051");
      expect(props.mitre_framework).toBe("mitre-atlas");
    });
  });
});
