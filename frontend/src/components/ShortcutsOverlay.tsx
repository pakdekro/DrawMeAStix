/**
 * Shortcut cheat sheet, opened with "?" from the canvas (#190).
 *
 * Deliberately kept apart from the STIX guide: this sheet is read IN THE
 * MIDDLE of the work, one hand on the keyboard, to find a forgotten key. The
 * guide is read before starting. Merging them would give a document too long
 * for one use and too thin for the other.
 *
 * "?" and not "F1": the character comes out of what is typed, so it is the
 * same on AZERTY and QWERTY, where a physical key code is not.
 */

import { useEffect, useMemo } from 'react'
import { HELP_KEY, SHORTCUT_GROUPS, isMac, keyLabel } from '../shortcuts'
import Modal from './Modal'

export default function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const mac = useMemo(() => isMac(), [])

  // Esc, focus and the backdrop are handled by <Modal>. What is left here is
  // this sheet's one quirk: "?" closes it too, the key that opens has to
  // close, or you go hunting for Esc while still holding Shift.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === HELP_KEY) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} wide className="shortcuts">
      <div className="shortcut-groups">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} className="shortcut-group">
            <h3 className="micro">{group.title}</h3>
            <p className="shortcut-scope">{group.scope}</p>
            <dl>
              {group.shortcuts.map((s) => (
                <div key={s.keys.join('+')} className="shortcut-row">
                  <dt>
                    <Keys keys={s.keys} mac={mac} />
                    {s.alt && (
                      <>
                        <span className="shortcut-or">or</span>
                        <Keys keys={s.alt} mac={mac} />
                      </>
                    )}
                  </dt>
                  <dd>
                    {s.what}
                    {s.note && <span className="shortcut-note">{s.note}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="hint">
        New to STIX? The{' '}
        <a href="#/guide" onClick={onClose}>
          object and relationship guide
        </a>{' '}
        explains what you can link to what, and why.
      </p>
      <div className="actions">
        <button className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}

function Keys({ keys, mac }: { keys: string[]; mac: boolean }) {
  return (
    <span className="shortcut-keys">
      {keys.map((k) => (
        <span key={k} className="kbd">
          {keyLabel(k, mac)}
        </span>
      ))}
    </span>
  )
}
