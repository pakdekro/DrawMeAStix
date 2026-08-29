/**
 * MITRE F3 (Fight Financial Fraud) alongside ATT&CK.
 *
 * The framework brings no new verb: its bundle carries `subtechnique-of` and
 * nothing else, which describes the catalogue and never reaches a canvas. What
 * it does bring is an identifier space that OVERLAPS ATT&CK's on purpose - 43
 * of its 123 techniques are ATT&CK techniques reused by number, and its own 80
 * start with an F. Everything checked here follows from that single fact.
 */

import { describe, expect, it } from "vitest";

import attackFile from "../public/attack-dataset.json";
import f3File from "../public/f3-dataset.json";
import { entryToCreation, searchAttack } from "./attack";
import type { AttackEntry } from "./attack";
import { toProperties } from "./entityFields";
import { extractFromText } from "./extract";
import type { F3Dataset } from "./f3";
import { mitreIdWarning } from "./ioc";
import golden from "./stix/golden-bundle.json";
import { buildBundle } from "./stix/bundle";
import { attackPatternId } from "./stix/ids";
import { importBundle } from "./stix/importer";
import type { EntityRow, ExportOptions, InvestigationState } from "./stix/types";

const F3 = f3File as unknown as F3Dataset;
const ENTRIES = F3.entries;
const ATTACK = (attackFile as { entries: AttackEntry[] }).entries;
const ATTACK_NAMES = new Map(
  ATTACK.filter((e) => e.type === "attack-pattern" && e.id).map((e) => [e.id!, e.name]),
);

describe("dataset distillé", () => {
  it("est peuplé et bien formé", () => {
    expect(ENTRIES.length).toBe(123);
    expect(F3.tactics).toHaveLength(8);
    for (const e of ENTRIES) {
      expect(e.type).toBe("attack-pattern");
      expect(e.id).toMatch(/^[TF]\d{4}(\.\d{3})?$/);
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.tactics?.length).toBeGreaterThan(0);
    }
    expect(new Set(ENTRIES.map((e) => e.id)).size).toBe(ENTRIES.length);
  });

  // The letter and the framework agree, which is what lets every other layer
  // read one of the two and be right about the other.
  it("la lettre de l'identifiant et le framework ne se contredisent jamais", () => {
    for (const e of ENTRIES) {
      expect(e.framework).toBe(e.id!.startsWith("F") ? "mitre-f3" : "mitre-attack");
    }
    const borrowed = ENTRIES.filter((e) => e.framework === "mitre-attack");
    expect(borrowed).toHaveLength(43);
    expect(ENTRIES.length - borrowed.length).toBe(80);
  });

  /**
   * The property this file exists for.
   *
   * F3 names its sub-techniques by full path ("Brute Force: Password
   * Guessing") where ATT&CK names the leaf ("Password Guessing"). Both
   * spellings carry the SAME MITRE number, so both would derive the same
   * deterministic id: two cards on the canvas, one object in the bundle, and
   * a merge warning at export. The build takes the ATT&CK name back, and this
   * is what would catch it silently drifting on a future regeneration.
   */
  it("une technique partagée porte le nom d'ATT&CK, pas celui de F3", () => {
    const drifted = ENTRIES.filter(
      (e) => ATTACK_NAMES.has(e.id!) && ATTACK_NAMES.get(e.id!) !== e.name,
    ).map((e) => `${e.id!}: "${e.name}" vs "${ATTACK_NAMES.get(e.id!)!}"`);
    expect(drifted).toEqual([]);
  });

  it("les tactiques citées par une technique sont déclarées", () => {
    const declared = new Set(F3.tactics.map((t) => t.shortname));
    for (const e of ENTRIES) {
      for (const t of e.tactics ?? []) expect(declared).toContain(t);
    }
  });

  // Six of the eight tactics ARE ATT&CK's, ids included. Only the two ends of
  // the fraud lifecycle are F3's own.
  it("seules deux tactiques sont propres à la fraude", () => {
    const own = F3.tactics.filter((t) => t.framework === "mitre-f3").map((t) => t.name);
    expect(own).toEqual(["Positioning", "Monetization"]);
  });

  it("se cherche par numéro et par nom", () => {
    expect(searchAttack(ENTRIES, "F1001")[0].name).toBe("3DS Bypass");
    expect(searchAttack(ENTRIES, "3ds bypass")[0].id).toBe("F1001");
  });
});

describe("entrée → entité du canva", () => {
  it("une technique de fraude dit à quel framework son numéro appartient", () => {
    const f1001 = ENTRIES.find((e) => e.id === "F1001")!;
    const created = entryToCreation(f1001);
    expect(created.stix_type).toBe("attack-pattern");
    expect(created.properties.x_mitre_id).toBe("F1001");
    expect(created.properties.mitre_framework).toBe("mitre-f3");
  });

  // Absent means ATT&CK, so a technique F3 shares with ATT&CK comes out of the
  // F3 palette indistinguishable from the same one picked in the ATT&CK
  // palette. That is the point, not an oversight.
  it("une technique partagée sort en technique ATT&CK ordinaire", () => {
    const shared = ENTRIES.find((e) => e.id === "T1110.003")!;
    const created = entryToCreation(shared);
    expect(created.properties.x_mitre_id).toBe("T1110.003");
    expect(created.properties.mitre_framework).toBeUndefined();
    expect(created.properties).toEqual(
      entryToCreation(ATTACK.find((e) => e.id === "T1110.003")!).properties,
    );
  });
});

describe("identifiants déterministes", () => {
  /**
   * The bridge, asserted rather than hoped for: a technique reached through
   * F3 and the same one reached through ATT&CK are ONE object in the bundle.
   * A fraud case and an intrusion case that both go through account takeover
   * meet there, and nowhere else.
   */
  it("une technique partagée est le même objet des deux côtés", () => {
    const viaF3 = entryToCreation(ENTRIES.find((e) => e.id === "T1110.003")!);
    const viaAttack = entryToCreation(ATTACK.find((e) => e.id === "T1110.003")!);
    expect(attackPatternId({ name: viaF3.name, x_mitre_id: "T1110.003" })).toBe(
      attackPatternId({ name: viaAttack.name, x_mitre_id: "T1110.003" }),
    );
  });

  it("un numéro F3 ne peut heurter aucun numéro ATT&CK", () => {
    expect(attackPatternId({ name: "x", x_mitre_id: "F1001" })).not.toBe(
      attackPatternId({ name: "x", x_mitre_id: "T1001" }),
    );
  });
});

/* -- export ---------------------------------------------------------------- */

const OPTS = golden.exports[0].opts as unknown as ExportOptions;
const BASE = (golden.state as unknown as InvestigationState).entities.find(
  (e) => e.stix_type === "attack-pattern",
)!;

function stateWith(entities: EntityRow[]): InvestigationState {
  const state = golden.state as unknown as InvestigationState;
  return { ...state, entities, relationships: [], notes: [] };
}

function technique(id: string, name: string, props: Record<string, unknown>): EntityRow {
  return { ...BASE, id, name, properties: JSON.stringify(props) };
}

describe("export : ce que la référence AFFIRME", () => {
  it("une technique F3 ne se réclame pas d'ATT&CK", async () => {
    const state = stateWith([
      technique("f1", "Change of Payment Details", {
        x_mitre_id: "F1005.006",
        mitre_framework: "mitre-f3",
      }),
    ]);
    const { bundle } = await buildBundle(state, OPTS);
    const obj = bundle.objects.find((o) => o.type === "attack-pattern")!;
    expect(obj.external_references).toEqual([
      {
        source_name: "mitre-f3",
        external_id: "F1005.006",
        url: "https://ctid.mitre.org/fraud/techniques/F1005.006",
      },
    ]);
    // internal property, consumed to build the reference above: it must not
    // also travel as a custom field
    expect(obj.mitre_framework).toBeUndefined();
  });

  it("une technique ATT&CK sort inchangée, url comprise", async () => {
    const state = stateWith([technique("a1", "Phishing", { x_mitre_id: "T1566" })]);
    const { bundle } = await buildBundle(state, OPTS);
    const obj = bundle.objects.find((o) => o.type === "attack-pattern")!;
    // no url on the ATT&CK side: an ATT&CK number resolves itself, and adding
    // one would change every bundle exported before F3 existed
    expect(obj.external_references).toEqual([
      { source_name: "mitre-attack", external_id: "T1566" },
    ]);
  });

  it("le framework suit la propriété, jamais la lettre du numéro", async () => {
    // T1453 IS an ATT&CK number, and F3 publishes it as one of its own. What
    // the analyst recorded wins over what the identifier looks like.
    const state = stateWith([
      technique("t1", "Abuse Accessibility Features", {
        x_mitre_id: "T1453",
        mitre_framework: "mitre-f3",
      }),
    ]);
    const { bundle } = await buildBundle(state, OPTS);
    const obj = bundle.objects.find((o) => o.type === "attack-pattern")!;
    expect((obj.external_references as { source_name: string }[])[0].source_name).toBe(
      "mitre-f3",
    );
  });
});

/* -- import ---------------------------------------------------------------- */

const bundleOf = (refs: Record<string, string>[]) => ({
  type: "bundle",
  id: "bundle--0f0c4b3a-0000-4000-8000-000000000000",
  objects: [
    {
      type: "attack-pattern",
      spec_version: "2.1",
      id: "attack-pattern--ccecdfd4-795e-5ce8-920f-b80d455d6abb",
      name: "3DS Bypass",
      external_references: refs,
    },
  ],
});

describe("import : la provenance se relit", () => {
  it("une référence mitre-f3 donne le numéro ET le framework", () => {
    const { state } = importBundle(
      bundleOf([
        {
          source_name: "mitre-f3",
          external_id: "F1001",
          url: "https://ctid.mitre.org/fraud/techniques/F1001",
        },
      ]) as never,
    );
    const props = JSON.parse(state.entities[0].properties) as Record<string, unknown>;
    expect(props.x_mitre_id).toBe("F1001");
    expect(props.mitre_framework).toBe("mitre-f3");
  });

  // A technique F3 borrowed can carry both references. The ATT&CK number is
  // the one the rest of the world deduplicates on, so it wins.
  it("les deux références présentes : ATT&CK l'emporte", () => {
    const { state } = importBundle(
      bundleOf([
        { source_name: "mitre-f3", external_id: "T1453" },
        { source_name: "mitre-attack", external_id: "T1453" },
      ]) as never,
    );
    const props = JSON.parse(state.entities[0].properties) as Record<string, unknown>;
    expect(props.x_mitre_id).toBe("T1453");
    expect(props.mitre_framework).toBeUndefined();
  });

  it("un aller-retour export → import conserve le framework", async () => {
    const state = stateWith([
      technique("f1", "3DS Bypass", { x_mitre_id: "F1001", mitre_framework: "mitre-f3" }),
    ]);
    const { bundle } = await buildBundle(state, OPTS);
    const { state: back } = importBundle(bundle as never);
    const technique_ = back.entities.find((e) => e.stix_type === "attack-pattern")!;
    const props = JSON.parse(technique_.properties) as Record<string, unknown>;
    expect(props.x_mitre_id).toBe("F1001");
    expect(props.mitre_framework).toBe("mitre-f3");
  });
});

/* -- prose ----------------------------------------------------------------- */

describe("extraction depuis un texte", () => {
  it("un numéro F3 cité se résout", () => {
    const found = extractFromText("The actor used F1001 to clear the challenge.", [], ENTRIES);
    expect(found.map((c) => c.name)).toContain("3DS Bypass");
    expect(found[0].properties.mitre_framework).toBe("mitre-f3");
  });

  it("un numéro F3 inventé ne crée rien", () => {
    expect(extractFromText("Then F9999 happened.", [], ENTRIES)).toEqual([]);
  });

  /**
   * The names never enter the matching. F3 names fraud techniques in plain
   * English, and "Bank Deposit" or "Phishing" in a sentence must not assert a
   * technique the analyst never claimed.
   */
  it("les noms de F3 ne sont jamais cherchés dans la prose", () => {
    expect(extractFromText("He made a bank deposit on Tuesday.", [], ENTRIES)).toEqual([]);
  });

  // T1110.003 sits in BOTH corpora. It has to resolve through ATT&CK, which
  // is the only reason the two dictionaries are kept apart.
  it("un numéro partagé passe par ATT&CK, pas par F3", () => {
    const found = extractFromText("Reported as T1110.003.", ATTACK, ENTRIES);
    const hit = found.find((c) => c.properties.x_mitre_id === "T1110.003")!;
    expect(hit.name).toBe("Password Spraying");
    expect(hit.properties.mitre_framework).toBeUndefined();
  });
});

/* -- form ------------------------------------------------------------------ */

describe("saisie à la main", () => {
  it("un numéro F3 est un format attendu", () => {
    expect(mitreIdWarning("F1001")).toBeNull();
    expect(mitreIdWarning("F1005.006")).toBeNull();
    expect(mitreIdWarning("FA0002")).toBeNull();
    expect(mitreIdWarning("T1566.001")).toBeNull();
    expect(mitreIdWarning("bank fraud")).not.toBeNull();
  });

  // ATT&CK is the default and a default has one representation: choosing it
  // explicitly must leave the same properties as never touching the field.
  it("choisir ATT&CK explicitement ne stocke rien", () => {
    expect(
      toProperties("attack-pattern", { x_mitre_id: "T1566", mitre_framework: "mitre-attack" }),
    ).toEqual({ x_mitre_id: "T1566" });
    expect(
      toProperties("attack-pattern", { x_mitre_id: "F1001", mitre_framework: "mitre-f3" }),
    ).toEqual({ x_mitre_id: "F1001", mitre_framework: "mitre-f3" });
  });
});
