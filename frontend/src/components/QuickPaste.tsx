import { useMemo, useState } from 'react'
import { detectIocs } from '../ioc'
import type { DetectedIoc } from '../ioc'
import { typeMeta } from '../stixMeta'
import Modal from './Modal'

/**
 * Quick paste (#31): paste a text (defanged or not), the IOCs are detected
 * and typed on the fly - a single one goes straight to the canvas, several
 * go through the triage tray.
 */
export default function QuickPaste({
  onAdd,
  onCancel,
}: {
  onAdd: (iocs: DetectedIoc[]) => void
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const { iocs, unrecognized } = useMemo(() => detectIocs(text), [text])

  return (
    <Modal title="Paste IOCs" onClose={onCancel}>
      <p className="hint">
        IPs, domains, URLs, emails, hashes, AS numbers - defanged or not
        (hxxp, [.]…). A single IOC lands on the canvas; several go through
        the triage tray.
      </p>
      <textarea
        autoFocus
        rows={6}
        placeholder={'203.0.113.5\nevil[.]example\nhxxps://evil[.]example/payload\n44d88612fea8a8f36de82e1278abb02f'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {iocs.length > 0 && (
        <div className="paste-preview">
          {iocs.map((ioc) => (
            <div key={`${ioc.stix_type}|${ioc.name}`} className="paste-row">
              <span className="dot" style={{ background: typeMeta(ioc.stix_type).color }} />
              <span className="paste-type">{typeMeta(ioc.stix_type).label}</span>
              <span className="paste-value" title={ioc.name}>
                {ioc.name}
              </span>
            </div>
          ))}
        </div>
      )}
      {unrecognized.length > 0 && (
        <p className="hint">
          Not recognised (ignored): {unrecognized.slice(0, 5).join(', ')}
          {unrecognized.length > 5 ? ` … (+${unrecognized.length - 5})` : ''}
        </p>
      )}
      <div className="actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={iocs.length === 0} onClick={() => onAdd(iocs)}>
          Add {iocs.length > 0 ? `(${iocs.length})` : ''}
        </button>
      </div>
    </Modal>
  )
}
