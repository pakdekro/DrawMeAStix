/**
 * Embedded ATLAS dataset: lazy load of the distilled JSON
 * (public/atlas-dataset.json, built by backend/scripts/build_atlas_dataset.py),
 * for the AI half of the framework palette.
 *
 * MITRE ATLAS is adversary behaviour against AI systems, and it is built on
 * ATT&CK's shape without borrowing its identifiers: fourteen of its sixteen
 * tactics mirror an ATT&CK tactic and every one of them is an `AML.TA####` of
 * its own, so nothing here can collide with anything already on a canvas.
 * That is the whole difference with F3, and it is why this file has no
 * arbitration in it.
 */

import type { AttackEntry } from "./attack";

export interface AtlasTactic {
  /** AML.TA0002, AML.TA0000… ATLAS numbers its own, always. */
  id: string;
  /** `reconnaissance`, `ai-model-access`… the form used in `AttackEntry.tactics`. */
  shortname: string;
  name: string;
  framework: "mitre-atlas";
  /** the ATT&CK tactic it mirrors, for the fourteen that mirror one */
  attack?: string;
}

export interface AtlasDataset {
  atlas_version: string;
  /**
   * In matrix order, which ATLAS publishes as a relationship rather than as a
   * list: the matrix `sequences` its tactics. Read by the framework page,
   * which is where a matrix belongs.
   */
  tactics: AtlasTactic[];
  entries: AttackEntry[];
}

let cache: Promise<AtlasDataset> | null = null;

export function loadAtlasDataset(): Promise<AtlasDataset> {
  cache ??= fetch("/atlas-dataset.json").then((r) => {
    if (!r.ok) {
      cache = null;
      throw new Error(`ATLAS dataset unavailable (${r.status})`);
    }
    return r.json() as Promise<AtlasDataset>;
  });
  return cache;
}
