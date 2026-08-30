/**
 * Embedded AADAPT dataset: lazy load of the distilled JSON
 * (public/aadapt-dataset.json, built by backend/scripts/build_aadapt_dataset.py),
 * for the digital asset half of the framework palette.
 *
 * MITRE AADAPT is adversary behaviour against digital asset payment systems,
 * and it is where a fraud case that cashes out in crypto continues: F3 ends at
 * Monetization, AADAPT's own tactic is called Fraud.
 *
 * A hybrid of the two frameworks beside it: its tactics ARE ATT&CK's, ten of
 * eleven, by identifier, while its techniques are all its own. It publishes no
 * version, hence none here, see the build script.
 */

import type { AttackEntry } from "./attack";

export interface AadaptTactic {
  /** TA0043 for the ten that are ATT&CK's, ADTA0001 for the one that is not */
  id: string;
  shortname: string;
  name: string;
  framework: "mitre-attack" | "mitre-aadapt";
}

export interface AadaptDataset {
  tactics: AadaptTactic[];
  entries: AttackEntry[];
}

let cache: Promise<AadaptDataset> | null = null;

export function loadAadaptDataset(): Promise<AadaptDataset> {
  cache ??= fetch("/aadapt-dataset.json").then((r) => {
    if (!r.ok) {
      cache = null;
      throw new Error(`AADAPT dataset unavailable (${r.status})`);
    }
    return r.json() as Promise<AadaptDataset>;
  });
  return cache;
}
