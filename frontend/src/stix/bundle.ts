/**
 * Builds the STIX 2.1 bundle of an investigation - a port of
 * backend/app/stix_core/bundle.py, pinned by golden-bundle.json.
 *
 * Principles, unchanged:
 * - Deterministic ids, OpenCTI style (ids.ts) → no duplicates on import.
 * - Reproducible export: every timestamp comes from the stored state, never
 *   from the clock - same state ⇒ same bundle ⇒ same fingerprint.
 * - The canvas layout lives in a per-object extension; the fingerprint leaves
 *   it out (moving a node does not change the version).
 * - Only `confirmed` entities are exported.
 */

import { v5 as uuidv5 } from "uuid";

import {
  attackPatternId,
  campaignId,
  groupingId,
  identityId,
  indicatorId,
  infrastructureId,
  intrusionSetId,
  locationId,
  malwareId,
  noteId,
  OPENCTI_NAMESPACE,
  opinionId,
  relationshipId,
  reportId,
  scoId,
  threatActorGroupId,
  threatActorIndividualId,
  toolId,
  vulnerabilityId,
} from "./ids";
import { canonicalize, type JsonValue } from "./jcs";
import { SCO_TYPES } from "./relationships";
import type { EntityRow, ExportOptions, InvestigationState, NoteRow } from "./types";

export const STIXIT_EXTENSION_ID =
  "extension-definition--4a3b8e1c-6f2d-4b9a-8c5e-1d2f3a4b5c6d";

/**
 * FROZEN timestamp on the extension definition: it describes the format, not
 * the investigation. Taken from the export clock, the file would change at
 * every click, when two exports of one state must give the same bytes.
 */
const EXTENSION_CREATED = "2024-11-15T09:00:00.000Z";

/**
 * `schema` is required (OASIS schemas) and the spec accepts "either a URL or
 * plain text explaining the definition". Text wins: a URL would carry a
 * hosting address inside every bundle an analyst exports, an address that may
 * well stop answering long afterwards.
 */
const EXTENSION_SCHEMA_TEXT =
  "Canvas layout only. Adds position_x and position_y (numbers), local_id " +
  "and source (strings) to an object, recording where it sat on the Draw Me " +
  "A STIX canvas and where it came from. Carries no intelligence: a consumer " +
  "can ignore this extension without losing anything.";

const TOOL_IDENTITY_NAME = "Draw Me A STIX";
const TOOL_IDENTITY_CLASS = "system";

/**
 * Identity of the TOOL, distinct from the analyst.
 *
 * The spec makes `created_by_ref` mandatory on `extension-definition` - one
 * of the rare places it demands it - and the software is what defines this
 * format, not the person filling the canvas. The id goes through the same
 * deterministic computation as the other identities: two exports, two
 * machines, two analysts produce the same one.
 */
export const TOOL_IDENTITY_ID = identityId({
  name: TOOL_IDENTITY_NAME,
  identity_class: TOOL_IDENTITY_CLASS,
});

/** Shipped with the bundle so it can be read, never content of their own. */
const TOOLING_IDS = new Set([STIXIT_EXTENSION_ID, TOOL_IDENTITY_ID]);

/**
 * The layout extension definition and its identity, shipped with the bundle.
 *
 * Without them, a consumer gets an `extensions` key on every object pointing
 * at an id it cannot resolve. The spec wants the definition to travel with
 * the objects that use it; they are therefore placed first, ahead of any
 * object that references them.
 */
function toolingObjects(): StixObject[] {
  return [
    {
      type: "identity",
      spec_version: "2.1",
      id: TOOL_IDENTITY_ID,
      created: EXTENSION_CREATED,
      modified: EXTENSION_CREATED,
      name: TOOL_IDENTITY_NAME,
      identity_class: TOOL_IDENTITY_CLASS,
    },
    {
      type: "extension-definition",
      spec_version: "2.1",
      id: STIXIT_EXTENSION_ID,
      created_by_ref: TOOL_IDENTITY_ID,
      created: EXTENSION_CREATED,
      modified: EXTENSION_CREATED,
      name: "Draw Me A STIX layout",
      description: "Node positions on the DMAS canvas (ignored by other tools).",
      schema: EXTENSION_SCHEMA_TEXT,
      version: "1.0",
      extension_types: ["property-extension"],
    },
  ];
}

export type StixObject = { id: string; type: string } & Record<string, JsonValue>;

export interface ExportResult {
  bundle: { type: "bundle"; id: string; objects: StixObject[] };
  fingerprint: string;
  warnings: string[];
}

/** Spec TLP markings, serialised exactly as the stix2 library does. */
const TLP_MARKINGS: Record<string, StixObject> = {
  clear: tlp("613f2e26-407d-48c7-9eca-b8e91df99dc9", "white"),
  white: tlp("613f2e26-407d-48c7-9eca-b8e91df99dc9", "white"),
  green: tlp("34098fce-860f-48ae-8e50-ebd3cc5e41da", "green"),
  amber: tlp("f88d31f6-486f-44da-b317-01333bde0b82", "amber"),
  red: tlp("5e57c739-391a-4eb3-b6be-7d15ca92d5ed", "red"),
};

function tlp(uuid: string, color: string): StixObject {
  return {
    type: "marking-definition",
    spec_version: "2.1",
    id: `marking-definition--${uuid}`,
    created: "2017-01-20T00:00:00.000Z",
    definition_type: "tlp",
    name: `TLP:${color.toUpperCase()}`,
    definition: { tlp: color },
  };
}

// Fixed emission order for the marking-definitions: the bundle stays the same
// whatever order the entities referencing them were created in.
const TLP_ORDER = ["white", "green", "amber", "red"] as const;

// Property keys the builder consumes itself, not to be passed through again.
// tlp/confidence: handled explicitly (per-object marking, precedence).
const INTERNAL_KEYS = new Set([
  "id", "type", "spec_version", "created", "modified",
  "identity_class", "location_type", "x_mitre_id", "pattern",
  "pattern_type", "valid_from",
  "hashes", "file_name", "actor_kind", "country", "region",
  "latitude", "longitude", "published", "is_family", "number", "as_name",
  "tlp", "confidence",
]);

/** Valid STIX confidence (integer 0-100), else null: we emit nothing. */
export function stixConfidence(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  const conf =
    typeof value === "number"
      ? Math.trunc(value)
      : /^\s*[+-]?\d+\s*$/.test(String(value))
        ? parseInt(String(value), 10)
        : NaN;
  return Number.isInteger(conf) && conf >= 0 && conf <= 100 ? conf : null;
}

/**
 * An "empty" field is never exported: on the OpenCTI side it could blank out
 * an existing value on merge without adding anything (non-destructive interop).
 */
function isBlank(value: JsonValue): boolean {
  if (value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/** A property read back as a non-empty trimmed string, or null. */
function asTrimmedString(value: JsonValue | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Hex fingerprint lengths, as `hashes-type.json` names the algorithms. */
const FINGERPRINT_ALGOS: Record<number, string> = {
  32: "MD5",
  40: "SHA-1",
  64: "SHA-256",
  128: "SHA-512",
};

/**
 * What identifies a certificate node: its fingerprints, its serial, or both.
 *
 * A x509-certificate has no `name` in the spec, so the node name has to stand
 * in when neither field was filled: a certificate gets quoted either by its
 * fingerprint, recognisable on sight (hex, of one of four lengths), or by its
 * serial. Exported here because the pattern generator has to read the node the
 * same way the builder does, or the indicator would hunt for something the
 * bundle never carries.
 */
export function x509Identity(
  name: string,
  props: Record<string, unknown>,
): { hashes: Record<string, JsonValue>; serial: string | null } {
  const hashes = { ...((props.hashes as Record<string, JsonValue> | undefined) ?? {}) };
  let serial = asTrimmedString(props.serial_number as JsonValue | undefined);
  const value = name.trim();
  if (Object.keys(hashes).length === 0 && serial === null && value !== "") {
    const hex = value.replace(/[^0-9a-fA-F]/g, "");
    const algo = FINGERPRINT_ALGOS[hex.length];
    if (algo !== undefined && /^[0-9a-fA-F:\s-]+$/.test(value)) hashes[algo] = hex.toLowerCase();
    else serial = value;
  }
  return { hashes, serial };
}

export class ExportError extends Error {
  constructor(public problems: string[]) {
    super(problems.join("; "));
    this.name = "ExportError";
  }
}

/**
 * Normalises a timestamp the way stix2 serialises "ANY" precision
 * (start_time, stop_time, published, valid_from): sub-second fraction pruned
 * of its trailing zeros, dropped when empty. Ids computed from these values
 * must be computed on the serialised form (roundtrip).
 */
export function stixTime(value: string): string;
export function stixTime(value: string | null): string | null;
export function stixTime(value: string | null): string | null {
  if (value === null) return null;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/.exec(value);
  if (m) {
    const frac = (m[2] ?? "").replace(/0+$/, "");
    return frac ? `${m[1]}.${frac}Z` : `${m[1]}Z`;
  }
  // non-UTC offset or exotic format: go through Date (ms precision)
  const iso = new Date(value).toISOString();
  return iso.endsWith(".000Z") ? iso.replace(".000Z", "Z") : iso;
}

/** Timestamp forced to millisecond precision (created, modified). */
export function msTime(value: string): string {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/.exec(value);
  if (m) {
    const frac = ((m[2] ?? "") + "000").slice(0, 3);
    return `${m[1]}.${frac}Z`;
  }
  return new Date(value).toISOString();
}

type Props = Record<string, JsonValue>;

function layoutExtension(e: EntityRow): Props {
  // names ≥ 3 characters: the spec (§3.3) requires 3-250 chars on custom
  // properties - "x"/"y" would be rejected by the OASIS schemas
  return {
    [STIXIT_EXTENSION_ID]: {
      extension_type: "property-extension",
      local_id: e.id,
      position_x: e.position_x,
      position_y: e.position_y,
      source: e.source,
    },
  };
}

function sdoIdFor(stixType: string, name: string, props: Props): string {
  switch (stixType) {
    case "attack-pattern":
      return attackPatternId({ name, x_mitre_id: props.x_mitre_id as string | undefined });
    case "campaign":
      return campaignId({ name });
    case "identity":
      return identityId({
        name,
        identity_class: (props.identity_class as string) ?? "organization",
      });
    case "infrastructure":
      return infrastructureId({ name });
    case "intrusion-set":
      return intrusionSetId({ name });
    case "location":
      return locationId({
        name,
        location_type: (props.location_type as string) ?? "Country",
        latitude: props.latitude as number | undefined,
        longitude: props.longitude as number | undefined,
      });
    case "malware":
      return malwareId({ name });
    case "threat-actor":
      return props.actor_kind === "individual"
        ? threatActorIndividualId({ name })
        : threatActorGroupId({ name });
    case "tool":
      return toolId({ name });
    case "vulnerability":
      return vulnerabilityId({ name });
  }
  throw new Error(`unsupported type: ${stixType}`);
}

function withExternalRef(extra: Props, sourceName: string, externalId: string): JsonValue[] {
  const refs = [...((extra.external_references as JsonValue[] | undefined) ?? [])];
  const exists = refs.some(
    (r) =>
      typeof r === "object" &&
      r !== null &&
      !Array.isArray(r) &&
      r.source_name === sourceName &&
      r.external_id === externalId,
  );
  if (!exists) {
    refs.push({ source_name: sourceName, external_id: externalId });
  }
  return refs;
}

/**
 * SCO properties the builder consumes: they come back out in another shape,
 * or not at all.
 *
 * Split per type rather than pooled. Pooled, a key one type consumes went
 * unreported on every OTHER type: `display_name` is a real property of
 * `email-addr`, and declaring it for `user-account` silenced the "not
 * re-exported" notice on an imported address that carried one. The loss was
 * the same as before, the notice about it was not.
 */
const SCO_COMMON_INTERNAL = new Set(["value", "hashes", "tlp", "confidence"]);

const SCO_INTERNAL_BY_TYPE: Record<string, readonly string[]> = {
  "autonomous-system": ["number", "as_name"],
  file: ["file_name"],
  directory: ["path"],
  software: ["cpe", "swid", "vendor", "version"],
  "user-account": ["account_login", "account_type", "user_id", "display_name"],
  "x509-certificate": ["serial_number", "subject", "issuer"],
};

function isInternalScoKey(stixType: string, key: string): boolean {
  return (
    SCO_COMMON_INTERNAL.has(key) || (SCO_INTERNAL_BY_TYPE[stixType]?.includes(key) ?? false)
  );
}

/**
 * Properties of an observable imported from a third-party bundle, re-emitted as they are.
 *
 * `buildSco` only listed the identifying keys, unlike `buildSdo` which dumps
 * everything: an observable enriched elsewhere lost its properties on
 * re-export, silently.
 *
 * Only CUSTOM properties (`x_…`) come back. The others are reported, not
 * re-emitted: a STIX property we do not model is often a reference
 * (`resolves_to_refs`, `belongs_to_refs`) pointing at ids absent from our
 * bundle - re-emitting it would manufacture dangling references, which is
 * worse than the loss being fixed.
 */
function customScoProps(stixType: string, props: Props): { kept: Props; dropped: string[] } {
  const kept: Props = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(props)) {
    if (isInternalScoKey(stixType, k) || isBlank(v)) continue;
    if (k.startsWith("x_")) kept[k] = v;
    else dropped.push(k);
  }
  return { kept, dropped };
}

function buildSco(e: EntityRow, props: Props, marking: string | null): StixObject {
  const value = e.name.trim();
  const common: Props = {
    spec_version: "2.1",
    extensions: layoutExtension(e),
    // `object_marking_refs` only: spec 2.1 allows marking on a SCO, but not
    // `created_by_ref`.
    ...(marking !== null ? { object_marking_refs: [marking] } : {}),
    // The identifying keys come after this in each branch: they must never be
    // overwritten, and the id is computed separately.
    ...customScoProps(e.stix_type, props).kept,
  };
  switch (e.stix_type) {
    case "ipv4-addr":
    case "ipv6-addr":
    case "domain-name":
    case "url":
    case "email-addr":
      return {
        type: e.stix_type,
        ...common,
        id: scoId(e.stix_type, { value }),
        value,
      };
    case "autonomous-system": {
      let number = props.number as number | undefined;
      if (number === undefined || number === null) {
        const digits = value.replace(/\D/g, "");
        if (!digits) {
          throw new ExportError([`autonomous-system "${value}": AS number not found`]);
        }
        number = parseInt(digits, 10);
      }
      const obj: StixObject = {
        type: "autonomous-system",
        ...common,
        id: scoId("autonomous-system", { number }),
        number,
      };
      if (props.as_name != null) obj.name = props.as_name;
      return obj;
    }
    case "file": {
      const hashes = (props.hashes as Props | undefined) ?? {};
      const hasHashes = Object.keys(hashes).length > 0;
      let fileName = props.file_name as string | undefined | null;
      if (!hasHashes && !fileName) fileName = value;
      const contributing: Props = {};
      if (hasHashes) contributing.hashes = hashes;
      if (fileName != null) contributing.name = fileName;
      const obj: StixObject = {
        type: "file",
        ...common,
        // id computed without the extensions: the spec lets them contribute
        // to a file id, tying it to the canvas layout (see ids.py)
        id: scoId("file", contributing),
      };
      if (hasHashes) obj.hashes = hashes;
      if (fileName != null) obj.name = fileName;
      return obj;
    }
    case "mac-addr": {
      // The OASIS schema wants lowercase, colon-delimited. Analysts copy MAC
      // addresses out of tools that print them in either case, and an
      // uppercase one would fail validation at export - after the id had
      // already been computed on the other form.
      const mac = value.toLowerCase();
      return {
        type: "mac-addr",
        ...common,
        id: scoId("mac-addr", { value: mac }),
        value: mac,
      };
    }
    case "mutex":
      return {
        type: "mutex",
        ...common,
        id: scoId("mutex", { name: value }),
        name: value,
      };
    case "directory":
      return {
        type: "directory",
        ...common,
        id: scoId("directory", { path: value }),
        path: value,
      };
    case "software": {
      const contributing: Props = { name: value };
      for (const key of ["cpe", "swid", "vendor", "version"] as const) {
        const raw = props[key];
        if (raw != null && !isBlank(raw)) contributing[key] = raw;
      }
      return {
        type: "software",
        ...common,
        id: scoId("software", contributing),
        ...contributing,
      };
    }
    case "user-account": {
      // The node name is the login: it is the readable half of an account,
      // and the one an analyst has in front of them.
      const contributing: Props = { account_login: value };
      for (const key of ["account_type", "user_id"] as const) {
        const raw = props[key];
        if (raw != null && !isBlank(raw)) contributing[key] = raw;
      }
      const obj: StixObject = {
        type: "user-account",
        ...common,
        id: scoId("user-account", contributing),
        ...contributing,
      };
      if (props.display_name != null && !isBlank(props.display_name)) {
        obj.display_name = props.display_name;
      }
      return obj;
    }
    case "x509-certificate": {
      const { hashes, serial } = x509Identity(value, props);
      const contributing: Props = {};
      if (Object.keys(hashes).length > 0) contributing.hashes = hashes;
      if (serial !== null) contributing.serial_number = serial;
      if (Object.keys(contributing).length === 0) {
        throw new ExportError([
          `x509-certificate "${value}": neither fingerprint nor serial number`,
        ]);
      }
      const obj: StixObject = {
        type: "x509-certificate",
        ...common,
        id: scoId("x509-certificate", contributing),
        ...contributing,
      };
      for (const key of ["subject", "issuer"] as const) {
        const raw = props[key];
        if (raw != null && !isBlank(raw)) obj[key] = raw;
      }
      return obj;
    }
  }
  throw new Error(`unsupported SCO: ${e.stix_type}`);
}

/**
 * Temporal properties typed by the analyst (#170). The form gives back a day
 * (`2026-03-14`); the spec demands a timestamp. Normalised here, the one
 * place where the serialised form counts - elsewhere we keep what the
 * analyst typed.
 */
const TEMPORAL_PROPS = new Set(["first_seen", "last_seen", "valid_from", "valid_until"]);

function buildSdo(e: EntityRow, props: Props, commonBase: Props): StixObject {
  const name = e.name.trim();
  const extra: Props = {};
  for (const [k, v] of Object.entries(props)) {
    if (INTERNAL_KEYS.has(k) || isBlank(v)) continue;
    extra[k] = TEMPORAL_PROPS.has(k) ? stixTime(String(v)) : v;
  }
  const base: StixObject = {
    type: e.stix_type,
    spec_version: "2.1",
    id: "",
    name,
    ...extra,
    ...commonBase,
    created: msTime(e.created_at),
    modified: msTime(e.updated_at),
    extensions: layoutExtension(e),
  };

  if (e.stix_type === "indicator") {
    const pattern = ((props.pattern as string | undefined) ?? "").trim();
    if (!pattern) {
      throw new ExportError([`indicator "${name}": \`pattern\` property required for export`]);
    }
    const indicator: StixObject = {
      ...base,
      id: indicatorId({ pattern }),
      pattern,
      pattern_type: "stix",
      pattern_version: "2.1",
      // valid_from is mandatory on an indicator: the creation date stays the
      // fallback when the analyst left it empty (#170). Explicit test rather
      // than isBlank, which does not cover `undefined`.
      valid_from: stixTime(
        typeof props.valid_from === "string" && props.valid_from.trim() !== ""
          ? props.valid_from
          : e.created_at,
      ),
    };
    // The spec requires `valid_until` strictly after `valid_from`. A lone
    // `valid_until`, earlier than the creation date used as fallback, produced
    // an inverted window: the object is invalid, and on the consumer side the
    // detection never fires. The lint flags it before export; here we refuse to
    // produce the bundle, as for an indicator without a pattern.
    const until = Date.parse(String(indicator.valid_until ?? ""));
    const from = Date.parse(String(indicator.valid_from ?? ""));
    if (!Number.isNaN(until) && !Number.isNaN(from) && until <= from) {
      throw new ExportError([
        `indicator "${name}": valid_until (${String(indicator.valid_until)}) is not after ` +
          `valid_from (${String(indicator.valid_from)})` +
          (props.valid_from ? "" : ", which falls back to the creation date when unset"),
      ]);
    }
    return indicator;
  }

  base.id = sdoIdFor(e.stix_type, name, props);
  switch (e.stix_type) {
    case "attack-pattern":
      if (props.x_mitre_id) {
        base.external_references = withExternalRef(
          base, "mitre-attack", props.x_mitre_id as string,
        );
      }
      return base;
    case "identity":
      return { ...base, identity_class: (props.identity_class as string) ?? "organization" };
    case "location": {
      const geo: Props = {};
      for (const k of [
        "country",
        "region",
        "latitude",
        "longitude",
        "city",
        "administrative_area",
      ] as const) {
        if (k in props && !isBlank(props[k])) geo[k] = props[k];
      }
      // The spec requires at least ONE of these three forms. `city` and
      // `administrative_area` refine the place but do not satisfy it.
      const situe =
        geo.country !== undefined ||
        geo.region !== undefined ||
        (geo.latitude !== undefined && geo.longitude !== undefined);
      if (!situe) {
        // We refuse rather than invent. The original fallback copied the NAME
        // into `region`, a normalised vocabulary: "Brive-la-Gaillarde" came
        // out as a region of the world and polluted the consumer's filters.
        // The lint flags it before export.
        throw new ExportError([
          `location "${name}": give a country code, a region, or both coordinates - ` +
            `the spec requires one of the three`,
        ]);
      }
      return {
        ...base,
        x_opencti_location_type: (props.location_type as string) ?? "Country",
        ...geo,
      };
    }
    case "malware":
      return { ...base, is_family: Boolean(props.is_family ?? false) };
    case "vulnerability":
      if (name.toUpperCase().startsWith("CVE-")) {
        base.external_references = withExternalRef(base, "cve", name.toUpperCase());
      }
      return base;
    default:
      return base;
  }
}

async function sha256hex(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Version fingerprint: canonical hash of the content, canvas layout aside. */
export async function fingerprint(objects: StixObject[]): Promise<string> {
  const stripped = objects
    // The plumbing describes the layout, it is not content: including it would
    // flip in one go the fingerprint of every investigation already exported,
    // and they would all show up as modified without anyone having touched
    // them.
    .filter((obj) => !TOOLING_IDS.has(obj.id as string))
    .map((obj) => {
      const copy: StixObject = { ...obj };
      const extensions = { ...((copy.extensions as Props | undefined) ?? {}) };
      delete extensions[STIXIT_EXTENSION_ID];
      if (Object.keys(extensions).length > 0) {
        copy.extensions = extensions;
      } else {
        delete copy.extensions;
      }
      return copy;
    });
  stripped.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return "sha256:" + (await sha256hex(canonicalize({ objects: stripped })));
}

function byCreatedAt<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function buildBundle(
  state: InvestigationState,
  opts: ExportOptions,
): Promise<ExportResult> {
  const inv = state.investigation;
  const warnings: string[] = [];
  const problems: string[] = [];

  // The export TLP applies to the whole bundle; an entity can carry its own
  // (props.tlp), which wins for that entity alone. Every definition used is
  // embedded.
  const usedMarkingIds = new Set<string>();

  // The global TLP is normalised ONCE here, and `globalTlp` is what the rest
  // of the function uses. Keeping each access site on its own was fragile:
  // there were already two, and the second (commonBase) had been forgotten -
  // it produced an object_marking_refs: [undefined], which JCS then refuses to
  // canonicalise, so no export was possible at all.
  //
  // opts.tlp comes from dmas.export-prefs in localStorage, that is from a
  // value a restored backup file could write. Object.hasOwn and not `in`:
  // `in` walks the prototype chain, so "constructor" passed the test.
  const globalTlp =
    opts.tlp !== "none" && Object.hasOwn(TLP_MARKINGS, opts.tlp) ? opts.tlp : "none";
  if (globalTlp !== "none") usedMarkingIds.add(TLP_MARKINGS[globalTlp].id);

  let author: StixObject | null = null;
  if (opts.author_name) {
    author = {
      type: "identity",
      spec_version: "2.1",
      id: identityId({ name: opts.author_name, identity_class: opts.author_class }),
      created: msTime(inv.created_at),
      modified: msTime(inv.created_at),
      name: opts.author_name,
      identity_class: opts.author_class,
    };
  }

  const commonBase: Props = {};
  if (author) commonBase.created_by_ref = author.id;
  if (globalTlp !== "none") commonBase.object_marking_refs = [TLP_MARKINGS[globalTlp].id];
  // Export confidence: applied to any object that does not already carry one.
  // It is what decides, on the OpenCTI side, whether this curation may update
  // an existing field (confidence-guarded merge).
  const defaultConfidence = stixConfidence(opts.confidence);
  if (defaultConfidence !== null) commonBase.confidence = defaultConfidence;

  const objects: StixObject[] = [];

  // Ids are DETERMINISTIC: two distinct canvas nodes can perfectly well land
  // on the same one (two techniques carrying the same x_mitre_id, two
  // relationships of the same type between the same ends). Unchecked, the
  // bundle came out with two objects sharing an `id` and an `object_refs`
  // repeating it. Neither the lint nor OASIS validation can see it: the
  // second assertion vanished on ingestion.
  const seenIds = new Set<string>();
  const pushUnique = (obj: StixObject): boolean => {
    if (seenIds.has(obj.id)) return false;
    seenIds.add(obj.id);
    objects.push(obj);
    return true;
  };
  const localToStix = new Map<string, string>();
  for (const entity of byCreatedAt(state.entities.filter((e) => e.status === "confirmed"))) {
    const props = JSON.parse(entity.properties) as Props;
    let obj: StixObject;
    try {
      // Marking of the entity itself, which wins over the export's.
      //
      // Object.hasOwn and not `in`: `in` walks the prototype chain, so
      // "constructor" in TLP_MARKINGS is true. An entity imported with a tlp
      // of "constructor" then passed the test, marking.id came out undefined,
      // and the export failed OASIS validation with an unreadable message -
      // with no way for the analyst to guess that a stray property caused it.
      const tlpKey = props.tlp;
      let ownMarking: string | null = null;
      if (typeof tlpKey === "string" && Object.hasOwn(TLP_MARKINGS, tlpKey)) {
        ownMarking = TLP_MARKINGS[tlpKey].id;
        usedMarkingIds.add(ownMarking);
      }

      if (SCO_TYPES.has(entity.stix_type)) {
        // Observables carry their marking, and THAT ALONE: spec 2.1 does not
        // allow `created_by_ref` on a SCO.
        //
        // They used to carry none, on the grounds that the container covered
        // it. Checked on OpenCTI (#210): a platform ingesting objects one by
        // one propagates nothing, and an IP exported as TLP:RED arrived there
        // unmarked - that is, declassified.
        const marking = ownMarking ?? (globalTlp !== "none" ? TLP_MARKINGS[globalTlp].id : null);
        obj = buildSco(entity, props, marking);
        // What we do not re-emit gets said out loud: without this message, an
        // observable enriched elsewhere grew poorer at every round trip with
        // nobody noticing.
        const { dropped } = customScoProps(entity.stix_type, props);
        if (dropped.length > 0) {
          warnings.push(
            `${entity.stix_type} "${entity.name}": ${dropped.join(", ")} not re-exported ` +
              `(property not modelled here; a reference would point outside this bundle)`,
          );
        }
      } else {
        const entityCommon: Props = { ...commonBase };
        const conf = stixConfidence(props.confidence);
        if (conf !== null) entityCommon.confidence = conf;
        if (ownMarking !== null) entityCommon.object_marking_refs = [ownMarking];
        obj = buildSdo(entity, props, entityCommon);
      }
    } catch (exc) {
      if (exc instanceof ExportError) {
        problems.push(...exc.problems);
      } else {
        problems.push(`${entity.stix_type} "${entity.name}": ${(exc as Error).message}`);
      }
      continue;
    }
    // The mapping is recorded in ALL cases, even when the object is a
    // duplicate: relationships leaving the second node must stay valid.
    localToStix.set(entity.id, obj.id);
    if (!pushUnique(obj)) {
      warnings.push(
        `${entity.stix_type} "${entity.name}" collapses onto an object already exported ` +
          `(${obj.id}): identical STIX identity, so only the first one is written. ` +
          `Merge the two on the canvas to keep both descriptions.`,
      );
    }
  }

  if (problems.length > 0) {
    throw new ExportError(problems);
  }

  for (const rel of byCreatedAt(state.relationships)) {
    const src = localToStix.get(rel.source_id);
    const tgt = localToStix.get(rel.target_id);
    if (src === undefined || tgt === undefined) {
      warnings.push(
        `relationship ${rel.rel_type} skipped: one end is not exported` +
          " (candidate entity?)",
      );
      continue;
    }
    const startTime = stixTime(rel.start_time);
    const stopTime = stixTime(rel.stop_time);
    const obj: StixObject = {
      type: "relationship",
      spec_version: "2.1",
      id: relationshipId({
        relationship_type: rel.rel_type,
        source_ref: src,
        target_ref: tgt,
        start_time: startTime ?? undefined,
        stop_time: stopTime ?? undefined,
      }),
      ...commonBase,
      created: msTime(rel.created_at),
      modified: msTime(rel.created_at),
      relationship_type: rel.rel_type,
      source_ref: src,
      target_ref: tgt,
    };
    if (rel.description) obj.description = rel.description;
    if (startTime !== null) obj.start_time = startTime;
    if (stopTime !== null) obj.stop_time = stopTime;
    if (!pushUnique(obj)) {
      warnings.push(
        `relationship "${rel.rel_type}" is a duplicate of one already exported ` +
          `(${obj.id}): same type, same ends, same time window. Only the first ` +
          `one is written, so its description is the one that travels.`,
      );
    }
  }

  // Container (id computed before the notes: an investigation note refers to it)
  const containerId =
    opts.container === "report"
      ? reportId({ name: inv.name, published: stixTime(inv.created_at) })
      : groupingId({ name: inv.name, context: "suspicious-activity" });

  if (opts.include_notes) {
    for (const note of byCreatedAt(state.notes)) {
      let refs: string[];
      if (note.entity_id !== null) {
        const stixRef = localToStix.get(note.entity_id);
        if (stixRef === undefined) {
          warnings.push("note skipped: its entity is not exported");
          continue;
        }
        refs = [stixRef];
      } else {
        refs = [containerId];
      }
      // Two notes with identical content on the same entity land on the same
      // id: same silent handling, they carry nothing more.
      pushUnique(buildNote(note, refs, commonBase));
    }
  }

  // `objects` holds no duplicate by construction: the list is already
  // deduplicated, and it keeps the emission order. Deliberately written like
  // the Python side, line for line: that is the oracle of the golden vectors.
  const containerRefs = objects.map((o) => o.id);
  if (containerRefs.length === 0) {
    throw new ExportError(["empty investigation: nothing to export"]);
  }

  const container: StixObject = {
    type: opts.container,
    spec_version: "2.1",
    id: containerId,
    ...commonBase,
    created: msTime(inv.created_at),
    modified: msTime(inv.updated_at),
    name: inv.name,
    object_refs: containerRefs,
  };
  if (inv.description) container.description = inv.description;
  if (opts.container === "report") {
    container.published = stixTime(inv.created_at);
    container.report_types = ["threat-report"];
  } else {
    container.context = "suspicious-activity";
  }

  const markings = TLP_ORDER.map((k) => TLP_MARKINGS[k]).filter((m) =>
    usedMarkingIds.has(m.id),
  );
  // First, ahead of any object referencing it. Unconditional: an empty export
  // already throws (ExportError), so there is always at least one entity
  // carrying the extension. A spare definition would be harmless anyway,
  // where a missing definition is the very defect being fixed.
  const allObjects = [
    ...toolingObjects(),
    ...(author ? [author] : []),
    ...markings,
    ...objects,
    container,
  ];
  const fp = await fingerprint(allObjects);
  return {
    bundle: {
      type: "bundle",
      // deterministic (uuid5 of the fingerprint), where stix2 drew a uuid4:
      // two exports of one state now give the same file down to the byte
      id: `bundle--${uuidv5(fp, OPENCTI_NAMESPACE)}`,
      objects: allObjects,
    },
    fingerprint: fp,
    warnings,
  };
}

function buildNote(note: NoteRow, refs: string[], commonBase: Props): StixObject {
  const common: Props = {
    spec_version: "2.1",
    ...commonBase,
    created: msTime(note.created_at),
    modified: msTime(note.updated_at),
    object_refs: refs,
  };
  if (note.kind === "opinion") {
    return {
      type: "opinion",
      id: opinionId({ opinion: note.opinion_value ?? "", created: msTime(note.created_at) }),
      ...common,
      explanation: note.content,
      opinion: note.opinion_value ?? "",
    } as StixObject;
  }
  return {
    type: "note",
    id: noteId({ content: note.content, created: msTime(note.created_at) }),
    ...common,
    content: note.content,
  } as StixObject;
}
