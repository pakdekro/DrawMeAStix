export interface Investigation {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
  /** local working notes, never exported (#29) */
  scratchpad?: string
  /** positions from before the analyst started trying arrangements */
  layout_backup?: Record<string, { x: number; y: number }>
  /** date of the last STIX export actually downloaded */
  exported_at?: string
  /** `updated_at` of the state this bundle represents (see markExported) */
  exported_state_at?: string
  /** fingerprint of the bundle downloaded then (see markExported) */
  exported_fingerprint?: string
  entity_count: number
  relationship_count: number
}

export interface Entity {
  id: string
  investigation_id: string
  stix_type: string
  name: string
  properties: Record<string, unknown>
  status: 'candidate' | 'confirmed'
  source: string
  position_x: number
  position_y: number
  created_at: string
  updated_at: string
}

export interface Relationship {
  id: string
  investigation_id: string
  source_id: string
  target_id: string
  rel_type: string
  description: string
  start_time: string | null
  stop_time: string | null
  created_at: string
}

export interface NoteItem {
  id: string
  investigation_id: string
  entity_id: string | null
  kind: 'note' | 'opinion'
  content: string
  opinion_value: string | null
  created_at: string
  updated_at: string
  /** Pinned on the canvas (#136): null/absent = not on the canvas. */
  position_x?: number | null
  position_y?: number | null
}

/** Screenshot pasted onto the canvas (#136) - local, never exported. */
export interface CaptureItem {
  id: string
  investigation_id: string
  blob: Blob
  width: number
  height: number
  position_x: number
  position_y: number
  entity_ids: string[]
  created_at: string
}

export interface ExportResult {
  bundle: Record<string, unknown>
  fingerprint: string
  warnings: string[]
  /**
   * `updated_at` of the investigation as this bundle represents it.
   *
   * This is the freshness marker, not the download time: that one is always
   * later than any change made before it, and so turned the status bar green
   * on an already stale file.
   */
  sourceUpdatedAt?: string
}

export interface ImportResult {
  investigation: Investigation
  report: {
    entities: number
    relationships: number
    notes: number
    skipped: Record<string, number>
    warnings: string[]
  }
}
