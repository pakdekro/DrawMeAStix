/**
 * Triage tray (#12): a third-party bundle (without our layout extension)
 * lands as candidates; a bundle produced by the tool stays confirmed.
 */

import { describe, expect, it } from "vitest";

import golden from "./golden-bundle.json";
import { importBundle } from "./importer";

const FOREIGN_BUNDLE = {
  type: "bundle",
  id: "bundle--11111111-1111-4111-8111-111111111111",
  objects: [
    {
      type: "ipv4-addr",
      spec_version: "2.1",
      id: "ipv4-addr--826fe3cb-56b0-5620-9d30-4c17ed7b24e3",
      value: "203.0.113.5",
    },
    {
      type: "malware",
      spec_version: "2.1",
      id: "malware--1fa27f3c-beda-59f1-b476-f8ad99cbdeff",
      created: "2026-07-20T09:10:00.000Z",
      modified: "2026-07-20T09:10:00.000Z",
      name: "X-Agent",
      is_family: true,
    },
  ],
};

describe("bac de triage à l'import", () => {
  it("bundle tiers : tout arrive en candidat, avec avertissement", () => {
    const { state, report } = importBundle(FOREIGN_BUNDLE as never);
    expect(state.entities).toHaveLength(2);
    expect(state.entities.every((e) => e.status === "candidate")).toBe(true);
    expect(report.warnings.join("\n")).toContain("triage tray");
  });

  it("bundle de l'outil : tout reste confirmé, aucun avertissement de triage", () => {
    const { state, report } = importBundle(golden.exports[0].bundle as never);
    expect(state.entities.length).toBeGreaterThan(0);
    expect(state.entities.every((e) => e.status === "confirmed")).toBe(true);
    expect(report.warnings.join("\n")).not.toContain("triage tray");
  });

  it("provenance : les entités confirmées via extension sont marquées imported (audit - option B)", () => {
    const { state } = importBundle(golden.exports[0].bundle as never);
    expect(state.entities.every((e) => e.status === "confirmed" && e.imported)).toBe(true);
    // a third-party bundle (candidates) is not marked imported: triage vets them
    const { state: foreign } = importBundle(FOREIGN_BUNDLE as never);
    expect(foreign.entities.every((e) => !e.imported)).toBe(true);
  });
});

describe("refang à l'import (audit - bug 4)", () => {
  it("un observable défangé est stocké sous forme canonique", () => {
    const defanged = {
      type: "bundle",
      id: "bundle--22222222-2222-4222-8222-222222222222",
      objects: [
        {
          type: "domain-name",
          id: "domain-name--22222222-2222-4222-8222-222222222223",
          value: "evil[.]com",
        },
        {
          type: "url",
          id: "url--22222222-2222-4222-8222-222222222224",
          value: "hxxps://evil[.]com/payload",
        },
      ],
    };
    const { state } = importBundle(defanged as never);
    const names = state.entities.map((e) => e.name);
    expect(names).toContain("evil.com");
    expect(names).toContain("https://evil.com/payload");
  });
});
