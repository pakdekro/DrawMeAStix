/**
 * Data shapes of the local-first STIX core.
 *
 * The "rows" mirror the historical SQLite schema column for column
 * (backend/app/db.py): the IndexedDB store (#40) and the golden vectors
 * share this representation, which is what makes the builder testable
 * against the output of the reference Python backend.
 */

export interface InvestigationRow {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  /**
   * The analyst's working notes (#29): strictly local, NEVER exported in
   * the bundle - the builder does not read this field, and saving it does
   * not touch updated_at (the fingerprint stays put).
   */
  scratchpad?: string;
  /**
   * Where the analyst had put the objects before they started trying the
   * canvas arrangements (#-, Arrange menu).
   *
   * Local like `scratchpad`, and for the same reasons: the builder does not
   * read it and writing it does not touch `updated_at`. It lives here rather
   * than in React state because it used to, and a page reload turned a
   * reversible detour into a permanent rearrangement.
   */
  layout_backup?: Record<string, { x: number; y: number }>;
  /**
   * Last STIX export actually downloaded (#-, status bar).
   *
   * Like `scratchpad`, these fields are not read by the builder and writing
   * them does not touch `updated_at`: recording an export must not make the
   * investigation look "modified since the last export".
   */
  exported_at?: string;
  /** `updated_at` of the state actually exported: freshness marker */
  exported_state_at?: string;
  exported_fingerprint?: string;
}

type EntityStatus = "candidate" | "confirmed";

export interface EntityRow {
  id: string;
  investigation_id: string;
  stix_type: string;
  name: string;
  /** Serialized JSON, like the SQLite `properties` column. */
  properties: string;
  status: EntityStatus;
  source: string;
  position_x: number;
  position_y: number;
  created_at: string;
  updated_at: string;
  /**
   * Local only, NEVER exported (neither in the STIX nor in the fingerprint):
   * marks an entity that came in "already confirmed" via our layout extension,
   * so without passing through the triage tray. The lint flags it before an
   * export - guard against a third-party bundle forging our extension (#37/audit).
   */
  imported?: boolean;
}

export interface RelationshipRow {
  id: string;
  investigation_id: string;
  source_id: string;
  target_id: string;
  rel_type: string;
  description: string;
  start_time: string | null;
  stop_time: string | null;
  created_at: string;
}

type NoteKind = "note" | "opinion";

export interface NoteRow {
  id: string;
  investigation_id: string;
  entity_id: string | null;
  kind: NoteKind;
  content: string;
  opinion_value: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Pinned position on the canvas (#136), local only: never exported in the
   * bundle, never in the fingerprint. null/absent = not on the canvas.
   */
  position_x?: number | null;
  position_y?: number | null;
}

export interface InvestigationState {
  investigation: InvestigationRow;
  entities: EntityRow[];
  relationships: RelationshipRow[];
  notes: NoteRow[];
}

export interface ExportOptions {
  container: "report" | "grouping";
  tlp: "clear" | "white" | "green" | "amber" | "red" | "none";
  author_name: string | null;
  author_class: string;
  include_notes: boolean;
  /**
   * Confidence (0-100) put on every exported object that does not already
   * carry one; null = emit nothing (the importing platform decides alone).
   */
  confidence: number | null;
}
