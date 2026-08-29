/**
 * Embedded F3 dataset: lazy load of the distilled JSON
 * (public/f3-dataset.json, built by backend/scripts/build_f3_dataset.py),
 * for the fraud half of the framework palette.
 *
 * F3 is MITRE's Fight Financial Fraud matrix, and it is deliberately built on
 * ATT&CK's spine: six of its eight tactics ARE ATT&CK tactics, ids included,
 * and 43 of its 123 techniques are ATT&CK techniques reused by number. The
 * build resolves that provenance once, so an entry read here already knows
 * which framework it belongs to and nothing downstream has to guess from the
 * shape of an identifier.
 *
 * Kept in a file of its own rather than folded into the ATT&CK dataset, for
 * the same reason the actor aliases are: a merged corpus would make the
 * lookup of a shared identifier depend on the order of the map, and the
 * palette that says ATT&CK on screen must keep showing ATT&CK.
 */

import type { AttackEntry } from "./attack";

export interface F3Tactic {
  /** TA0001, FA0002… ATT&CK's own id when the tactic is ATT&CK's. */
  id: string;
  /** `initial-access`, `monetization`… the form used in `AttackEntry.tactics`. */
  shortname: string;
  name: string;
  framework: "mitre-attack" | "mitre-f3";
}

export interface F3Dataset {
  f3_version: string;
  /** In matrix order, which is the order of the fraud lifecycle, not alphabetical. */
  tactics: F3Tactic[];
  entries: AttackEntry[];
}

let cache: Promise<F3Dataset> | null = null;

export function loadF3Dataset(): Promise<F3Dataset> {
  cache ??= fetch("/f3-dataset.json").then((r) => {
    if (!r.ok) {
      cache = null;
      throw new Error(`F3 dataset unavailable (${r.status})`);
    }
    return r.json() as Promise<F3Dataset>;
  });
  return cache;
}

/** Techniques of one tactic, by short name, in identifier order. */
export function techniquesOfTactic(entries: AttackEntry[], shortname: string): AttackEntry[] {
  return entries.filter((e) => e.tactics?.includes(shortname));
}
