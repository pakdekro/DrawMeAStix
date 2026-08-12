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
