/**
 * Embedded ATT&CK dataset (#10): lazy load of the distilled JSON
 * (public/attack-dataset.json, built by backend/scripts/build_attack_dataset.py),
 * search by name/alias/ID, and conversion of an entry into a canvas entity
 * with the MITRE properties pre-filled.
 */

export interface AttackEntry {
  type: "attack-pattern" | "intrusion-set" | "malware" | "tool";
  id: string;
  name: string;
  aliases?: string[];
  tactics?: string[];
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
      throw new Error(`dataset ATT&CK indisponible (${r.status})`);
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
    const id = entry.id.toLowerCase();
    const name = entry.name.toLowerCase();
    const aliases = entry.aliases?.map((a) => a.toLowerCase()) ?? [];
    let score: number | null = null;
    if (id === q || name === q) score = 0;
    else if (id.startsWith(q) || name.startsWith(q)) score = 1;
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
  if (entry.type === "attack-pattern") {
    // x_mitre_id drives the deterministic OpenCTI ID and the external reference
    properties.x_mitre_id = entry.id;
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
