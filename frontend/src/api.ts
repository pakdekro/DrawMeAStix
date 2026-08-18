/**
 * Data access layer of the app - local-first.
 *
 * Historically a REST client to the FastAPI backend; since the local-first
 * pivot (#40), every operation is served by the IndexedDB store (store.ts)
 * and the embedded STIX logic (stix/). The public interface is unchanged:
 * the components did not have to move.
 */

import type {
  CaptureItem,
  Entity,
  ExportResult,
  ImportResult,
  Investigation,
  NoteItem,
  Relationship,
} from './types'
import type { NoteRow, RelationshipRow } from './stix/types'
import * as store from './store'
import { allowedRelationships } from './stix/relationships'

export { StoreError as ApiError } from './store'

export const api = {
  listInvestigations: (): Promise<Investigation[]> => store.listInvestigations(),
  createInvestigation: (name: string, description = ''): Promise<Investigation> =>
    store.createInvestigation(name, description),
  getInvestigation: (id: string): Promise<Investigation> => store.getInvestigation(id),
  updateInvestigation: (
    id: string,
    patch: Partial<Pick<Investigation, 'name' | 'description'>>,
  ): Promise<Investigation> => store.updateInvestigation(id, patch),
  deleteInvestigation: (id: string): Promise<void> => store.deleteInvestigation(id),
  saveScratchpad: (id: string, text: string): Promise<void> =>
    store.saveScratchpad(id, text),
  saveLayoutBackup: (
    id: string,
    positions: Record<string, { x: number; y: number }> | null,
  ): Promise<void> => store.saveLayoutBackup(id, positions),

  listEntities: (iid: string): Promise<Entity[]> =>
    store.listEntities(iid) as Promise<Entity[]>,
  createEntity: (
    iid: string,
    body: Partial<Entity> & { stix_type: string; name: string },
  ): Promise<Entity> => store.createEntity(iid, body as store.EntityCreateBody) as Promise<Entity>,
  updateEntity: (iid: string, eid: string, patch: Partial<Entity>): Promise<Entity> =>
    store.updateEntity(iid, eid, patch as Partial<store.EntityCreateBody>) as Promise<Entity>,
  /** Returns the cascade snapshot: what it takes to undo the deletion. */
  deleteEntity: (iid: string, eid: string): Promise<store.EntitySnapshot> =>
    store.deleteEntity(iid, eid),
  restoreEntity: (iid: string, snap: store.EntitySnapshot): Promise<void> =>
    store.restoreEntity(iid, snap),
  mergeEntities: (
    iid: string,
    duplicateId: string,
    targetId: string,
  ): Promise<{ relations: number; notes: number }> =>
    store.mergeEntities(iid, duplicateId, targetId),
  savePositions: (
    iid: string,
    positions: Record<string, { x: number; y: number }>,
  ): Promise<{ updated: number }> => store.savePositions(iid, positions),

  listRelationships: (iid: string): Promise<Relationship[]> => store.listRelationships(iid),
  createRelationship: (
    iid: string,
    body: { source_id: string; target_id: string; rel_type: string; description?: string },
  ): Promise<Relationship> => store.createRelationship(iid, body),
  updateRelationship: (
    iid: string,
    rid: string,
    patch: { rel_type?: string; start_time?: string | null; stop_time?: string | null },
  ): Promise<Relationship> => store.updateRelationship(iid, rid, patch),
  deleteRelationship: (iid: string, rid: string): Promise<RelationshipRow> =>
    store.deleteRelationship(iid, rid),
  restoreRelationship: (iid: string, row: RelationshipRow): Promise<boolean> =>
    store.restoreRelationship(iid, row),

  listNotes: (iid: string): Promise<NoteItem[]> => store.listNotes(iid),
  createNote: (
    iid: string,
    body: { content: string; kind?: string; entity_id?: string | null; opinion_value?: string },
  ): Promise<NoteItem> => store.createNote(iid, body as store.NoteCreateBody),
  deleteNote: (iid: string, nid: string): Promise<NoteRow> => store.deleteNote(iid, nid),
  restoreNote: (iid: string, row: NoteRow): Promise<void> => store.restoreNote(iid, row),
  markExported: (iid: string, fingerprint: string, sourceUpdatedAt?: string): Promise<void> =>
    store.markExported(iid, fingerprint, sourceUpdatedAt),
  pinNote: (
    iid: string,
    nid: string,
    position: { x: number; y: number } | null,
  ): Promise<void> => store.pinNote(iid, nid, position),

  createCapture: (
    iid: string,
    body: { blob: Blob; width: number; height: number; x: number; y: number },
  ): Promise<CaptureItem> => store.createCapture(iid, body),
  listCaptures: (iid: string): Promise<CaptureItem[]> => store.listCaptures(iid),
  updateCapture: (
    iid: string,
    cid: string,
    patch: { x?: number; y?: number; entity_ids?: string[] },
  ): Promise<CaptureItem> => store.updateCapture(iid, cid, patch),
  deleteCapture: (iid: string, cid: string): Promise<void> => store.deleteCapture(iid, cid),

  allowedRelationships: (
    sourceType: string,
    targetType: string,
  ): Promise<{ relationships: string[] }> =>
    Promise.resolve({ relationships: allowedRelationships(sourceType, targetType) }),

  lintInvestigation: (iid: string) => store.lintReport(iid),
  exportBundle: (
    iid: string,
    opts: {
      container?: string
      tlp?: string
      author_name?: string | null
      include_notes?: boolean
      confidence?: number | null
    },
  ): Promise<ExportResult> => store.exportBundle(iid, opts) as Promise<ExportResult>,
  importBundle: (bundle: unknown, name?: string): Promise<ImportResult> =>
    store.importBundle(bundle, name),

  exportBackup: (includeSettings?: boolean) => store.exportBackup(includeSettings),
  inspectBackup: (data: unknown) => store.inspectBackup(data),
  importBackup: (data: unknown) => store.importBackup(data),
}
