/**
 * Matrix of the STIX 2.1 relationships allowed between object types.
 * Port of backend/app/stix_core/relationships.py (OASIS spec, the
 * "Relationships" tables 4.x/6.x, cut down to the types the app handles).
 */

export const SDO_TYPES = new Set([
  "attack-pattern",
  "campaign",
  "identity",
  "indicator",
  "infrastructure",
  "intrusion-set",
  "location",
  "malware",
  "threat-actor",
  "tool",
  "vulnerability",
]);

export const SCO_TYPES = new Set([
  "ipv4-addr",
  "ipv6-addr",
  "domain-name",
  "url",
  "email-addr",
  "file",
  "autonomous-system",
  // Second batch: the observables of the spec whose identity rests on
  // properties of their own. The ones left out do so on purpose -
  // `email-message` and `network-traffic` derive their id from the id of
  // another object, and `process` has no contributing property at all, so
  // the spec gives it a random UUID and re-importing it would duplicate it.
  "mac-addr",
  "mutex",
  "directory",
  "software",
  "user-account",
  "x509-certificate",
]);

const NETWORK_SCOS = ["domain-name", "ipv4-addr", "ipv6-addr", "url"];
const TARGETS = ["identity", "location", "vulnerability"];
const USES = ["attack-pattern", "infrastructure", "malware", "tool"];
const ALL_SCOS = [...SCO_TYPES].sort();

const MATRIX: Record<string, Record<string, string[]>> = {
  "attack-pattern": {
    delivers: ["malware"],
    targets: TARGETS,
    uses: ["malware", "tool"],
  },
  campaign: {
    "attributed-to": ["intrusion-set", "threat-actor"],
    compromises: ["infrastructure"],
    "originates-from": ["location"],
    targets: TARGETS,
    uses: USES,
  },
  identity: {
    "located-at": ["location"],
  },
  indicator: {
    indicates: [
      "attack-pattern",
      "campaign",
      "infrastructure",
      "intrusion-set",
      "malware",
      "threat-actor",
      "tool",
    ],
    "based-on": ALL_SCOS,
  },
  infrastructure: {
    "communicates-with": ["infrastructure", ...NETWORK_SCOS],
    "consists-of": ["infrastructure", ...ALL_SCOS],
    controls: ["infrastructure", "malware"],
    delivers: ["malware"],
    has: ["vulnerability"],
    hosts: ["tool", "malware"],
    "located-at": ["location"],
    uses: ["infrastructure"],
  },
  "intrusion-set": {
    "attributed-to": ["threat-actor"],
    compromises: ["infrastructure"],
    hosts: ["infrastructure"],
    owns: ["infrastructure"],
    "originates-from": ["location"],
    targets: TARGETS,
    uses: USES,
  },
  malware: {
    "authored-by": ["threat-actor", "intrusion-set"],
    "beacons-to": ["infrastructure"],
    "exfiltrates-to": ["infrastructure"],
    "communicates-with": NETWORK_SCOS,
    controls: ["malware"],
    downloads: ["malware", "tool", "file"],
    drops: ["malware", "tool", "file"],
    exploits: ["vulnerability"],
    "originates-from": ["location"],
    targets: TARGETS,
    uses: USES,
    "variant-of": ["malware"],
  },
  "threat-actor": {
    "attributed-to": ["identity"],
    compromises: ["infrastructure"],
    hosts: ["infrastructure"],
    owns: ["infrastructure"],
    impersonates: ["identity"],
    "located-at": ["location"],
    targets: TARGETS,
    uses: USES,
  },
  tool: {
    delivers: ["malware"],
    drops: ["malware"],
    has: ["vulnerability"],
    targets: TARGETS,
  },
  "ipv4-addr": {
    "belongs-to": ["autonomous-system"],
  },
  "ipv6-addr": {
    "belongs-to": ["autonomous-system"],
  },
  "domain-name": {
    "resolves-to": ["ipv4-addr", "ipv6-addr", "domain-name"],
  },
};

/**
 * Relationship types legal between two object types: the specific ones
 * first, `related-to` last (SDO ↔ SDO only).
 * Empty list if either type is unknown.
 */
/**
 * Verbs legal for EVERY pair at once, in the order of the first pair.
 *
 * This is what a batch link needs: offering a verb that only some of the
 * selected objects accept means the creation starts, succeeds on the
 * compatible pairs, then throws on the first one that is not, leaving the
 * analyst with half the relationships created and no way to tell which
 * (#234). The reverse direction used to derive its verbs from the FIRST
 * selected object alone, which is exactly how that happened.
 *
 * Empty list if there is no pair, so a caller cannot read "no constraint"
 * as "everything is allowed".
 */
export function commonRelationships(pairs: [string, string][]): string[] {
  if (pairs.length === 0) return [];
  return pairs
    .map(([source, target]) => allowedRelationships(source, target))
    .reduce((acc, list) => acc.filter((verb) => list.includes(verb)));
}

export function allowedRelationships(sourceType: string, targetType: string): string[] {
  if (
    !(SDO_TYPES.has(sourceType) || SCO_TYPES.has(sourceType)) ||
    !(SDO_TYPES.has(targetType) || SCO_TYPES.has(targetType))
  ) {
    return [];
  }
  const result = Object.entries(MATRIX[sourceType] ?? {})
    .filter(([, targets]) => targets.includes(targetType))
    .map(([rel]) => rel);
  if (SDO_TYPES.has(sourceType) && SDO_TYPES.has(targetType)) {
    result.push("related-to");
  }
  return result;
}
