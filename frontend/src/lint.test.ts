/** Investigation lint (#33): deterministic rules, none of them blocking. */

import { describe, expect, it } from "vitest";

import { lintInvestigation } from "./lint";
import golden from "./stix/golden-bundle.json";
import type { EntityRow, InvestigationState, RelationshipRow } from "./stix/types";

const GOLDEN_STATE = golden.state as unknown as InvestigationState;

function state(
  entities: Partial<EntityRow>[],
  relationships: Partial<RelationshipRow>[] = [],
): InvestigationState {
  return {
    investigation: {
      id: "inv",
      name: "Test",
      description: "",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    entities: entities.map((e, i) => ({
      id: `e${i}`,
      investigation_id: "inv",
      stix_type: "malware",
      name: `x${i}`,
      properties: "{}",
      status: "confirmed",
      source: "manual",
      position_x: 0,
      position_y: 0,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      ...e,
    })) as EntityRow[],
    relationships: relationships.map((r, i) => ({
      id: `r${i}`,
      investigation_id: "inv",
      source_id: "e0",
      target_id: "e1",
      rel_type: "related-to",
      description: "",
      start_time: null,
      stop_time: null,
      created_at: "2026-01-01T00:00:00.000Z",
      ...r,
    })) as RelationshipRow[],
    notes: [],
  };
}

describe("règles unitaires", () => {
  it("entités importées confirmées sans triage : warn de provenance", () => {
    const findings = lintInvestigation(
      state([
        { stix_type: "malware", name: "Importé", imported: true },
        { stix_type: "malware", name: "Saisi à la main" },
      ]),
    );
    const msg = findings.find((f) => f.message.includes("check their provenance"));
    expect(msg?.level).toBe("warn");
    expect(msg?.message).toContain("1 imported entity");
  });

  it("indicateur sans pattern : warn (export bloqué)", () => {
    const findings = lintInvestigation(
      state([{ stix_type: "indicator", name: "Vide", properties: "{}" }]),
    );
    expect(findings.some((f) => f.level === "warn" && f.message.includes("missing pattern"))).toBe(
      true,
    );
  });

  it("file sans hash : warn", () => {
    const findings = lintInvestigation(
      state([{ stix_type: "file", name: "dropper.exe", properties: '{"file_name":"dropper.exe"}' }]),
    );
    expect(findings.some((f) => f.message.includes("no hash"))).toBe(true);
  });

  it("doublon même type + même nom (casse ignorée)", () => {
    const findings = lintInvestigation(
      state([
        { stix_type: "threat-actor", name: "APT28" },
        { stix_type: "threat-actor", name: "apt28 " },
      ]),
    );
    expect(findings.some((f) => f.message.includes("likely duplicate"))).toBe(true);
  });

  it("observable relié mais non couvert par un indicateur : info", () => {
    const findings = lintInvestigation(
      state(
        [
          { stix_type: "malware", name: "X" },
          { stix_type: "ipv4-addr", name: "203.0.113.5" },
        ],
        [{ source_id: "e0", target_id: "e1", rel_type: "communicates-with" }],
      ),
    );
    expect(findings.some((f) => f.message.includes("no indicator"))).toBe(true);
  });

  it("les warns arrivent avant les infos", () => {
    const findings = lintInvestigation(
      state([
        { stix_type: "indicator", name: "Vide", properties: "{}" },
        { stix_type: "identity", name: "Seule", properties: '{"identity_class":"organization"}' },
      ]),
    );
    expect(findings[0].level).toBe("warn");
  });
});

describe("sur la fixture golden", () => {
  it("repère le candidat en triage et la relation qui sera ignorée", () => {
    const findings = lintInvestigation(GOLDEN_STATE);
    expect(findings.some((f) => f.message.includes("triage tray"))).toBe(true);
    expect(findings.some((f) => f.message.includes("will be skipped"))).toBe(true);
    // a based-on covers the ipv4, so nothing is said about it
    expect(
      findings.some((f) => f.message.includes("203.0.113.5") && f.message.includes("no indicator")),
    ).toBe(false);
  });
});

describe("location incomplète (#218)", () => {
  it("signale une location sans pays, région ni coordonnées", () => {
    const messages = lintInvestigation(
      state([{ stix_type: "location", name: "Brive-la-Gaillarde", properties: "{}" }]),
    ).map((f) => f.message);
    expect(messages.some((m) => m.includes("no country, region or coordinates"))).toBe(true);
  });

  it("ne dit rien d'une location située", () => {
    for (const props of [
      { country: "FR" },
      { region: "western-europe" },
      { latitude: 48.85, longitude: 2.35 },
    ]) {
      const messages = lintInvestigation(
        state([{ stix_type: "location", name: "X", properties: JSON.stringify(props) }]),
      ).map((f) => f.message);
      expect(messages.some((m) => m.includes("no country, region"))).toBe(false);
    }
  });

  it("une ville seule ne suffit pas", () => {
    // `city` narrows the place down, it does not locate it per the spec.
    const messages = lintInvestigation(
      state([{ stix_type: "location", name: "Lyon", properties: JSON.stringify({ city: "Lyon" }) }]),
    ).map((f) => f.message);
    expect(messages.some((m) => m.includes("no country, region or coordinates"))).toBe(true);
  });
});

describe("fenêtres temporelles incohérentes (#170)", () => {
  const DEUX = [{ stix_type: "threat-actor" }, { stix_type: "malware" }];

  it("signale une fin d'activité antérieure au début, sur une relation", () => {
    const messages = lintInvestigation(
      state(DEUX, [{ start_time: "2026-05-01", stop_time: "2026-03-01" }]),
    ).map((f) => f.message);
    expect(messages.some((m) => m.includes("activity end before its start"))).toBe(true);
  });

  it("signale last_seen antérieur à first_seen sur une entité", () => {
    const messages = lintInvestigation(
      state([
        {
          stix_type: "threat-actor",
          name: "APT28",
          properties: JSON.stringify({ first_seen: "2026-05-01", last_seen: "2026-03-01" }),
        },
      ]),
    ).map((f) => f.message);
    expect(messages.some((m) => m.includes("last_seen earlier than first_seen"))).toBe(true);
  });

  it("signale un valid_until seul, antérieur à la date de création", () => {
    // The check used to demand BOTH dates typed in. But the builder falls back
    // on the creation date when `valid_from` is empty: the exported window came
    // out reversed, the object invalid, and nothing said so.
    const messages = lintInvestigation(
      state([
        {
          stix_type: "indicator",
          name: "vieil indicateur",
          created_at: "2026-06-01T00:00:00.000Z",
          properties: JSON.stringify({ pattern: "[x]", valid_until: "2020-01-01" }),
        },
      ]),
    ).map((f) => f.message);
    expect(messages.some((m) => m.includes("valid_until earlier than valid_from"))).toBe(true);
    // and the message says where the date it compares against comes from
    expect(messages.some((m) => m.includes("creation date"))).toBe(true);
  });

  it("ne dit rien d'un valid_until postérieur à la création", () => {
    const messages = lintInvestigation(
      state([
        {
          stix_type: "indicator",
          created_at: "2026-01-01T00:00:00.000Z",
          properties: JSON.stringify({ pattern: "[x]", valid_until: "2027-01-01" }),
        },
      ]),
    ).map((f) => f.message);
    expect(messages.some((m) => m.includes("valid_until"))).toBe(false);
  });

  it("ne dit rien d'une fenêtre cohérente, ni d'une fenêtre incomplète", () => {
    const messages = lintInvestigation(
      state(
        [
          {
            stix_type: "threat-actor",
            properties: JSON.stringify({ first_seen: "2026-03-01" }), // no end
          },
          { stix_type: "malware" },
        ],
        [{ start_time: "2026-03-01", stop_time: "2026-05-01" }],
      ),
    ).map((f) => f.message);
    expect(messages.some((m) => m.includes("earlier than"))).toBe(false);
  });
});
