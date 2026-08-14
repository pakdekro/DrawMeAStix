/**
 * Deterministic STIX IDs - OpenCTI algorithm. Port of
 * backend/app/stix_core/ids.py, locked down by golden-vectors.json
 * (vectors produced by the Python core, itself tested against pycti).
 *
 * The namespace is the one the STIX 2.1 spec defines for SCOs (§2.9),
 * which OpenCTI reuses for its SDOs too: a single UUID for everything.
 *
 * Arguments keep the STIX property names (snake_case): they are the very
 * keys used in the canonicalized payloads.
 */

import { v5 as uuidv5 } from "uuid";

import { canonicalize, type JsonValue } from "./jcs";

export const OPENCTI_NAMESPACE = "00abedb4-aa42-466c-9c01-fed23315a9b7";

function id(prefix: string, data: Record<string, JsonValue>): string {
  return `${prefix}--${uuidv5(canonicalize(data), OPENCTI_NAMESPACE)}`;
}

function norm(value: string): string {
  return value.toLowerCase().trim();
}

export function attackPatternId(args: { name?: string; x_mitre_id?: string }): string {
  const mitre = args.x_mitre_id === undefined ? "" : norm(args.x_mitre_id);
  if (mitre) {
    return id("attack-pattern", { x_mitre_id: mitre });
  }
  if (args.name === undefined) {
    throw new Error("name or x_mitre_id required");
  }
  return id("attack-pattern", { name: norm(args.name) });
}

export function campaignId(args: { name: string }): string {
  return id("campaign", { name: norm(args.name) });
}

export function groupingId(args: { name: string; context: string; created?: string }): string {
  const data: Record<string, JsonValue> = {
    name: norm(args.name),
    context: norm(args.context),
  };
  if (args.created !== undefined) {
    data.created = args.created;
  }
  return id("grouping", data);
}

export function identityId(args: { name: string; identity_class: string }): string {
  return id("identity", {
    name: norm(args.name),
    identity_class: args.identity_class.toLowerCase(),
  });
}

export function indicatorId(args: { pattern: string }): string {
  return id("indicator", { pattern: args.pattern.trim() });
}

export function infrastructureId(args: { name: string }): string {
  return id("infrastructure", { name: norm(args.name) });
}

export function intrusionSetId(args: { name: string }): string {
  return id("intrusion-set", { name: norm(args.name) });
}

export function locationId(args: {
  name: string;
  location_type: string;
  latitude?: number;
  longitude?: number;
}): string {
  const { name, location_type, latitude, longitude } = args;
  let data: Record<string, JsonValue>;
  if (location_type === "Position" && (latitude !== undefined || longitude !== undefined)) {
    data = {};
    if (latitude !== undefined) data.latitude = latitude;
    if (longitude !== undefined) data.longitude = longitude;
  } else if (location_type === "Position") {
    data = { name: norm(name) };
  } else {
    data = { name: norm(name), x_opencti_location_type: location_type };
  }
  return id("location", data);
}

export function malwareId(args: { name: string }): string {
  return id("malware", { name: norm(args.name) });
}

export function noteId(args: { content: string; created?: string }): string {
  const data: Record<string, JsonValue> = { content: args.content.trim() };
  if (args.created !== undefined) {
    data.created = args.created;
  }
  return id("note", data);
}

export function opinionId(args: { opinion: string; created?: string }): string {
  const data: Record<string, JsonValue> = { opinion: args.opinion.trim() };
  if (args.created !== undefined) {
    data.created = args.created;
  }
  return id("opinion", data);
}

export function reportId(args: { name: string; published: string }): string {
  return id("report", { name: norm(args.name), published: args.published });
}

export function threatActorGroupId(args: { name: string }): string {
  return id("threat-actor", { name: norm(args.name), opencti_type: "Threat-Actor-Group" });
}

export function threatActorIndividualId(args: { name: string }): string {
  return id("threat-actor", { name: norm(args.name), opencti_type: "Threat-Actor-Individual" });
}

export function toolId(args: { name: string }): string {
  return id("tool", { name: norm(args.name) });
}

export function vulnerabilityId(args: { name: string }): string {
  return id("vulnerability", { name: norm(args.name) });
}

export function relationshipId(args: {
  relationship_type: string;
  source_ref: string;
  target_ref: string;
  start_time?: string;
  stop_time?: string;
}): string {
  const data: Record<string, JsonValue> = {
    relationship_type: args.relationship_type,
    source_ref: args.source_ref,
    target_ref: args.target_ref,
  };
  // pycti includes stop_time only when start_time is present as well
  if (args.start_time !== undefined) {
    data.start_time = args.start_time;
    if (args.stop_time !== undefined) {
      data.stop_time = args.stop_time;
    }
  }
  return id("relationship", data);
}

// --- SCO: deterministic IDs from the STIX 2.1 spec (§2.9), mirroring the stix2 lib ---

/** Contributing properties per type (stix2/v21/observables.py). */
const SCO_CONTRIBUTING: Record<string, readonly string[]> = {
  "autonomous-system": ["number"],
  directory: ["path"],
  "domain-name": ["value"],
  "email-addr": ["value"],
  file: ["hashes", "name", "parent_directory_ref", "extensions"],
  "ipv4-addr": ["value"],
  "ipv6-addr": ["value"],
  "mac-addr": ["value"],
  mutex: ["name"],
  software: ["name", "cpe", "swid", "vendor", "version"],
  url: ["value"],
  "user-account": ["account_type", "user_id", "account_login"],
  "x509-certificate": ["hashes", "serial_number"],
};

/** The stix2 lib's order of preference when several hashes are present. */
const HASH_PREFERENCE = ["MD5", "SHA-1", "SHA-256", "SHA-512"] as const;

function chooseOneHash(hashes: Record<string, string>): Record<string, string> {
  for (const algo of HASH_PREFERENCE) {
    if (algo in hashes) {
      return { [algo]: hashes[algo] };
    }
  }
  const first = Object.keys(hashes)[0];
  if (first === undefined) {
    throw new Error("SCO file: no hash provided");
  }
  return { [first]: hashes[first] };
}

export function scoId(type: string, props: Record<string, JsonValue>): string {
  const contributing = SCO_CONTRIBUTING[type];
  if (contributing === undefined) {
    throw new Error(`Unsupported SCO type: ${type}`);
  }
  const data: Record<string, JsonValue> = {};
  for (const key of contributing) {
    const value = props[key];
    if (value === undefined) continue;
    data[key] =
      key === "hashes" ? chooseOneHash(value as Record<string, string>) : value;
  }
  if (Object.keys(data).length === 0) {
    throw new Error(`SCO ${type}: no contributing property provided`);
  }
  return `${type}--${uuidv5(canonicalize(data), OPENCTI_NAMESPACE)}`;
}
