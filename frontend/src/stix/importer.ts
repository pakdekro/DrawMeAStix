/**
 * Import of a STIX 2.1 bundle into an investigation state - port of
 * backend/app/stix_core/importer.py.
 *
 * Tolerant by design: unknown types, relationships outside the matrix,
 * exotic extensions - we import everything we can represent, we count
 * the rest in the report, we never strand the user on an error. STIX
 * timestamps are preserved: an export → import → export roundtrip gives
 * back the same version fingerprint.
 */

import { DEFAULT_ACCOUNT_NAME_PROPERTY } from "../entityFields";
import { DEFAULT_FRAMEWORK, FRAMEWORKS } from "../frameworks";
import { refang } from "../ioc";
import { STIXIT_EXTENSION_ID, TOOL_IDENTITY_ID } from "./bundle";
import type { JsonValue } from "./jcs";
import { SCO_TYPES, SDO_TYPES } from "./relationships";
import type {
  EntityRow,
  InvestigationState,
  NoteRow,
  RelationshipRow,
} from "./types";

const GRID_X = 240;
const GRID_Y = 140;
const GRID_COLS = 6;

// Handled elsewhere, or meta: never imported as canvas entities.
const NON_ENTITY_TYPES = new Set([
  "bundle", "report", "grouping", "marking-definition", "relationship",
  "note", "opinion", "extension-definition", "language-content",
]);

const DROPPED_PROPS = new Set([
  "type", "id", "spec_version", "created", "modified", "name", "value",
  "created_by_ref", "object_marking_refs", "extensions", "object_refs",
  "granular_markings", "revoked", "defanged",
]);

// TLP marking-definitions from the spec: the only markings mapped back here.
const TLP_BY_MARKING_ID: Record<string, string> = {
  "marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9": "clear",
  "marking-definition--34098fce-860f-48ae-8e50-ebd3cc5e41da": "green",
  "marking-definition--f88d31f6-486f-44da-b317-01333bde0b82": "amber",
  "marking-definition--5e57c739-391a-4eb3-b6be-7d15ca92d5ed": "red",
};

type StixLike = Record<string, JsonValue>;

interface ImportReport {
  entities: number;
  relationships: number;
  notes: number;
  skipped: Record<string, number>;
  warnings: string[];
}

/** Returns the value if it really is a string, otherwise undefined.
 *
 * The `as string | undefined` casts scattered across this file were lies at
 * runtime: a bundle is third-party JSON, `name` can perfectly well be an
 * object. That value was persisted to IndexedDB then rendered as a JSX child,
 * which throws "Objects are not valid as a React child"; with no ErrorBoundary
 * the root unmounts on EVERY later visit, since the offending row is now
 * stored, and the analyst can no longer repair anything from the interface.
 *
 * So we filter where the data comes in, not where it gets displayed.
 */
function asText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Same reason as `asText`, for the fields the spec declares as arrays.
 *
 * `refs.map(...)` on a string throws, and that `TypeError` reached the error
 * banner, failing the WHOLE import - whereas this module means to be
 * tolerant: we import what we can represent, we count the rest. A badly typed
 * field must cost that field, not the bundle.
 */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The identifiers of a refs array: strings only. */
function asRefs(value: unknown): string[] {
  return asArray(value).filter((v): v is string => typeof v === "string");
}

/**
 * STIX fields the spec declares as "list of string" and that the interface
 * renders directly (label chips, displayed aliases).
 *
 * A malformed feed - not necessarily a hostile one - is enough to slip an
 * object in there, which then becomes an invalid JSX child. The imported
 * investigation is unopenable for good, the offending row being stored: the
 * only way out is deleting it. So we normalise on the way in.
 */
const STRING_LIST_PROPS = new Set([
  "labels",
  "aliases",
  "roles",
  "sectors",
  "indicator_types",
  "malware_types",
  "infrastructure_types",
  "threat_actor_types",
  "report_types",
  "tool_types",
]);

function newId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Which of an account's three names became the node name, most identifying
 * first. The builder is told which one, so that a roundtrip writes the value
 * back where it came from: an account known only by its `user_id` used to come
 * home as an `account_login`, which is a different account.
 */
function accountNameProperty(obj: StixLike): string {
  // truthiness and not a null check: `asText` yields undefined, and an empty
  // string is not a name either
  if (asText(obj.account_login)) return "account_login";
  if (asText(obj.user_id)) return "user_id";
  return "display_name";
}

function scoName(obj: StixLike): string | null {
  // refang on import: a third-party bundle may be defanged (evil[.]com); we
  // store the canonical form, as the store does on manual entry, otherwise the
  // deterministic ID is computed on the wrong form → duplicate in OpenCTI
  if (typeof obj.value === "string") return refang(obj.value);
  if (obj.type === "file") {
    // `hashes` can be anything: `Object.values` on a string yields isolated
    // characters, and the file name would end up being "a"
    const hashes =
      typeof obj.hashes === "object" && obj.hashes !== null && !Array.isArray(obj.hashes)
        ? (obj.hashes as Record<string, unknown>)
        : {};
    return asText(obj.name) ?? Object.values(hashes).map(asText).find(Boolean) ?? null;
  }
  if (obj.type === "autonomous-system") {
    const number = typeof obj.number === "number" ? obj.number : "?";
    return asText(obj.name) ?? `AS${number}`;
  }
  // Observables whose readable half is not called `value`. The property picked
  // here is the one the builder reads back out of the node name, so that an
  // import → export roundtrip lands on the same identifier.
  if (obj.type === "mutex" || obj.type === "software") return asText(obj.name) ?? null;
  if (obj.type === "directory") return asText(obj.path) ?? null;
  if (obj.type === "user-account") return asText(obj[accountNameProperty(obj)]) ?? null;
  if (obj.type === "x509-certificate") {
    const hashes =
      typeof obj.hashes === "object" && obj.hashes !== null && !Array.isArray(obj.hashes)
        ? (obj.hashes as Record<string, unknown>)
        : {};
    // The serial comes first: the builder only reads the name as a fingerprint
    // when nothing identifying was filled in, and a certificate carrying both
    // must come back with the same identity it arrived with.
    return (
      asText(obj.serial_number) ?? Object.values(hashes).map(asText).find(Boolean) ?? null
    );
  }
  return null;
}

function entityProperties(obj: StixLike): Record<string, JsonValue> {
  const props: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (DROPPED_PROPS.has(k)) continue;
    // only the genuinely textual items survive: the interface renders these
    // lists as they are, an object in one becomes an invalid JSX child
    props[k] = STRING_LIST_PROPS.has(k) ? (asRefs(v) as JsonValue) : (v as JsonValue);
  }
  // object_marking_refs is meta (dropped), but a known TLP is mapped back
  // into a `tlp` prop: the roundtrip preserves the marking object by object.
  const refs = asRefs(obj.object_marking_refs);
  const tlp = refs.map((r) => TLP_BY_MARKING_ID[r]).find((t) => t !== undefined);
  if (tlp) props.tlp = tlp;
  if (obj.type === "location" && "x_opencti_location_type" in props) {
    props.location_type = props.x_opencti_location_type;
    delete props.x_opencti_location_type;
  }
  // The STIX `name` is meta (handled apart) but some types carry it in a
  // dedicated property on the builder side: without re-mapping, the roundtrip
  // loses the information and the deterministic ID changes.
  const objName = asText(obj.name);
  if (obj.type === "file" && objName) {
    props.file_name = refang(objName);
  }
  if (obj.type === "autonomous-system" && objName) {
    props.as_name = objName;
  }
  // The readable half of these two lives in the entity name from here on.
  // Leaving a copy in the properties lets the two drift apart the moment the
  // node is renamed, and the builder reads the name, never the copy.
  if (obj.type === "directory") delete props.path;
  if (obj.type === "user-account") {
    const from = accountNameProperty(obj);
    if (from !== DEFAULT_ACCOUNT_NAME_PROPERTY) props.account_name_is = from;
    delete props[from];
  }
  if (obj.type === "attack-pattern" && !props.x_mitre_id) {
    const refs = asArray(obj.external_references).filter(
      (r): r is StixLike => typeof r === "object" && r !== null && !Array.isArray(r),
    );
    // In registry order, so ATT&CK first. A bundle carrying both references
    // describes a technique F3 borrowed from ATT&CK, and it is the ATT&CK
    // number that deduplicates it against the rest of the world.
    for (const framework of FRAMEWORKS) {
      const mitre = refs
        .map((r) => (r.source_name === framework.id ? asText(r.external_id) : undefined))
        .find((id) => id !== undefined);
      if (mitre === undefined) continue;
      props.x_mitre_id = mitre;
      // the default is stored as absent, the one representation it has
      if (framework !== DEFAULT_FRAMEWORK) props.mitre_framework = framework.id;
      break;
    }
  }
  return props;
}

function layout(obj: StixLike, index: number): { x: number; y: number; source: string } {
  const ext = ((obj.extensions as StixLike | undefined) ?? {})[
    STIXIT_EXTENSION_ID
  ] as StixLike | undefined;
  if (ext) {
    // "x"/"y": bundles produced before the rename to position_x/y
    return {
      x: (ext.position_x as number) ?? (ext.x as number) ?? 0,
      y: (ext.position_y as number) ?? (ext.y as number) ?? 0,
      source: (ext.source as string) ?? "import",
    };
  }
  return {
    x: (index % GRID_COLS) * GRID_X,
    y: Math.floor(index / GRID_COLS) * GRID_Y,
    source: "import",
  };
}

export function importBundle(
  bundle: StixLike,
  fallbackName?: string,
): { state: InvestigationState; report: ImportReport } {
  const objects = bundle.objects;
  if (!Array.isArray(objects) || bundle.type !== "bundle") {
    throw new Error("this file is not a STIX bundle (type=bundle, objects=[...])");
  }
  const objs = objects as StixLike[];

  const report: ImportReport = {
    entities: 0,
    relationships: 0,
    notes: 0,
    skipped: {},
    warnings: [],
  };
  const skip = (t: string) => {
    report.skipped[t] = (report.skipped[t] ?? 0) + 1;
  };
  const ts = now();
  // Monotonic fallback timestamp (SCOs carry no created): the order of the
  // bundle must survive a sort by created_at, whatever the store
  // (SQLite kept insertion order through rowid, IndexedDB does not).
  const base = Date.parse(ts);
  let seq = 0;
  const nextTs = () => new Date(base + seq++).toISOString();

  // Container: hands its name and its timestamps to the investigation
  const container = objs.find((o) => o.type === "report" || o.type === "grouping");
  const investigation = {
    id: newId(),
    name: asText(container?.name) || fallbackName || "Imported investigation",
    description: asText(container?.description) || "",
    created_at: asText(container?.published) || asText(container?.created) || ts,
    updated_at: asText(container?.modified) || ts,
  };

  // "Author" identities (created_by_ref): meta, not canvas entities
  const authorRefs = new Set(
    objs.map((o) => o.created_by_ref).filter((r): r is string => typeof r === "string"),
  );

  const entities: EntityRow[] = [];
  const relationships: RelationshipRow[] = [];
  const notes: NoteRow[] = [];
  const stixToLocal = new Map<string, string>();
  let entityIndex = 0;

  for (const obj of objs) {
    // `typeof` and not a plain truthiness test: an object `id` passed the
    // test, was typed `string` by the cast, and ended up rendered as a JSX child
    const stixType = asText(obj.type);
    const stixId = asText(obj.id);
    if (!stixType || !stixId) {
      report.warnings.push("object without a usable type or id skipped");
      continue;
    }
    if (NON_ENTITY_TYPES.has(stixType)) continue;
    // Our own tool identity, the one that signs the extension definition:
    // plumbing, not an identity the analyst placed. Counting it would show
    // "identity (author)" counted twice to someone who filled in only one.
    if (stixId === TOOL_IDENTITY_ID) continue;
    if (stixType === "identity" && authorRefs.has(stixId)) {
      skip("identity (author)");
      continue;
    }
    if (!SDO_TYPES.has(stixType) && !SCO_TYPES.has(stixType)) {
      skip(stixType);
      continue;
    }

    let name: string | null;
    if (SCO_TYPES.has(stixType)) {
      name = scoName(obj);
      if (!name) {
        report.warnings.push(`${stixType} ${stixId} without a usable value, skipped`);
        continue;
      }
    } else {
      name = asText(obj.name) || asText(obj.pattern) || stixId;
    }

    const { x, y, source } = layout(obj, entityIndex);
    entityIndex += 1;
    const local = newId();
    const fallbackTs = nextTs();
    stixToLocal.set(stixId, local);
    // Triage tray (#12): an entity coming from a third-party bundle (without
    // our layout extension, so never curated in the tool) arrives as a
    // candidate - nothing reaches the canvas without the analyst validating it.
    const curated = Boolean(
      ((obj.extensions as StixLike | undefined) ?? {})[STIXIT_EXTENSION_ID],
    );
    entities.push({
      id: local,
      investigation_id: investigation.id,
      stix_type: stixType,
      name,
      properties: JSON.stringify(entityProperties(obj)),
      status: curated ? "confirmed" : "candidate",
      source,
      position_x: x,
      position_y: y,
      created_at: (obj.created as string | undefined) ?? fallbackTs,
      updated_at: (obj.modified as string | undefined) ?? fallbackTs,
      // entered as confirmed without going through triage: for the lint to
      // flag (candidates will be validated by hand anyway)
      imported: curated ? true : undefined,
    });
    report.entities += 1;
  }

  for (const obj of objs) {
    if (obj.type !== "relationship") continue;
    const src = stixToLocal.get(obj.source_ref as string);
    const tgt = stixToLocal.get(obj.target_ref as string);
    if (src === undefined || tgt === undefined) {
      report.warnings.push(
        `relationship ${obj.relationship_type} skipped: one end was not imported`,
      );
      continue;
    }
    // deliberately without matrix validation: we do not drop data from a
    // third-party bundle, the matrix only guides creation
    relationships.push({
      id: newId(),
      investigation_id: investigation.id,
      source_id: src,
      target_id: tgt,
      rel_type: (obj.relationship_type as string | undefined) ?? "related-to",
      description: (obj.description as string | undefined) ?? "",
      start_time: (obj.start_time as string | undefined) ?? null,
      stop_time: (obj.stop_time as string | undefined) ?? null,
      created_at: (obj.created as string | undefined) ?? nextTs(),
    });
    report.relationships += 1;
  }

  for (const obj of objs) {
    if (obj.type !== "note" && obj.type !== "opinion") continue;
    const refs = asRefs(obj.object_refs);
    const entityRef = refs.map((r) => stixToLocal.get(r)).find((r) => r !== undefined) ?? null;
    let content: string;
    let opinionValue: string | null;
    let kind: NoteRow["kind"];
    if (obj.type === "opinion") {
      content =
        (obj.explanation as string | undefined) || (obj.opinion as string | undefined) || "";
      opinionValue = (obj.opinion as string | undefined) ?? null;
      kind = "opinion";
    } else {
      content = (obj.content as string | undefined) ?? "";
      opinionValue = null;
      kind = "note";
    }
    if (!content) {
      report.warnings.push(`${obj.type} ${obj.id} without content, skipped`);
      continue;
    }
    const noteFallbackTs = nextTs();
    notes.push({
      id: newId(),
      investigation_id: investigation.id,
      entity_id: entityRef,
      kind,
      content,
      opinion_value: opinionValue,
      created_at: (obj.created as string | undefined) ?? noteFallbackTs,
      updated_at: (obj.modified as string | undefined) ?? noteFallbackTs,
    });
    report.notes += 1;
  }

  if (report.entities === 0) {
    report.warnings.push("no importable entity in this bundle");
  }
  const candidates = entities.filter((e) => e.status === "candidate").length;
  if (candidates > 0) {
    report.warnings.push(
      `${candidates} entity/entities placed in the triage tray (third-party bundle, validate before exporting)`,
    );
  }

  return { state: { investigation, entities, relationships, notes }, report };
}
