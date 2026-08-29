/**
 * The analyst's reasoning, on its way into a report.
 *
 * The odd thing this fixes is which way round it was. Notes and opinions
 * already reach the STIX bundle, as `note` and `opinion` objects, and by
 * default: a receiving platform gets your doubts. They did not reach the
 * MARKDOWN or the PDF, which carried the graph and the narrative and nothing
 * else. So the machine was told "the evidence stays thin, do not publish as
 * is", and the colleague reading the report was not.
 *
 * The two outputs answer to different people and should each be allowed to
 * carry this, on the analyst's say-so, which is a checkbox in both dialogs.
 * What they must never do is print a doubt in the same voice as a finding.
 * The heading names them, they are quoted, and an opinion says it is one:
 * three signals, which is enough. A fourth sentence explaining the section to
 * its reader was written and then removed, as nagging.
 */

export interface ReportNote {
  /** the object it is about; null when the analyst wrote it about the case */
  entityId: string | null
  kind: 'note' | 'opinion'
  /** the STIX opinion scale value, when it is an opinion */
  value: string | null
  content: string
}

export interface ReportSubject {
  id: string
  stix_type: string
  name: string
}

export interface NoteGroup {
  /** null for the notes that belong to no object in particular */
  subject: ReportSubject | null
  notes: ReportNote[]
}

/**
 * Notes gathered under the object they are about, in the order the objects
 * appear in the report, so the reader meets them where they met the object.
 *
 * A note whose object is not in the report lands in the trailing group rather
 * than being dropped. It cannot normally happen, and losing what the analyst
 * wrote is the one outcome this whole thing exists to prevent.
 */
export function groupNotes(notes: ReportNote[], entities: ReportSubject[]): NoteGroup[] {
  const known = new Map(entities.map((e) => [e.id, e]))
  const groups: NoteGroup[] = []
  const index = new Map<string, NoteGroup>()

  for (const entity of entities) {
    const mine = notes.filter((n) => n.entityId === entity.id)
    if (mine.length === 0) continue
    const group: NoteGroup = { subject: entity, notes: mine }
    groups.push(group)
    index.set(entity.id, group)
  }

  const loose = notes.filter((n) => n.entityId === null || !known.has(n.entityId))
  if (loose.length > 0) groups.push({ subject: null, notes: loose })
  return groups
}

/** "Opinion: agree", or just "Opinion" when the scale was left empty. */
export function opinionLabel(note: ReportNote): string {
  return note.value ? `Opinion: ${note.value.replace(/-/g, ' ')}` : 'Opinion'
}
