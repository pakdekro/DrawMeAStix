/**
 * One corpus per framework, behind one function.
 *
 * The palettes used to hold a state and a loader per framework, which is the
 * shape that stops scaling at three: the switch, the search, the Ctrl+K group
 * and the page link all had to learn each new name. They now speak in
 * framework identifiers, and this map is the only place that knows which file
 * answers for which.
 */

import { loadAttackDataset } from "./attack";
import type { AttackEntry } from "./attack";
import { loadAtlasDataset } from "./atlas";
import { loadF3Dataset } from "./f3";
import { DEFAULT_FRAMEWORK } from "./frameworks";

export interface FrameworkCorpus {
  /** the framework's own version string, shown beside its name */
  version: string;
  entries: AttackEntry[];
}

const LOADERS: Record<string, () => Promise<FrameworkCorpus>> = {
  "mitre-attack": () =>
    loadAttackDataset().then((d) => ({ version: d.attack_version, entries: d.entries })),
  "mitre-f3": () =>
    loadF3Dataset().then((d) => ({ version: d.f3_version, entries: d.entries })),
  "mitre-atlas": () =>
    loadAtlasDataset().then((d) => ({ version: d.atlas_version, entries: d.entries })),
};

/** The corpus of a framework, ATT&CK's when the identifier is not one we know. */
export function loadFramework(id: string): Promise<FrameworkCorpus> {
  return (LOADERS[id] ?? LOADERS[DEFAULT_FRAMEWORK.id])();
}
