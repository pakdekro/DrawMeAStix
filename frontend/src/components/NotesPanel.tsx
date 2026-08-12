import { useState } from 'react'
import type { NoteItem } from '../types'
import Icon from './Icon'

const OPINIONS = ['strongly-disagree', 'disagree', 'neutral', 'agree', 'strongly-agree']

interface Props {
  notes: NoteItem[]
  title: string
  onAdd: (content: string, kind: 'note' | 'opinion', opinionValue?: string) => void
  onDelete: (note: NoteItem) => void
  /** Pins/unpins the note on the canvas (#136). */
  onPin: (note: NoteItem) => void
  /** false = read only (imported investigation notes, #136). */
  canAdd?: boolean
}

/** Notes and opinions attached to an entity (or to the investigation). */
export default function NotesPanel({
  notes,
  title,
  onAdd,
  onDelete,
  onPin,
  canAdd = true,
}: Props) {
  const [content, setContent] = useState('')
  const [kind, setKind] = useState<'note' | 'opinion'>('note')
  const [opinion, setOpinion] = useState('neutral')

  const submit = () => {
    if (!content.trim()) return
    onAdd(content.trim(), kind, kind === 'opinion' ? opinion : undefined)
    setContent('')
  }

  return (
    <div className="notes-panel">
      <h4>{title}</h4>
      {notes.length === 0 && <p className="hint">No note.</p>}
      {notes.map((n) => (
        <div key={n.id} className={`note-card ${n.kind}`}>
          {n.kind === 'opinion' && <span className="opinion-badge">{n.opinion_value}</span>}
          <p>{n.content}</p>
          <button
            className={`note-pin${n.position_x != null ? ' pinned' : ''}`}
            title={n.position_x != null ? 'Detach from canvas' : 'Pin on the canvas'}
            onClick={() => onPin(n)}
          >
            <Icon name="layout" size={13} />
          </button>
          <button className="note-delete" title="Delete" onClick={() => onDelete(n)}>
            <Icon name="cross" size={13} />
          </button>
        </div>
      ))}
      {canAdd && (
      <div className="note-form">
        <textarea
          rows={2}
          placeholder={kind === 'note' ? 'New note…' : 'Rationale for the opinion…'}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="note-form-row">
          <select value={kind} onChange={(e) => setKind(e.target.value as 'note' | 'opinion')}>
            <option value="note">note</option>
            <option value="opinion">opinion</option>
          </select>
          {kind === 'opinion' && (
            <select value={opinion} onChange={(e) => setOpinion(e.target.value)}>
              {OPINIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
          <button className="primary" disabled={!content.trim()} onClick={submit}>
            Add
          </button>
        </div>
        <p className="hint">
          Exported in the bundle as STIX `note` / `opinion` objects.
        </p>
      </div>
      )}
    </div>
  )
}
