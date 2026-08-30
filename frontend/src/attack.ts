/**
 * Embedded ATT&CK dataset (#10): lazy load of the distilled JSON
 * (public/attack-dataset.json, built by backend/scripts/build_attack_dataset.py),
 * search by name/alias/ID, and conversion of an entry into a canvas entity
 * with the MITRE properties pre-filled.
 */

import { DEFAULT_FRAMEWORK } from "./frameworks";

export interface AttackEntry {
  type: "attack-pattern" | "intrusion-set" | "malware" | "tool";
  /**
   * ATT&CK identifier (G0016, T1566, S0002).
   *
   * Absent on an entry that does not come from ATT&CK: the actor aliases
   * distilled from the MISP galaxy have no MITRE number, and inventing one
   * would put a fabricated `mitre-attack` reference in the bundle.
   */
  id?: string;
  name: string;
  aliases?: string[];
  tactics?: string[];
  /**
   * MITRE framework the identifier belongs to. ABSENT means ATT&CK, so every
   * dataset and every investigation written before there was a second one
   * keeps its meaning.
   *
   * Only the 80 fraud-specific techniques carry "mitre-f3". The 43 that F3
   * reuses by number are emitted as ATT&CK techniques by the dataset build:
   * F3 flags them `isAttack` itself, and forking them would defeat the one
   * thing that makes a fraud case and an intrusion case meet on the same
   * object.
   */
  framework?: "mitre-attack" | "mitre-f3" | "mitre-atlas";
  /**
   * The ATT&CK technique this one ADAPTS, when its own framework says so.
   *
   * ATLAS carries this for 37 of its 178 techniques, and it is not an
   * identifier of its own: `AML.T0000` was inspired by `T1596`, it is not
   * `T1596`. It is read on the framework page and never written into a
   * bundle, exactly as MITRE's own ATLAS bundle does not write it.
   */
  attack?: string;
}

export interface AttackDataset {
  attack_version: string;
  entries: AttackEntry[];
}

let cache: Promise<AttackDataset> | null = null;

export function loadAttackDataset(): Promise<AttackDataset> {
  cache ??= fetch("/attack-dataset.json").then((r) => {
    if (!r.ok) {
      cache = null;
      throw new Error(`ATT&CK dataset unavailable (${r.status})`);
    }
    return r.json() as Promise<AttackDataset>;
  });
  return cache;
}

/** Search over ATT&CK name / alias / ID, best matches first. */
export function searchAttack(
  entries: AttackEntry[],
  query: string,
  limit = 20,
): AttackEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored: { score: number; entry: AttackEntry }[] = [];
  for (const entry of entries) {
    const id = entry.id?.toLowerCase() ?? "";
    const name = entry.name.toLowerCase();
    const aliases = entry.aliases?.map((a) => a.toLowerCase()) ?? [];
    let score: number | null = null;
    if (id === q || name === q) score = 0;
    else if ((id !== "" && id.startsWith(q)) || name.startsWith(q)) score = 1;
    else if (aliases.some((a) => a === q || a.startsWith(q))) score = 2;
    else if (name.includes(q) || aliases.some((a) => a.includes(q))) score = 3;
    if (score !== null) scored.push({ score, entry });
  }
  scored.sort(
    (a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name),
  );
  return scored.slice(0, limit).map((s) => s.entry);
}

function mitreUrl(id: string): string {
  const path = id.startsWith("T")
    ? "techniques"
    : id.startsWith("G")
      ? "groups"
      : "software";
  return `https://attack.mitre.org/${path}/${id.replace(".", "/")}`;
}

/** Dataset entry → entity creation arguments, MITRE properties included. */
export function entryToCreation(entry: AttackEntry): {
  stix_type: string;
  name: string;
  properties: Record<string, unknown>;
} {
  const properties: Record<string, unknown> = {};
  // No ATT&CK number, no ATT&CK claim: an actor known only to the MISP galaxy
  // comes out as a plain intrusion-set carrying its aliases, which is the
  // whole reason it is offered.
  if (entry.id === undefined) {
    // nothing to reference
  } else if (entry.type === "attack-pattern") {
    // x_mitre_id drives the deterministic OpenCTI ID and the external reference
    properties.x_mitre_id = entry.id;
    // …and the framework decides what that reference CLAIMS. Without it the
    // builder stamps every technique `mitre-attack`, so an F1001 or an
    // AML.T0051 would go out asserting an ATT&CK number that does not exist -
    // the same fabricated reference the branch above refuses to write for an
    // actor. Absent means the default, so only the others are written.
    if (entry.framework !== undefined && entry.framework !== DEFAULT_FRAMEWORK.id) {
      properties.mitre_framework = entry.framework;
    }
  } else {
    properties.external_references = [
      { source_name: "mitre-attack", external_id: entry.id, url: mitreUrl(entry.id) },
    ];
  }
  if (entry.aliases?.length) {
    properties.aliases = entry.aliases;
  }
  if (entry.type === "malware") {
    properties.is_family = true;
  }
  return { stix_type: entry.type, name: entry.name, properties };
}

/**
 * Actor names the ATT&CK dataset does not carry, distilled from the MISP
 * galaxy (`public/actors-dataset.json`, built by
 * `backend/scripts/build_actors_dataset.py`).
 *
 * Deliberately a SECOND file rather than a bigger first one. It is offered
 * where an analyst types a name into a form, and nowhere else:
 *
 * - the ATT&CK palette and the command palette say "ATT&CK" on screen, so
 *   they keep showing ATT&CK and nothing else;
 * - `extractFromText` matches every name in the corpus against pasted prose,
 *   as a whole word from four characters up. Adding eight hundred names, some
 *   of them ordinary English words, would trade precision for recall in the
 *   one place where a wrong guess is ASSERTED rather than offered.
 *
 * The arbitration between the two corpora happens at build time, not here:
 * anything ATT&CK already resolves is absent from this file.
 */
let actorCache: Promise<AttackEntry[]> | null = null;

export function loadActorAliases(): Promise<AttackEntry[]> {
  actorCache ??= fetch("/actors-dataset.json")
    .then((r) => {
      if (!r.ok) throw new Error(`actor list unavailable (${r.status})`);
      return r.json() as Promise<{ entries: AttackEntry[] }>;
    })
    .then((d) => d.entries)
    .catch((e: unknown) => {
      actorCache = null;
      throw e;
    });
  return actorCache;
}
