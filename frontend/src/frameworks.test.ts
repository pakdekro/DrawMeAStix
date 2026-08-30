/**
 * The four corpora together.
 *
 * Each framework has a file of its own checking what is particular about it.
 * This one checks what only exists once they coexist, which is where the real
 * hazard lives: four catalogues, one identifier space in the application, and
 * one recipe deriving an object's identity from a number alone.
 *
 * Written as an audit after the fourth went in, and kept: every property here
 * held on the day, and each of them would fail silently.
 */

import { describe, expect, it } from "vitest";
import attackFile from "../public/attack-dataset.json";
import f3File from "../public/f3-dataset.json";
import atlasFile from "../public/atlas-dataset.json";
import aadaptFile from "../public/aadapt-dataset.json";
import { entryToCreation } from "./attack";
import type { AttackEntry } from "./attack";
import { FRAMEWORKS, DEFAULT_FRAMEWORK } from "./frameworks";
import { mitreIdWarning } from "./ioc";
import { buildBundle } from "./stix/bundle";
import { validateObjects } from "./stix/validate";
import { importBundle } from "./stix/importer";
import type { ExportOptions, InvestigationState } from "./stix/types";

const CORPORA: Record<string, AttackEntry[]> = {
  "mitre-attack": (attackFile as { entries: AttackEntry[] }).entries,
  "mitre-f3": (f3File as { entries: AttackEntry[] }).entries,
  "mitre-atlas": (atlasFile as { entries: AttackEntry[] }).entries,
  "mitre-aadapt": (aadaptFile as { entries: AttackEntry[] }).entries,
};
const OPTS: ExportOptions = { container: "grouping", tlp: "none", author_name: null,
  author_class: "organization", include_notes: false, confidence: null };
const state = (entries: AttackEntry[]): InvestigationState => ({
  investigation: { id: "i", name: "audit", description: "", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
  entities: entries.map((e, i) => {
    const c = entryToCreation(e);
    return { id: `e${i}`, investigation_id: "i", stix_type: c.stix_type, name: c.name,
      properties: JSON.stringify(c.properties), status: "confirmed", source: "manual",
      position_x: i, position_y: 0, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" };
  }),
  relationships: [], notes: [],
} as unknown as InvestigationState);

describe("the four corpora together", () => {
  it("every framework value is one the registry knows", () => {
    const known = new Set(FRAMEWORKS.map((f) => f.id));
    const bad: string[] = [];
    for (const entries of Object.values(CORPORA))
      for (const e of entries) if (e.framework && !known.has(e.framework)) bad.push(`${e.id}:${e.framework}`);
    expect(bad).toEqual([]);
  });

  it("gives one identifier one framework and one name, across all four", () => {
    const seen = new Map<string, { fw: string; name: string; from: string }>();
    const clashes: string[] = [];
    for (const [file, entries] of Object.entries(CORPORA))
      for (const e of entries) {
        if (!e.id) continue;
        const fw = e.framework ?? DEFAULT_FRAMEWORK.id;
        const key = `${e.type}|${e.id}`;
        const prev = seen.get(key);
        if (!prev) seen.set(key, { fw, name: e.name, from: file });
        else if (prev.fw !== fw || prev.name !== e.name)
          clashes.push(`${key}: ${prev.from} says ${prev.fw}/${prev.name}, ${file} says ${fw}/${e.name}`);
      }
    expect(clashes).toEqual([]);
  });

  it("accepts, in the form, every number the palettes can produce", () => {
    const refused: string[] = [];
    for (const entries of Object.values(CORPORA))
      for (const e of entries)
        if (e.type === "attack-pattern" && e.id && mitreIdWarning(e.id) !== null) refused.push(e.id);
    expect(refused).toEqual([]);
  });

  it("exports for every technique the reference its framework claims", async () => {
    for (const [fw, entries] of Object.entries(CORPORA)) {
      const sample = entries.filter((e) => e.type === "attack-pattern").slice(0, 40);
      const { bundle } = await buildBundle(state(sample), OPTS);
      const techniques = bundle.objects.filter((o) => o.type === "attack-pattern");
      expect(techniques).toHaveLength(sample.length);
      for (const obj of techniques) {
        const refs = obj.external_references as { source_name: string; external_id: string }[];
        expect(refs).toHaveLength(1);
        const entry = sample.find((e) => e.id === refs[0].external_id)!;
        expect(refs[0].source_name, `${fw} ${refs[0].external_id}`).toBe(entry.framework ?? DEFAULT_FRAMEWORK.id);
      }
    }
  });

  it("exports objects that validate against the OASIS schemas", async () => {
    for (const entries of Object.values(CORPORA)) {
      const sample = entries.filter((e) => e.type === "attack-pattern").slice(0, 25);
      const { bundle } = await buildBundle(state(sample), OPTS);
      const problems = await validateObjects(bundle.objects as never);
      expect(problems).toEqual([]);
    }
  });

  it("survives export, import and export again with the same identifiers", async () => {
    for (const entries of Object.values(CORPORA)) {
      const sample = entries.filter((e) => e.type === "attack-pattern").slice(0, 25);
      const first = await buildBundle(state(sample), OPTS);
      const { state: back } = importBundle(first.bundle as never);
      const second = await buildBundle(back, OPTS);
      const ids = (b: typeof first.bundle) => b.objects.filter((o) => o.type === "attack-pattern").map((o) => o.id).sort();
      expect(ids(second.bundle)).toEqual(ids(first.bundle));
    }
  });
});
