import { memo, useEffect, useState } from 'react'
import { relationHelp } from '../relationHelp'
import { allowedRelationships } from '../stix/relationships'
import { typeMeta } from '../stixMeta'
import type { Entity, NoteItem } from '../types'
import EntityForm from './EntityForm'
import Icon from './Icon'
import NotesPanel from './NotesPanel'

/**
 * Right-hand panel: editing the selected entity (or the investigation-wide
 * notes). Memoised - it only re-renders when the selection, its notes or
 * the availability of enrichment change, not on every frame of a drag.
 */
export interface SelectedRelation {
  id: string
  relType: string
  source: Entity
  target: Entity
  description: string
  /** STIX activity window, day precision (#170) - '' when not filled in */
  startTime: string
  stopTime: string
}

/**
 * A stored moment split for editing: the day, and the hour when there is one.
 *
 * Accepts what the store holds either way: `2026-08-11` typed here, and the
 * full `2026-08-11T09:12:34.500Z` of an imported bundle. The seconds are not
 * offered, so editing a moment that had some rounds them to the minute; that
 * only happens when somebody edits the field, which is the one case where it
 * is their intent.
 */
function splitMoment(value: string): { day: string; time: string } {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(value)
  return { day: m?.[1] ?? '', time: m?.[2] ?? '' }
}

/**
 * Activity window of a relationship (#170), to the minute when it is known.
 *
 * STIX has no day: `start_time` is an RFC 3339 timestamp, seconds and `Z`
 * required, so a day-only window is exported as midnight UTC. That is the
 * usual compromise and it is why the hour is a SECOND, optional field rather
 * than part of the first: a `datetime-local` would make everybody assert
 * midnight, including the analyst who only knows the day. Empty, nothing is
 * claimed about the hour; filled, it is written down and the chronology reads
 * to the minute.
 *
 * Local state is unavoidable: an `<input type="date">` driven straight from
 * the store is unusable, because a partial entry reads as `''` and the
 * controlled value coming back from the parent wipes the segments being
 * typed. So the entry stays here and only a complete date is committed;
 * clearing the field is committed on blur.
 */
function RelationWindow({
  relationId,
  startTime,
  stopTime,
  onCommit,
}: {
  relationId: string
  startTime: string
  stopTime: string
  onCommit: (patch: { start_time?: string | null; stop_time?: string | null }) => void
}) {
  const [draft, setDraft] = useState({
    start: splitMoment(startTime),
    stop: splitMoment(stopTime),
  })
  // resynced when ANOTHER relationship gets selected, not on every render:
  // otherwise we bring back the very overwrite we are trying to avoid
  useEffect(() => {
    setDraft({ start: splitMoment(startTime), stop: splitMoment(stopTime) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationId])

  /**
   * What the two inputs mean together. The hour is written as UTC, like the
   * day already was: a day alone goes out as midnight UTC, so reading the two
   * fields in two time zones would be the surprise, not the rule.
   */
  const moment = (day: string, time: string): string | null => {
    if (day === '') return null
    return time === '' ? day : `${day}T${time}:00Z`
  }

  const field = (key: 'start' | 'stop', stixKey: 'start_time' | 'stop_time', label: string) => (
    <div className="rel-moment">
      <label>
        {label}
        <input
          type="date"
          value={draft[key].day}
          onChange={(e) => {
            const day = e.target.value
            setDraft((d) => ({ ...d, [key]: { ...d[key], day } }))
            if (day !== '') onCommit({ [stixKey]: moment(day, draft[key].time) })
          }}
          onBlur={(e) => {
            if (e.target.value === '') onCommit({ [stixKey]: null })
          }}
        />
      </label>
      <label>
        Time (UTC)
        <input
          type="time"
          value={draft[key].time}
          disabled={draft[key].day === ''}
          onChange={(e) => {
            const time = e.target.value
            setDraft((d) => ({ ...d, [key]: { ...d[key], time } }))
            onCommit({ [stixKey]: moment(draft[key].day, time) })
          }}
        />
      </label>
    </div>
  )

  return (
    <div className="rel-window">
      {field('start', 'start_time', 'Active from')}
      {field('stop', 'stop_time', 'Until')}
    </div>
  )
}

/** Selected capture ↔ entity annotation link (#136). */
export interface SelectedAnnotation {
  id: string
  entity: Entity
}

function Inspector({
  selected,
  selectedRelation,
  selectedAnnotation,
  selectedNote,
  selectedNoteEntity,
  selectedNotes,
  enrichEnabled,
  onDeleteRelation,
  onUpdateRelation,
  onPinNote,
  onUpdate,
  onGenerateIndicator,
  onEnrich,
  onDuplicate,
  onSendToTriage,
  onDeleteEntity,
  onAddNote,
  onDeleteNote,
}: {
  selected: Entity | undefined
  selectedRelation: SelectedRelation | undefined
  selectedAnnotation: SelectedAnnotation | undefined
  selectedNote: NoteItem | undefined
  selectedNoteEntity: Entity | undefined
  selectedNotes: NoteItem[]
  enrichEnabled: boolean
  onDeleteRelation: (edgeId: string) => void
  onUpdateRelation: (
    relationId: string,
    patch: { rel_type?: string; start_time?: string | null; stop_time?: string | null },
  ) => void
  onPinNote: (note: NoteItem) => void
  onUpdate: (entity: Entity, name: string, props: Record<string, unknown>) => void
  onGenerateIndicator: (entity: Entity) => void
  onEnrich: (entity: Entity) => void
  onDuplicate: (entity: Entity) => void
  onSendToTriage: (entity: Entity) => void
  onDeleteEntity: (entity: Entity) => void
  onAddNote: (
    entityId: string | null,
    content: string,
    kind: 'note' | 'opinion',
    opinionValue?: string,
  ) => void
  onDeleteNote: (note: NoteItem) => void
}) {
  // selected relationship (#129): card + deletion, the entity wins when
  // both are selected (rubber-band selection)
  if (!selected && selectedRelation) {
    const { source, target } = selectedRelation
    // fix the verb without deleting/recreating: the same choices the matrix
    // offered when the relationship was drawn
    const choices = allowedRelationships(source.stix_type, target.stix_type)
    return (
      <aside className="inspector">
        <span className="type-chip">Relationship</span>
        <div className="relation-card">
          <span style={{ color: typeMeta(source.stix_type).color }}>{source.name}</span>
          {choices.length > 1 ? (
            <select
              className="relation-type"
              value={selectedRelation.relType}
              onChange={(e) => onUpdateRelation(selectedRelation.id, { rel_type: e.target.value })}
            >
              {choices.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <code className="relation-verb">{selectedRelation.relType}</code>
          )}
          <span style={{ color: typeMeta(target.stix_type).color }}>{target.name}</span>
        </div>
        {relationHelp(selectedRelation.relType) && (
          <p className="rel-help">{relationHelp(selectedRelation.relType)}</p>
        )}
        {selectedRelation.description && (
          <p className="hint">{selectedRelation.description}</p>
        )}
        {/* activity window (#170): when the relationship held true, not
            when it was drawn. Exported as start_time/stop_time. */}
        <RelationWindow
          relationId={selectedRelation.id}
          startTime={selectedRelation.startTime}
          stopTime={selectedRelation.stopTime}
          onCommit={(patch) => onUpdateRelation(selectedRelation.id, patch)}
        />
        <button
          className="triage-send entity-delete"
          title="Deletes the relationship, not the entities (Delete key works too)"
          onClick={() => onDeleteRelation(selectedRelation.id)}
        >
          <Icon name="trash" />
          Delete relationship
        </button>
      </aside>
    )
  }

  // note card selected on the canvas (#136): the note in full
  if (!selected && selectedNote) {
    return (
      <aside className="inspector">
        <span className="type-chip">
          {selectedNote.kind === 'opinion' ? 'Opinion' : 'Note'}
        </span>
        {selectedNote.kind === 'opinion' && (
          <p className="hint">
            <span className="opinion-badge">{selectedNote.opinion_value}</span>
          </p>
        )}
        <div className="note-full">{selectedNote.content}</div>
        {selectedNoteEntity && (
          <p className="hint">
            Attached to{' '}
            <span style={{ color: typeMeta(selectedNoteEntity.stix_type).color }}>
              {selectedNoteEntity.name}
            </span>
          </p>
        )}
        <button className="triage-send" onClick={() => onPinNote(selectedNote)}>
          <Icon name="minus" />
          Remove from canvas
        </button>
        <button
          className="triage-send entity-delete"
          title="Deletes the note (from the canvas AND the notes panel)"
          onClick={() => onDeleteNote(selectedNote)}
        >
          <Icon name="trash" />
          Delete note
        </button>
      </aside>
    )
  }

  // annotation link (#136): capture ↔ entity, it can be unlinked here
  if (!selected && selectedAnnotation) {
    const { entity } = selectedAnnotation
    return (
      <aside className="inspector">
        <span className="type-chip">Annotation link</span>
        <div className="relation-card">
          <span>capture</span>
          <code className="relation-verb">annotation</code>
          <span style={{ color: typeMeta(entity.stix_type).color }}>{entity.name}</span>
        </div>
        <button
          className="triage-send entity-delete"
          title="Removes the link - the capture and the entity stay (Delete key works too)"
          onClick={() => onDeleteRelation(selectedAnnotation.id)}
        >
          <Icon name="trash" />
          Unlink capture
        </button>
      </aside>
    )
  }

  if (!selected) {
    return (
      <aside className="inspector">
        <p className="empty">
          Select a node to edit it. To create a valid STIX relationship,
          drag a link from a round handle (on the edge of a node) to another
          node.
        </p>
        {/* a note must hang off an entity (#136): no more "global" creation
            here - the working notes are there for that. The ones that came
            from an import stay readable. */}
        {selectedNotes.length > 0 && (
          <NotesPanel
            title="Investigation notes (imported)"
            notes={selectedNotes}
            onAdd={() => undefined}
            onDelete={onDeleteNote}
            onPin={onPinNote}
            canAdd={false}
          />
        )}
      </aside>
    )
  }

  const isSco = typeMeta(selected.stix_type).kind === 'sco'
  return (
    <aside className="inspector">
      <span
        className="type-chip"
        style={{
          color: typeMeta(selected.stix_type).color,
          borderColor: typeMeta(selected.stix_type).color,
        }}
      >
        {typeMeta(selected.stix_type).label}
      </span>
      <EntityForm
        // `updated_at` used to be part of this key: any change to the entity,
        // wherever it came from, remounted the form and threw away whatever
        // was being typed. The form now resyncs on its own, and only when
        // there is nothing to lose. So the key keeps only what really
        // warrants a remount: switching to another entity.
        key={selected.id}
        stixType={selected.stix_type}
        initialName={selected.name}
        initialProperties={selected.properties}
        submitLabel="Save"
        onSubmit={(name, props) => onUpdate(selected, name, props)}
      />
      {isSco && (
        <button
          className="triage-send"
          title="Creates an indicator with the STIX pattern of this observable, linked with based-on"
          onClick={() => onGenerateIndicator(selected)}
        >
          <Icon name="target" />
          Generate an indicator
        </button>
      )}
      {(isSco || selected.stix_type === 'vulnerability') && enrichEnabled && (
        <button
          className="triage-send"
          title="Passive discovery (DNS, subdomains, CVE description…) - candidates go to the triage tray, attributes to notes"
          onClick={() => onEnrich(selected)}
        >
          <Icon name="search" />
          Enrich
        </button>
      )}
      <button
        className="triage-send"
        title="Copies the type, properties and notes - not the relationships. Only the value is left to change."
        onClick={() => onDuplicate(selected)}
      >
        <Icon name="duplicate" />
        Duplicate
      </button>
      <button className="triage-send" onClick={() => onSendToTriage(selected)}>
        <Icon name="return" />
        Send back to triage
      </button>
      <button
        className="triage-send entity-delete"
        title="Deletes the entity, its relationships and its notes (Delete key works too)"
        onClick={() => onDeleteEntity(selected)}
      >
        <Icon name="trash" />
        Delete entity
      </button>
      <NotesPanel
        title="Notes on this entity"
        notes={selectedNotes}
        onAdd={(content, kind, op) => onAddNote(selected.id, content, kind, op)}
        onDelete={onDeleteNote}
        onPin={onPinNote}
      />
    </aside>
  )
}

export default memo(Inspector)
