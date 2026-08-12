import { useRef, useState } from 'react'
import { api } from '../api'
import Icon from './Icon'

/**
 * Working scratchpad (#29): collapsible panel at the bottom of the screen,
 * free-form notes per investigation, autosaved. Strictly local: never
 * exported in the bundle, and saving it does not move the version
 * fingerprint - distinct from the STIX notes/opinions of the right panel.
 */
export default function WorkNotes({
  investigationId,
  initialText,
}: {
  investigationId: string
  initialText: string
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(initialText)
  const [saved, setSaved] = useState(true)
  const timer = useRef<number | null>(null)

  // No resync effect here. There used to be one, keyed on `initialText`: on
  // every reload of the investigation - and there is one after an undo, an
  // import, a candidate acceptance - it rewrote the textarea with the stored
  // version, silently wiping whatever the analyst had been typing since the
  // last deferred save.
  //
  // This component is only mounted once the investigation is loaded, and the
  // parent gives it `key={iid}`: switching investigation remounts it, which
  // resets the state cleanly. So there is nothing to resync.

  const onChange = (value: string) => {
    setText(value)
    setSaved(false)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      api
        .saveScratchpad(investigationId, value)
        .then(() => setSaved(true))
        .catch(() => undefined)
    }, 600)
  }

  return (
    <div className={`worknotes ${open ? 'open' : ''}`}>
      <button className="worknotes-header" onClick={() => setOpen((o) => !o)}>
        <Icon name="note" size={15} /> Working notes
        {text.trim() && !open ? <span className="worknotes-dot" /> : null}
        <span className="worknotes-info">never exported</span>
        <span className="spacer" />
        {!saved && <span className="worknotes-saving">saving…</span>}
        <Icon name={open ? 'chevron-down' : 'chevron-up'} size={14} />
      </button>
      {open && (
        <textarea
          className="worknotes-text"
          placeholder="Draft, hypotheses, TODO - everything that must not end up in the STIX."
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
