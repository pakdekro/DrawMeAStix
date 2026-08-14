/**
 * Draw Me A STIX local-first store: IndexedDB replaces SQLite, and this
 * module replaces the FastAPI routes (backend/app/routers/investigations.py,
 * export.py, importer.py) whose rules it reproduces exactly - validation
 * against the relationship matrix, delete cascades, timestamps, counts. The
 * data never leaves the browser.
 *
 * Records keep the "row" shape of the historical SQLite schema (properties
 * as serialised JSON): that is the shape the bundle builder and the golden
 * vectors consume.
 */

import { canonicalObservable } from "./ioc";
import { announceChange } from "./sync";
import { lintInvestigation } from "./lint";
import { buildBundle, ExportError } from "./stix/bundle";
import { importBundle as importBundleCore } from "./stix/importer";
import { allowedRelationships, SCO_TYPES } from "./stix/relationships";
import { validateObjects } from "./stix/validate";
import type {
  EntityRow,
  ExportOptions,
  InvestigationRow,
  InvestigationState,
  NoteRow,
  RelationshipRow,
} from "./stix/types";

export class StoreError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(typeof detail === "string" ? detail : `Error (${status})`);
    this.name = "StoreError";
  }
}

// Historical name kept after the "Draw Me A STIX" rebranding: renaming it
// would orphan the existing IndexedDB data.
const DB_NAME = "stixit";
// v2: `captures` store (annotation layer #136)
const DB_VERSION = 2;
const STORES = ["investigations", "entities", "relationships", "notes", "captures"] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: "id" });
          if (name !== "investigations") {
            store.createIndex("investigation_id", "investigation_id");
          }
        }
      }
    };
    // Mirror image of `onversionchange`: here it is US who are blocked by a
    // tab still on the old version. Without this message the open never
    // settles, the home screen stays empty forever, and the analyst concludes
    // their investigations are gone.
    req.onblocked = () => {
      dbPromise = null;
      reject(
        new StoreError(
          409,
          "Another tab is still using an older version of this application. " +
            "Close the other tabs, then reload this page.",
        ),
      );
    };
    req.onsuccess = () => {
      // another tab is asking for a version upgrade (e.g. v2 #136): close our
      // connection so we do not block its migration - without this the two
      // tabs freeze each other
      req.result.onversionchange = () => {
        req.result.close();
        dbPromise = null;
      };
      // Unexpected close (private tab cleared, database dropped from under
      // us): forget the dead connection, otherwise every later write fails
      // with "InvalidStateError" until the page is reloaded.
      req.result.onclose = () => {
        dbPromise = null;
      };
      resolve(req.result);
    };
    // never memoise a rejected promise: a single failed open would brick the
    // app until a reload
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

/** Tests only: closes and deletes the database. */
export async function _resetForTests(): Promise<void> {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function reqAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx<T>(
  names: StoreName[],
  mode: IDBTransactionMode,
  fn: (stores: Record<string, IDBObjectStore>) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  const transaction = db.transaction(names, mode);
  const stores = Object.fromEntries(names.map((n) => [n, transaction.objectStore(n)]));
  let result: T;
  try {
    result = await fn(stores);
  } catch (err) {
    // "an error means nothing was written" contract: undo partial writes
    // before propagating (an exception after a put would commit otherwise)
    try {
      transaction.abort();
    } catch {
      /* transaction already finished */
    }
    throw err;
  }
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    // An exceeded quota lands here like any other transaction error. Without
    // singling it out, the analyst saw a fleeting technical message, never
    // realised the browser was full, and kept working while every later write
    // was lost.
    transaction.onerror = () => reject(asStoreError(transaction.error));
    transaction.onabort = () =>
      reject(asStoreError(transaction.error) ?? new Error("transaction aborted"));
  });
  // A single announcement point for every write: putting it here rather than
  // in each mutation guarantees none is ever forgotten.
  if (mode === "readwrite") announceChange();
  return result;
}

/** Conventional HTTP code for a full disk, understood by the interface. */
export const QUOTA_EXCEEDED = 507;

export function isQuotaError(e: unknown): boolean {
  return e instanceof StoreError && e.status === QUOTA_EXCEEDED;
}

/**
 * Turns an IndexedDB error into a store error, singling out the one case
 * that calls for an action from the analyst rather than a plain message.
 */
function asStoreError(error: DOMException | null): unknown {
  if (error?.name === "QuotaExceededError") {
    return new StoreError(
      QUOTA_EXCEEDED,
      "This browser profile is full: nothing can be written any more. " +
        "Export your investigations or back everything up before continuing, " +
        "then free some space.",
    );
  }
  return error;
}

function byInvestigation<T>(store: IDBObjectStore, iid: string): Promise<T[]> {
  return reqAsPromise(store.index("investigation_id").getAll(iid) as IDBRequest<T[]>);
}

function newId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function byCreatedAt<T extends { created_at: string }>(rows: T[]): T[] {
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

let persistRequested = false;

function requestPersistence(): void {
  // Ask the browser not to evict our data under storage pressure. Best
  // effort: the file export stays the real backup.
  if (!persistRequested && typeof navigator !== "undefined" && navigator.storage?.persist) {
    persistRequested = true;
    void navigator.storage.persist().catch(() => undefined);
  }
}

// --- Public views (same shapes as the old API responses) ---------------------

interface InvestigationView extends InvestigationRow {
  entity_count: number;
  relationship_count: number;
}

interface EntityView extends Omit<EntityRow, "properties"> {
  properties: Record<string, unknown>;
}

function toEntityView(row: EntityRow): EntityView {
  return { ...row, properties: JSON.parse(row.properties) as Record<string, unknown> };
}

async function getInvestigationOr404(
  stores: Record<string, IDBObjectStore>,
  iid: string,
): Promise<InvestigationRow> {
  const row = (await reqAsPromise(stores.investigations.get(iid))) as
    | InvestigationRow
    | undefined;
  if (row === undefined) throw new StoreError(404, "unknown investigation");
  return row;
}

async function getEntityOr404(
  stores: Record<string, IDBObjectStore>,
  iid: string,
  eid: string,
): Promise<EntityRow> {
  const row = (await reqAsPromise(stores.entities.get(eid))) as EntityRow | undefined;
  if (row === undefined || row.investigation_id !== iid) {
    throw new StoreError(404, "unknown entity");
  }
  return row;
}

function touch(stores: Record<string, IDBObjectStore>, inv: InvestigationRow): void {
  stores.investigations.put({ ...inv, updated_at: now() });
}

async function withCounts(
  stores: Record<string, IDBObjectStore>,
  row: InvestigationRow,
): Promise<InvestigationView> {
  const [entities, relationships] = await Promise.all([
    byInvestigation<EntityRow>(stores.entities, row.id),
    byInvestigation<RelationshipRow>(stores.relationships, row.id),
  ]);
  return { ...row, entity_count: entities.length, relationship_count: relationships.length };
}

// --- Investigations ----------------------------------------------------------

export async function listInvestigations(): Promise<InvestigationView[]> {
  return tx(["investigations", "entities", "relationships"], "readonly", async (stores) => {
    const rows = (await reqAsPromise(
      stores.investigations.getAll(),
    )) as InvestigationRow[];
    rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return Promise.all(rows.map((r) => withCounts(stores, r)));
  });
}

export async function createInvestigation(
  name: string,
  description = "",
): Promise<InvestigationView> {
  requestPersistence();
  const ts = now();
  const row: InvestigationRow = { id: newId(), name, description, created_at: ts, updated_at: ts };
  await tx(["investigations"], "readwrite", async (stores) => {
    stores.investigations.put(row);
  });
  return { ...row, entity_count: 0, relationship_count: 0 };
}

export async function getInvestigation(iid: string): Promise<InvestigationView> {
  return tx(["investigations", "entities", "relationships"], "readonly", async (stores) =>
    withCounts(stores, await getInvestigationOr404(stores, iid)),
  );
}

export async function updateInvestigation(
  iid: string,
  patch: Partial<Pick<InvestigationRow, "name" | "description">>,
): Promise<InvestigationView> {
  return tx(["investigations", "entities", "relationships"], "readwrite", async (stores) => {
    const row = await getInvestigationOr404(stores, iid);
    const updated: InvestigationRow = {
      ...row,
      ...(patch.name != null ? { name: patch.name } : {}),
      ...(patch.description != null ? { description: patch.description } : {}),
      updated_at: now(),
    };
    stores.investigations.put(updated);
    return withCounts(stores, updated);
  });
}

/**
 * Scratchpad notes (#29): saved WITHOUT touching updated_at - they are not
 * part of the intel, so the export fingerprint must not move.
 */
export async function saveScratchpad(iid: string, text: string): Promise<void> {
  await tx(["investigations"], "readwrite", async (stores) => {
    const row = await getInvestigationOr404(stores, iid);
    stores.investigations.put({ ...row, scratchpad: text });
  });
}

export async function deleteInvestigation(iid: string): Promise<void> {
  await tx(STORES.slice() as StoreName[], "readwrite", async (stores) => {
    await getInvestigationOr404(stores, iid);
    stores.investigations.delete(iid);
    // cascade: the equivalent of SQLite's FK ON DELETE CASCADE
    for (const name of ["entities", "relationships", "notes", "captures"] as const) {
      const rows = await byInvestigation<{ id: string }>(stores[name], iid);
      for (const row of rows) stores[name].delete(row.id);
    }
  });
}

// --- Entities ----------------------------------------------------------------

export interface EntityCreateBody {
  stix_type: string;
  name: string;
  properties?: Record<string, unknown>;
  status?: "candidate" | "confirmed";
  source?: string;
  position_x?: number;
  position_y?: number;
}

export async function createEntity(iid: string, body: EntityCreateBody): Promise<EntityView> {
  return tx(["investigations", "entities"], "readwrite", async (stores) => {
    const inv = await getInvestigationOr404(stores, iid);
    const ts = now();
    const row: EntityRow = {
      id: newId(),
      investigation_id: iid,
      stix_type: body.stix_type,
      // automatic refang: never a "hxxp://evil[.]com" in the store (#30), plus
      // the canonical spelling of the types that have one
      name: SCO_TYPES.has(body.stix_type)
        ? canonicalObservable(body.stix_type, body.name)
        : body.name,
      properties: JSON.stringify(body.properties ?? {}),
      status: body.status ?? "confirmed",
      source: body.source ?? "manual",
      position_x: body.position_x ?? 0,
      position_y: body.position_y ?? 0,
      created_at: ts,
      updated_at: ts,
    };
    stores.entities.put(row);
    touch(stores, inv);
    return toEntityView(row);
  });
}

export async function listEntities(iid: string, status?: string): Promise<EntityView[]> {
  return tx(["investigations", "entities"], "readonly", async (stores) => {
    await getInvestigationOr404(stores, iid);
    let rows = await byInvestigation<EntityRow>(stores.entities, iid);
    if (status !== undefined) rows = rows.filter((r) => r.status === status);
    return byCreatedAt(rows).map(toEntityView);
  });
}

export async function updateEntity(
  iid: string,
  eid: string,
  patch: Partial<EntityCreateBody>,
): Promise<EntityView> {
  return tx(["investigations", "entities"], "readwrite", async (stores) => {
    const row = await getEntityOr404(stores, iid, eid);
    const stixType = patch.stix_type ?? row.stix_type;
    const updated: EntityRow = {
      ...row,
      ...(patch.stix_type != null ? { stix_type: patch.stix_type } : {}),
      ...(patch.name != null
        ? {
            name: SCO_TYPES.has(stixType)
              ? canonicalObservable(stixType, patch.name)
              : patch.name,
          }
        : {}),
      ...(patch.properties != null ? { properties: JSON.stringify(patch.properties) } : {}),
      ...(patch.status != null ? { status: patch.status } : {}),
      ...(patch.source != null ? { source: patch.source } : {}),
      ...(patch.position_x != null ? { position_x: patch.position_x } : {}),
      ...(patch.position_y != null ? { position_y: patch.position_y } : {}),
      updated_at: now(),
    };
    stores.entities.put(updated);
    touch(stores, await getInvestigationOr404(stores, iid));
    return toEntityView(updated);
  });
}

/**
 * Absorbs a duplicate into the entity to keep (#168).
 *
 * Two successive enrichments can point at the same observable: the second
 * must join the existing node, not spawn a twin. Everything hanging off the
 * duplicate (relationships, notes, capture links) is carried over to the
 * target, then the duplicate goes away.
 *
 * What would be absurd after the carry-over is dropped rather than moved: a
 * relationship whose two ends would both become the target (reflexive), and
 * a relationship that already exists identically - `createRelationship` does
 * not deduplicate, so that would be two edges stacked on the canvas.
 */
export async function mergeEntities(
  iid: string,
  duplicateId: string,
  targetId: string,
): Promise<{ relations: number; notes: number }> {
  return tx(STORES.slice() as StoreName[], "readwrite", async (stores) => {
    const inv = await getInvestigationOr404(stores, iid);
    if (duplicateId === targetId) {
      throw new StoreError(422, "an entity cannot be merged with itself");
    }
    await getEntityOr404(stores, iid, duplicateId);
    await getEntityOr404(stores, iid, targetId);

    const rels = await byInvestigation<RelationshipRow>(stores.relationships, iid);
    // signature of the relationships that stay put: keeps the carry-over from
    // recreating a link that is already there
    const seen = new Set(
      rels
        .filter((r) => r.source_id !== duplicateId && r.target_id !== duplicateId)
        .map((r) => `${r.source_id}|${r.rel_type}|${r.target_id}`),
    );

    let relations = 0;
    for (const rel of rels) {
      if (rel.source_id !== duplicateId && rel.target_id !== duplicateId) continue;
      const source = rel.source_id === duplicateId ? targetId : rel.source_id;
      const target = rel.target_id === duplicateId ? targetId : rel.target_id;
      const key = `${source}|${rel.rel_type}|${target}`;
      if (source === target || seen.has(key)) {
        stores.relationships.delete(rel.id);
        continue;
      }
      seen.add(key);
      stores.relationships.put({ ...rel, source_id: source, target_id: target });
      relations += 1;
    }

    let notes = 0;
    for (const note of await byInvestigation<NoteRow>(stores.notes, iid)) {
      if (note.entity_id !== duplicateId) continue;
      stores.notes.put({ ...note, entity_id: targetId, updated_at: now() });
      notes += 1;
    }

    for (const capture of await byInvestigation<CaptureRow>(stores.captures, iid)) {
      if (!capture.entity_ids.includes(duplicateId)) continue;
      const ids = capture.entity_ids.filter((id) => id !== duplicateId);
      if (!ids.includes(targetId)) ids.push(targetId);
      stores.captures.put({ ...capture, entity_ids: ids });
    }

    stores.entities.delete(duplicateId);
    touch(stores, inv);
    return { relations, notes };
  });
}

/**
 * Everything an entity deletion takes down with it.
 *
 * Deleting an entity is not a one-line operation: the cascade also wipes its
 * relationships and its notes, and pulls it out of the capture links. Without
 * this snapshot, "undo" would hand back nothing but an orphan node - the
 * linking work itself would be gone for good.
 */
export interface EntitySnapshot {
  entity: EntityRow;
  relationships: RelationshipRow[];
  notes: NoteRow[];
  /** captures the entity was pulled out of in the annotation links */
  captureIds: string[];
}

export async function deleteEntity(iid: string, eid: string): Promise<EntitySnapshot> {
  return tx(STORES.slice() as StoreName[], "readwrite", async (stores) => {
    const entity = await getEntityOr404(stores, iid, eid);
    stores.entities.delete(eid);
    // cascade: relationships with the entity at either end, attached notes
    const rels = await byInvestigation<RelationshipRow>(stores.relationships, iid);
    const removedRels: RelationshipRow[] = [];
    for (const rel of rels) {
      if (rel.source_id === eid || rel.target_id === eid) {
        removedRels.push(rel);
        stores.relationships.delete(rel.id);
      }
    }
    const notes = await byInvestigation<NoteRow>(stores.notes, iid);
    const removedNotes: NoteRow[] = [];
    for (const note of notes) {
      if (note.entity_id === eid) {
        removedNotes.push(note);
        stores.notes.delete(note.id);
      }
    }
    // annotation cascade (#136): the entity drops out of the capture links
    const captures = await byInvestigation<CaptureRow>(stores.captures, iid);
    const unlinked: string[] = [];
    for (const capture of captures) {
      if (capture.entity_ids.includes(eid)) {
        unlinked.push(capture.id);
        stores.captures.put({
          ...capture,
          entity_ids: capture.entity_ids.filter((id) => id !== eid),
        });
      }
    }
    touch(stores, await getInvestigationOr404(stores, iid));
    return { entity, relationships: removedRels, notes: removedNotes, captureIds: unlinked };
  });
}

/**
 * Puts a deleted entity back in the store, exactly as it was.
 *
 * The rows are rewritten WITH THEIR ORIGINAL IDENTIFIER, without going back
 * through createEntity: that one mints a fresh id, and the restored
 * relationships would then point into the void. Restoring is not recreating.
 *
 * Idempotent (`put`), and deliberately forgiving: a relationship whose other
 * end has disappeared in the meantime is skipped rather than failing the
 * whole undo.
 */
export async function restoreEntity(iid: string, snap: EntitySnapshot): Promise<void> {
  await tx(STORES.slice() as StoreName[], "readwrite", async (stores) => {
    const inv = await getInvestigationOr404(stores, iid);
    stores.entities.put(snap.entity);
    const present = new Set(
      (await byInvestigation<EntityRow>(stores.entities, iid)).map((e) => e.id),
    );
    for (const rel of snap.relationships) {
      if (present.has(rel.source_id) && present.has(rel.target_id)) {
        stores.relationships.put(rel);
      }
    }
    for (const note of snap.notes) stores.notes.put(note);
    for (const cid of snap.captureIds) {
      const capture = (await reqAsPromise(stores.captures.get(cid))) as CaptureRow | undefined;
      if (capture && !capture.entity_ids.includes(snap.entity.id)) {
        stores.captures.put({
          ...capture,
          entity_ids: [...capture.entity_ids, snap.entity.id],
        });
      }
    }
    touch(stores, inv);
  });
}

export async function savePositions(
  iid: string,
  positions: Record<string, { x: number; y: number }>,
): Promise<{ updated: number }> {
  return tx(["investigations", "entities"], "readwrite", async (stores) => {
    await getInvestigationOr404(stores, iid);
    let updated = 0;
    for (const [eid, pos] of Object.entries(positions)) {
      const row = (await reqAsPromise(stores.entities.get(eid))) as EntityRow | undefined;
      if (row !== undefined && row.investigation_id === iid) {
        stores.entities.put({ ...row, position_x: pos.x, position_y: pos.y });
        updated += 1;
      }
    }
    return { updated };
  });
}

// --- Relations ---------------------------------------------------------------

interface RelationshipCreateBody {
  source_id: string;
  target_id: string;
  rel_type: string;
  description?: string;
  start_time?: string | null;
  stop_time?: string | null;
}

export async function createRelationship(
  iid: string,
  body: RelationshipCreateBody,
): Promise<RelationshipRow> {
  return tx(["investigations", "entities", "relationships"], "readwrite", async (stores) => {
    const inv = await getInvestigationOr404(stores, iid);
    const source = await getEntityOr404(stores, iid, body.source_id);
    const target = await getEntityOr404(stores, iid, body.target_id);
    if (body.source_id === body.target_id) {
      throw new StoreError(422, "an entity cannot be linked to itself");
    }
    const allowed = allowedRelationships(source.stix_type, target.stix_type);
    if (!allowed.includes(body.rel_type)) {
      throw new StoreError(
        422,
        `relationship '${body.rel_type}' invalid between ${source.stix_type}` +
          ` and ${target.stix_type} (allowed: ${allowed.join(", ") || "none"})`,
      );
    }
    const row: RelationshipRow = {
      id: newId(),
      investigation_id: iid,
      source_id: body.source_id,
      target_id: body.target_id,
      rel_type: body.rel_type,
      description: body.description ?? "",
      start_time: body.start_time ?? null,
      stop_time: body.stop_time ?? null,
      created_at: now(),
    };
    stores.relationships.put(row);
    touch(stores, inv);
    return row;
  });
}

/**
 * Fixes the verb of an existing relationship, without recreating it.
 *
 * The type feeds the deterministic STIX id: after the fix the relationship
 * will therefore export under a different identifier - that is the intended
 * behaviour, it is no longer the same assertion. The local id does not move,
 * which keeps intact everything that points at it.
 */
export async function updateRelationship(
  iid: string,
  rid: string,
  patch: { rel_type?: string; start_time?: string | null; stop_time?: string | null },
): Promise<RelationshipRow> {
  return tx(["investigations", "entities", "relationships"], "readwrite", async (stores) => {
    const inv = await getInvestigationOr404(stores, iid);
    const row = (await reqAsPromise(stores.relationships.get(rid))) as
      | RelationshipRow
      | undefined;
    if (row === undefined || row.investigation_id !== iid) {
      throw new StoreError(404, "unknown relationship");
    }
    const next: RelationshipRow = { ...row };
    if (patch.rel_type !== undefined) {
      const source = await getEntityOr404(stores, iid, row.source_id);
      const target = await getEntityOr404(stores, iid, row.target_id);
      const allowed = allowedRelationships(source.stix_type, target.stix_type);
      if (!allowed.includes(patch.rel_type)) {
        throw new StoreError(
          422,
          `relationship '${patch.rel_type}' invalid between ${source.stix_type}` +
            ` and ${target.stix_type} (allowed: ${allowed.join(", ") || "none"})`,
        );
      }
      next.rel_type = patch.rel_type;
    }
    // activity window (#170): an empty string clears the date, hence going
    // through null explicitly rather than a `?? row.start_time` that would
    // make any correction impossible
    if (patch.start_time !== undefined) next.start_time = patch.start_time || null;
    if (patch.stop_time !== undefined) next.stop_time = patch.stop_time || null;
    stores.relationships.put(next);
    touch(stores, inv);
    return next;
  });
}

export async function listRelationships(iid: string): Promise<RelationshipRow[]> {
  return tx(["investigations", "relationships"], "readonly", async (stores) => {
    await getInvestigationOr404(stores, iid);
    return byCreatedAt(await byInvestigation<RelationshipRow>(stores.relationships, iid));
  });
}

/** Returns the deleted row, enough to feed the undo stack. */
export async function deleteRelationship(
  iid: string,
  rid: string,
): Promise<RelationshipRow> {
  return tx(["investigations", "relationships"], "readwrite", async (stores) => {
    const row = (await reqAsPromise(stores.relationships.get(rid))) as
      | RelationshipRow
      | undefined;
    if (row === undefined || row.investigation_id !== iid) {
      throw new StoreError(404, "unknown relationship");
    }
    stores.relationships.delete(rid);
    touch(stores, await getInvestigationOr404(stores, iid));
    return row;
  });
}

/** Puts a deleted relationship back, provided both its ends still exist. */
export async function restoreRelationship(
  iid: string,
  row: RelationshipRow,
): Promise<boolean> {
  return tx(["investigations", "entities", "relationships"], "readwrite", async (stores) => {
    const inv = await getInvestigationOr404(stores, iid);
    const present = new Set(
      (await byInvestigation<EntityRow>(stores.entities, iid)).map((e) => e.id),
    );
    if (!present.has(row.source_id) || !present.has(row.target_id)) return false;
    stores.relationships.put(row);
    touch(stores, inv);
    return true;
  });
}

// --- Notes & opinions --------------------------------------------------------

export interface NoteCreateBody {
  content: string;
  kind?: "note" | "opinion";
  entity_id?: string | null;
  opinion_value?: string;
}

export async function createNote(iid: string, body: NoteCreateBody): Promise<NoteRow> {
  return tx(["investigations", "entities", "notes"], "readwrite", async (stores) => {
    const inv = await getInvestigationOr404(stores, iid);
    if (body.entity_id != null) {
      await getEntityOr404(stores, iid, body.entity_id);
    }
    const kind = body.kind ?? "note";
    if (kind === "opinion" && body.opinion_value == null) {
      throw new StoreError(422, "an opinion must carry an opinion_value");
    }
    const ts = now();
    const row: NoteRow = {
      id: newId(),
      investigation_id: iid,
      entity_id: body.entity_id ?? null,
      kind,
      content: body.content,
      opinion_value: body.opinion_value ?? null,
      created_at: ts,
      updated_at: ts,
    };
    stores.notes.put(row);
    touch(stores, inv);
    return row;
  });
}

export async function listNotes(iid: string): Promise<NoteRow[]> {
  return tx(["investigations", "notes"], "readonly", async (stores) => {
    await getInvestigationOr404(stores, iid);
    return byCreatedAt(await byInvestigation<NoteRow>(stores.notes, iid));
  });
}

/**
 * Records that a bundle has just been downloaded.
 *
 * Does NOT call `touch`: marking the export must not count as a change to the
 * investigation, otherwise it turns up "modified since the last export" at
 * the very moment it is exported.
 */
export async function markExported(
  iid: string,
  fingerprint: string,
  /**
   * `updated_at` of the investigation as of when the bundle was BUILT.
   *
   * That is the freshness marker, not the download time: a canvas changed
   * between building the bundle and the click otherwise went out with an
   * `exported_at` later than its `updated_at`, and the status bar claimed
   * "the bundle on disk matches this canvas" about a file that no longer
   * did.
   */
  sourceUpdatedAt?: string,
): Promise<void> {
  await tx(["investigations"], "readwrite", async (stores) => {
    const inv = await getInvestigationOr404(stores, iid);
    stores.investigations.put({
      ...inv,
      exported_at: now(),
      exported_state_at: sourceUpdatedAt ?? inv.updated_at,
      exported_fingerprint: fingerprint,
    });
  });
}

/** Returns the deleted row, enough to feed the undo stack. */
export async function deleteNote(iid: string, nid: string): Promise<NoteRow> {
  return tx(["investigations", "notes"], "readwrite", async (stores) => {
    const row = (await reqAsPromise(stores.notes.get(nid))) as NoteRow | undefined;
    if (row === undefined || row.investigation_id !== iid) {
      throw new StoreError(404, "unknown note");
    }
    stores.notes.delete(nid);
    touch(stores, await getInvestigationOr404(stores, iid));
    return row;
  });
}

/** Puts a deleted note back, exactly as it was. */
export async function restoreNote(iid: string, row: NoteRow): Promise<void> {
  await tx(["investigations", "notes"], "readwrite", async (stores) => {
    const inv = await getInvestigationOr404(stores, iid);
    stores.notes.put(row);
    touch(stores, inv);
  });
}

/**
 * Pins, moves or unpins a note on the canvas (#136).
 * Local position only: never exported, no effect on updated_at nor on the
 * fingerprint (same contract as entity positions).
 */
export async function pinNote(
  iid: string,
  nid: string,
  position: { x: number; y: number } | null,
): Promise<void> {
  await tx(["investigations", "notes"], "readwrite", async (stores) => {
    await getInvestigationOr404(stores, iid);
    const row = (await reqAsPromise(stores.notes.get(nid))) as NoteRow | undefined;
    if (row === undefined || row.investigation_id !== iid) {
      throw new StoreError(404, "unknown note");
    }
    stores.notes.put({
      ...row,
      position_x: position?.x ?? null,
      position_y: position?.y ?? null,
    });
  });
}

// --- Captures (annotation layer #136) ----------------------------------------
// Images pasted onto the canvas: 100% local, never in the STIX bundle.

export interface CaptureRow {
  id: string;
  investigation_id: string;
  blob: Blob;
  width: number;
  height: number;
  position_x: number;
  position_y: number;
  /** Entities linked by a dashed line (annotation links, not STIX matrix). */
  entity_ids: string[];
  created_at: string;
}

export async function createCapture(
  iid: string,
  body: { blob: Blob; width: number; height: number; x: number; y: number },
): Promise<CaptureRow> {
  requestPersistence();
  return tx(["investigations", "captures"], "readwrite", async (stores) => {
    await getInvestigationOr404(stores, iid);
    const row: CaptureRow = {
      id: newId(),
      investigation_id: iid,
      blob: body.blob,
      width: body.width,
      height: body.height,
      position_x: body.x,
      position_y: body.y,
      entity_ids: [],
      created_at: now(),
    };
    stores.captures.put(row);
    return row;
  });
}

export async function listCaptures(iid: string): Promise<CaptureRow[]> {
  return tx(["investigations", "captures"], "readonly", async (stores) => {
    await getInvestigationOr404(stores, iid);
    return byCreatedAt(await byInvestigation<CaptureRow>(stores.captures, iid));
  });
}

export async function updateCapture(
  iid: string,
  cid: string,
  patch: { x?: number; y?: number; entity_ids?: string[] },
): Promise<CaptureRow> {
  return tx(["investigations", "captures"], "readwrite", async (stores) => {
    await getInvestigationOr404(stores, iid);
    const row = (await reqAsPromise(stores.captures.get(cid))) as CaptureRow | undefined;
    if (row === undefined || row.investigation_id !== iid) {
      throw new StoreError(404, "unknown screenshot");
    }
    const next: CaptureRow = {
      ...row,
      position_x: patch.x ?? row.position_x,
      position_y: patch.y ?? row.position_y,
      entity_ids: patch.entity_ids ?? row.entity_ids,
    };
    stores.captures.put(next);
    return next;
  });
}

export async function deleteCapture(iid: string, cid: string): Promise<void> {
  await tx(["investigations", "captures"], "readwrite", async (stores) => {
    await getInvestigationOr404(stores, iid);
    const row = (await reqAsPromise(stores.captures.get(cid))) as CaptureRow | undefined;
    if (row === undefined || row.investigation_id !== iid) {
      throw new StoreError(404, "unknown screenshot");
    }
    stores.captures.delete(cid);
  });
}

// --- Export / import ---------------------------------------------------------

async function loadState(iid: string): Promise<InvestigationState> {
  return tx(STORES.slice() as StoreName[], "readonly", async (stores) => ({
    investigation: await getInvestigationOr404(stores, iid),
    entities: byCreatedAt(await byInvestigation<EntityRow>(stores.entities, iid)),
    relationships: byCreatedAt(
      await byInvestigation<RelationshipRow>(stores.relationships, iid),
    ),
    notes: byCreatedAt(await byInvestigation<NoteRow>(stores.notes, iid)),
  }));
}

/** Investigation lint (#33): non-blocking diagnostic on the current state. */
export async function lintReport(iid: string) {
  return lintInvestigation(await loadState(iid));
}

interface ExportOptionsInput {
  container?: string;
  tlp?: string;
  author_name?: string | null;
  author_class?: string;
  include_notes?: boolean;
  confidence?: number | null;
}

export async function exportBundle(iid: string, opts: ExportOptionsInput) {
  const state = await loadState(iid);
  const options: ExportOptions = {
    container: (opts.container as ExportOptions["container"]) ?? "report",
    tlp: (opts.tlp as ExportOptions["tlp"]) ?? "amber",
    author_name: opts.author_name ?? null,
    author_class: opts.author_class ?? "organization",
    include_notes: opts.include_notes ?? true,
    confidence: opts.confidence ?? null,
  };
  let result;
  try {
    result = await buildBundle(state, options);
  } catch (exc) {
    if (exc instanceof ExportError) {
      throw new StoreError(422, { problems: exc.problems });
    }
    throw exc;
  }
  // belt and braces: the bundle we produce must match the official OASIS
  // schemas (the equivalent of the backend's stix2 re-parse)
  const problems = await validateObjects(result.bundle.objects);
  if (problems.length > 0) {
    throw new StoreError(422, { problems });
  }
  // `sourceUpdatedAt` travels with the bundle: it is the exact state the
  // bundle stands for, and what the status bar will compare itself against.
  return { ...result, sourceUpdatedAt: state.investigation.updated_at };
}

export async function importBundle(bundle: unknown, name?: string) {
  requestPersistence();
  const { state, report } = importBundleCore(bundle as never, name);
  await tx(STORES.slice() as StoreName[], "readwrite", async (stores) => {
    stores.investigations.put(state.investigation);
    for (const row of state.entities) stores.entities.put(row);
    for (const row of state.relationships) stores.relationships.put(row);
    for (const row of state.notes) stores.notes.put(row);
  });
  const investigation: InvestigationView = {
    ...state.investigation,
    entity_count: state.entities.length,
    relationship_count: state.relationships.length,
  };
  return { investigation, report };
}

// --- Backup / restore (#123) -------------------------------------------------
// Everything lives in IndexedDB, so in THIS browser: one cleared cache and
// the work is gone. The backup file is a full dump of the application state -
// including what STIX cannot carry (triage tray, positions, screen captures,
// scratchpad notes).

const BACKUP_FORMAT = "dmas-backup";
const BACKUP_VERSION = 1;
/** local settings carried into the backup (localStorage) */
const SETTINGS_KEYS = ["dmas.enrich.endpoints", "dmas.export-prefs"];

/** Settings a backup is allowed to OVERWRITE when restoring.
 *
 * `dmas.enrich.endpoints` is deliberately left out: that key holds a sidecar
 * URL AND its token, so a credential. A backup file is a file received from
 * someone else ("my backup of our shared investigation"); restoring it
 * repointed enrichment at the server of whoever made it, without the
 * confirmation ever mentioning settings. Every "Enrich" click then shipped
 * the IOC under analysis over there - that is, what the analyst is digging
 * into, the sensitive artefact in CTI.
 *
 * The export NEVER produces a `settings` block anyway (the option is not
 * wired up in the interface), so the only way for this key to end up in a
 * file is for someone to have put it there by hand.
 * We keep reading the other keys: losing your export preferences when
 * restoring a backup would be a real functional regression.
 */
const RESTORABLE_SETTINGS_KEYS = SETTINGS_KEYS.filter(
  (k) => k !== "dmas.enrich.endpoints",
);

type CaptureBackup = Omit<CaptureRow, "blob"> & {
  blob_base64: string;
  blob_type: string;
};

export interface BackupFile {
  format: string;
  version: number;
  created_at: string;
  investigations: InvestigationRow[];
  entities: EntityRow[];
  relationships: RelationshipRow[];
  notes: NoteRow[];
  captures: CaptureBackup[];
  /** absent if the analyst chose not to embed their settings (tokens) */
  settings?: Record<string, string>;
}

export interface RestoreReport {
  investigations: number;
  replaced: string[];
  entities: number;
  relationships: number;
  notes: number;
  captures: number;
  settings: boolean;
  /** settings found in the file but refused at restore time */
  skippedSettings: number;
  /** file rows attached to no restored investigation */
  skippedRows: number;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // in chunks: String.fromCharCode(...bytes) blows the stack on a capture of
  // a few hundred kilobytes
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function readAll<T>(store: IDBObjectStore): Promise<T[]> {
  return reqAsPromise(store.getAll() as IDBRequest<T[]>);
}

/** Full dump of the local state. `includeSettings` embeds the tokens. */
export async function exportBackup(includeSettings = false): Promise<BackupFile> {
  const rows = await tx(STORES.slice() as StoreName[], "readonly", async (stores) => ({
    investigations: await readAll<InvestigationRow>(stores.investigations),
    entities: await readAll<EntityRow>(stores.entities),
    relationships: await readAll<RelationshipRow>(stores.relationships),
    notes: await readAll<NoteRow>(stores.notes),
    captures: await readAll<CaptureRow>(stores.captures),
  }));

  const captures: CaptureBackup[] = [];
  for (const { blob, ...rest } of rows.captures) {
    captures.push({
      ...rest,
      blob_base64: await blobToBase64(blob),
      blob_type: blob.type || "image/webp",
    });
  }

  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created_at: now(),
    investigations: rows.investigations,
    entities: rows.entities,
    relationships: rows.relationships,
    notes: rows.notes,
    captures,
  };
  if (includeSettings) {
    const settings: Record<string, string> = {};
    for (const key of SETTINGS_KEYS) {
      // localStorage can be missing (tests) or throw (strict private
      // browsing): that must never fail the whole backup
      try {
        const value = localStorage.getItem(key);
        if (value !== null) settings[key] = value;
      } catch {
        /* settings out of reach: back the data up without them */
      }
    }
    file.settings = settings;
  }
  return file;
}

function asBackup(data: unknown): BackupFile {
  const file = data as Partial<BackupFile> | null;
  if (!file || file.format !== BACKUP_FORMAT) {
    throw new StoreError(422, "this file is not a Draw Me A STIX backup");
  }
  if (typeof file.version !== "number" || file.version > BACKUP_VERSION) {
    throw new StoreError(
      422,
      `backup in version ${String(file.version)}: too recent for this application`,
    );
  }
  if (!Array.isArray(file.investigations)) {
    throw new StoreError(422, "unreadable backup: no investigation list");
  }
  return file as BackupFile;
}

/** What restoring would do, without writing anything (for confirmation). */
/** What an already present investigation loses if it gets replaced. */
export interface ReplacedInvestigation {
  name: string;
  entities: number;
  relationships: number;
  notes: number;
  /** current `updated_at`: says whether the work overwritten is newer than the backup */
  updatedAt: string;
}

export async function inspectBackup(data: unknown): Promise<{
  file: BackupFile;
  replaced: ReplacedInvestigation[];
}> {
  const file = asBackup(data);
  const existing = new Map((await listInvestigations()).map((inv) => [inv.id, inv] as const));
  // The dialog announced a COUNT of replaced investigations, never what they
  // hold. Restoring yesterday's backup wiped work done today without saying
  // how many objects and notes were about to vanish.
  const replaced: ReplacedInvestigation[] = [];
  for (const inv of file.investigations) {
    const current = existing.get(inv.id);
    if (current === undefined) continue;
    const notes = await listNotes(inv.id);
    replaced.push({
      name: current.name,
      entities: current.entity_count,
      relationships: current.relationship_count,
      notes: notes.length,
      updatedAt: current.updated_at,
    });
  }
  return { file, replaced };
}

/**
 * Restores a backup: the file's investigations are added, and those already
 * present (same id) are **replaced** together with all their content.
 * Investigations absent from the file are never touched.
 */
/** Does a row belong to an investigation the file is restoring? */
function belongs(row: { investigation_id?: unknown }, targets: Set<string>): boolean {
  return typeof row.investigation_id === "string" && targets.has(row.investigation_id);
}

export async function importBackup(data: unknown): Promise<RestoreReport> {
  const { file, replaced } = await inspectBackup(data);
  requestPersistence();
  /** file rows dropped as orphans: reported, not swallowed */
  let skippedRows = 0;

  const captures = await Promise.all(
    // blob_type comes from the FILE, so from a third party. Harmless today:
    // the only two render sites are <img>, where neither an SVG nor
    // text/html executes. But it becomes stored XSS on our origin the moment
    // we add "open the capture in a tab", a window.open(blobUrl) or a
    // download link. We pin the type to the format compression produces
    // (annotations.ts re-encodes everything to WebP through a canvas),
    // rather than trusting the file.
    // `blob_type` is dropped along with `blob_base64`: it only exists in the
    // file format, and letting it through wrote it to the store as a ghost
    // field no code reads - a third-party value asleep in the database
    // waiting for someone to believe it.
    (file.captures ?? []).map(async ({ blob_base64, blob_type: _ignored, ...rest }) => ({
      ...rest,
      blob: base64ToBlob(blob_base64, "image/webp"),
    })),
  );

  const restored = new Set(file.investigations.map((inv) => inv.id));
  await tx(STORES.slice() as StoreName[], "readwrite", async (stores) => {
    const targets = restored;
    // purge the content of the replaced investigations: without it, an entity
    // deleted since the backup would come back as an orphan
    for (const name of ["entities", "relationships", "notes", "captures"] as const) {
      for (const row of await readAll<{ id: string; investigation_id: string }>(
        stores[name],
      )) {
        if (targets.has(row.investigation_id)) stores[name].delete(row.id);
      }
    }
    for (const inv of file.investigations) stores.investigations.put(inv);
    // `targets` bounded the purge, but NOT the writes: a row whose
    // `investigation_id` is absent from the file landed in an investigation
    // the confirmation dialog never named, while the docstring above promises
    // the opposite. A written promise that is false costs more than the
    // feature it describes.
    for (const row of file.entities ?? []) {
      if (belongs(row, targets)) stores.entities.put(row);
      else skippedRows += 1;
    }
    for (const row of file.relationships ?? []) {
      if (belongs(row, targets)) stores.relationships.put(row);
      else skippedRows += 1;
    }
    for (const row of file.notes ?? []) {
      if (belongs(row, targets)) stores.notes.put(row);
      else skippedRows += 1;
    }
    for (const row of captures) {
      if (belongs(row, targets)) stores.captures.put(row);
      else skippedRows += 1;
    }
  });

  let skippedSettings = 0;
  if (file.settings) {
    for (const [key, value] of Object.entries(file.settings)) {
      if (!RESTORABLE_SETTINGS_KEYS.includes(key)) {
        // counted and reported: the analyst must know the file carried
        // settings we refused to apply
        if (SETTINGS_KEYS.includes(key)) skippedSettings += 1;
        continue;
      }
      if (typeof value !== "string") continue;
      try {
        localStorage.setItem(key, value);
      } catch {
        /* same here: the restored data matters more than the settings */
      }
    }
  }

  return {
    investigations: file.investigations.length,
    replaced: replaced.map((r) => r.name),
    // what was WRITTEN, not what the file held: announcing "12 entities
    // restored" after dropping three would be the same lie, moved one notch
    // along
    entities: (file.entities ?? []).filter((r) => belongs(r, restored)).length,
    relationships: (file.relationships ?? []).filter((r) => belongs(r, restored)).length,
    notes: (file.notes ?? []).filter((r) => belongs(r, restored)).length,
    captures: captures.filter((r) => belongs(r, restored)).length,
    settings: file.settings !== undefined,
    skippedSettings,
    skippedRows,
  };
}
