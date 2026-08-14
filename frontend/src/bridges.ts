/**
 * Canonical bridges (#37): when a direct link is illegal in STIX
 * (e.g. threat-actor → ipv4-addr), we offer to create the canonical
 * in-between entity in one click - C2 infrastructure, detection
 * indicator, malware - along with the two relationships that go with it.
 *
 * Product decision (#36, closed): the matrix stays strict, no lazy
 * related-to towards observables; the clean path costs one click, there
 * is no excuse left.
 */

import { patternFromObservable } from "./pattern";
import { SCO_TYPES, SDO_TYPES } from "./stix/relationships";

export interface BridgeEndpoint {
  stix_type: string;
  name: string;
  properties: Record<string, unknown>;
}

/** One relationship of the bridge: endpoints designated by role. */
interface BridgeLeg {
  rel: string;
  from: "sdo" | "bridge";
  to: "sdo" | "sco" | "bridge";
}

export interface BridgeRecipe {
  key: string;
  label: string;
  hint: string;
  bridgeType: string;
  defaultName: (sdo: BridgeEndpoint, sco: BridgeEndpoint) => string;
  bridgeProperties: (sco: BridgeEndpoint) => Record<string, unknown>;
  legs: BridgeLeg[];
}

const OPERATORS = new Set(["threat-actor", "intrusion-set", "campaign"]);
const NETWORK_SCOS = new Set(["ipv4-addr", "ipv6-addr", "domain-name", "url"]);
const INDICABLE = new Set([
  "attack-pattern",
  "campaign",
  "infrastructure",
  "intrusion-set",
  "malware",
  "threat-actor",
  "tool",
]);

const INFRASTRUCTURE_RECIPE: BridgeRecipe = {
  key: "infrastructure",
  label: "Its infrastructure (C2, hosting…)",
  hint: "uses → infrastructure → communicates-with",
  bridgeType: "infrastructure",
  defaultName: (_sdo, sco) => `C2 - ${sco.name}`,
  bridgeProperties: () => ({ infrastructure_types: ["command-and-control"] }),
  legs: [
    { rel: "uses", from: "sdo", to: "bridge" },
    { rel: "communicates-with", from: "bridge", to: "sco" },
  ],
};

/**
 * Observables that describe what an actor's infrastructure is MADE OF rather
 * than something it talks to: a certificate served by a C2, the software it
 * runs, an account on it, the MAC of a box. The canonical detour is
 * `consists-of`, where a network endpoint gets `communicates-with`.
 *
 * `mutex` and `directory` are deliberately absent: they are malware artefacts
 * on a victim host, not infrastructure, and STIX 2.1 offers no relationship
 * from a malware to either of them. They keep the indicator bridge, which is
 * the honest route - inventing a link is what this whole file exists to avoid.
 */
const INFRASTRUCTURE_PARTS = new Set([
  "mac-addr",
  "software",
  "user-account",
  "x509-certificate",
]);

const INFRASTRUCTURE_PART_RECIPE: BridgeRecipe = {
  key: "infrastructure-part",
  label: "Infrastructure this observable is part of",
  hint: "uses → infrastructure → consists-of",
  bridgeType: "infrastructure",
  defaultName: (_sdo, sco) => `Infrastructure - ${sco.name}`,
  // No `infrastructure_types`: the C2 recipe knows what it is building, this
  // one does not, and guessing would put an assertion in the bundle that the
  // analyst never made.
  bridgeProperties: () => ({}),
  legs: [
    { rel: "uses", from: "sdo", to: "bridge" },
    { rel: "consists-of", from: "bridge", to: "sco" },
  ],
};

const MALWARE_RECIPE: BridgeRecipe = {
  key: "malware",
  label: "A malware that drops this file",
  hint: "uses → malware → drops",
  bridgeType: "malware",
  defaultName: (_sdo, sco) => `Malware - ${sco.name}`,
  bridgeProperties: () => ({ is_family: false }),
  legs: [
    { rel: "uses", from: "sdo", to: "bridge" },
    { rel: "drops", from: "bridge", to: "sco" },
  ],
};

const INDICATOR_RECIPE: BridgeRecipe = {
  key: "indicator",
  label: "A detection indicator",
  hint: "indicates ← indicator → based-on, generated pattern",
  bridgeType: "indicator",
  defaultName: (_sdo, sco) => `Detection - ${sco.name}`,
  bridgeProperties: (sco) => {
    const pattern = patternFromObservable(sco.stix_type, sco.name, sco.properties);
    return pattern === null ? {} : { pattern };
  },
  legs: [
    { rel: "indicates", from: "bridge", to: "sdo" },
    { rel: "based-on", from: "bridge", to: "sco" },
  ],
};

export interface BridgeMatch {
  /** endpoints normalised: the SDO and the SCO, whichever way the drag went */
  sdo: BridgeEndpoint;
  sco: BridgeEndpoint;
  recipes: BridgeRecipe[];
}

/**
 * Recipes applicable between two entities with no legal direct relationship.
 * Only concerns SDO ↔ SCO pairs (between SDOs, related-to always exists;
 * between SCOs, there is no generic canonical bridge).
 */
export function findBridges(a: BridgeEndpoint, b: BridgeEndpoint): BridgeMatch | null {
  let sdo: BridgeEndpoint;
  let sco: BridgeEndpoint;
  if (SDO_TYPES.has(a.stix_type) && SCO_TYPES.has(b.stix_type)) {
    sdo = a;
    sco = b;
  } else if (SCO_TYPES.has(a.stix_type) && SDO_TYPES.has(b.stix_type)) {
    sdo = b;
    sco = a;
  } else {
    return null;
  }

  const recipes: BridgeRecipe[] = [];
  if (OPERATORS.has(sdo.stix_type) && NETWORK_SCOS.has(sco.stix_type)) {
    recipes.push(INFRASTRUCTURE_RECIPE);
  }
  if (OPERATORS.has(sdo.stix_type) && INFRASTRUCTURE_PARTS.has(sco.stix_type)) {
    recipes.push(INFRASTRUCTURE_PART_RECIPE);
  }
  if (OPERATORS.has(sdo.stix_type) && sco.stix_type === "file") {
    recipes.push(MALWARE_RECIPE);
  }
  if (INDICABLE.has(sdo.stix_type)) {
    recipes.push(INDICATOR_RECIPE);
  }
  return recipes.length > 0 ? { sdo, sco, recipes } : null;
}
