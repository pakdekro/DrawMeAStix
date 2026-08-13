import { useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import type { LintFinding } from '../lint'
import type { ExportResult, Investigation } from '../types'
import Icon from './Icon'
import Modal from './Modal'

interface Props {
  investigation: Investigation
  onClose: () => void
  /** tells the Workspace the investigation has just been exported */
  onExported: () => void
}

// Export choices remembered (#125): TLP, author and confidence are analyst
// settings, not investigation settings - they are found again from one
// session to the next.
const PREFS_KEY = 'dmas.export-prefs'

interface ExportPrefs {
  tlp: string
  author: string
  confidence: string
}

function loadPrefs(): ExportPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<ExportPrefs>
    return { tlp: raw.tlp ?? 'amber', author: raw.author ?? '', confidence: raw.confidence ?? '75' }
  } catch {
    return { tlp: 'amber', author: '', confidence: '75' }
  }
}

/** Export panel: options, preview, version fingerprint, download. */
export default function ExportDialog({ investigation, onClose, onExported }: Props) {
  const [prefs] = useState(loadPrefs)
  const [container, setContainer] = useState<'report' | 'grouping'>('report')
  const [tlp, setTlp] = useState(prefs.tlp)
  const [author, setAuthor] = useState(prefs.author)
  const [confidence, setConfidence] = useState(prefs.confidence)
  const [includeNotes, setIncludeNotes] = useState(true)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [lint, setLint] = useState<LintFinding[]>([])

  useEffect(() => {
    api
      .lintInvestigation(investigation.id)
      .then(setLint)
      .catch(() => setLint([]))
  }, [investigation.id])

  // changing an option invalidates the bundle already generated: otherwise
  // one could download a file that no longer matches the options on screen
  useEffect(() => {
    setResult(null)
    setProblems([])
  }, [container, tlp, author, confidence, includeNotes])

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ tlp, author, confidence }))
  }, [tlp, author, confidence])

  const generate = async () => {
    setBusy(true)
    setProblems([])
    setResult(null)
    try {
      const res = await api.exportBundle(investigation.id, {
        container,
        tlp,
        author_name: author.trim() || null,
        include_notes: includeNotes,
        confidence: confidence === 'none' ? null : parseInt(confidence, 10),
      })
      setResult(res)
    } catch (e) {
      if (e instanceof ApiError && typeof e.detail === 'object' && e.detail !== null) {
        const d = e.detail as { problems?: string[] }
        setProblems(d.problems ?? [String(e)])
      } else {
        setProblems([String(e)])
      }
    } finally {
      setBusy(false)
    }
  }

  const download = () => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result.bundle, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${investigation.name.replace(/[^a-zA-Z0-9à-ÿÀ-Ÿ _-]/g, '')}.stix.json`
    a.click()
    URL.revokeObjectURL(url)
    // the DOWNLOAD is what counts as an export, not opening the dialog:
    // opening then cancelling must not suggest that the saved file exists
    // `sourceUpdatedAt` and not the click time: the freshness marker has to
    // name the state the file holds, not the moment it was sent out.
    void api
      .markExported(investigation.id, result.fingerprint, result.sourceUpdatedAt)
      .then(onExported)
  }

  return (
    <Modal title="Export the STIX 2.1 bundle" onClose={onClose} wide>

      {lint.length > 0 && (
        <div className="lint-panel">
          <strong>Lint - what would make the bundle cleaner:</strong>
          <ul>
            {lint.map((f, i) => (
              <li key={i} className={f.level === 'warn' ? 'lint-warn' : 'lint-info'}>
                <Icon name={f.level === 'warn' ? 'warning' : 'info'} size={13} /> {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="export-options">
        <div>
          <label>Container</label>
          <select
            value={container}
            onChange={(e) => setContainer(e.target.value as 'report' | 'grouping')}
          >
            <option value="report">report (finished product)</option>
            <option value="grouping">grouping (investigation in progress)</option>
          </select>
        </div>
        <div>
          <label>TLP</label>
          <select value={tlp} onChange={(e) => setTlp(e.target.value)}>
            <option value="clear">TLP:CLEAR</option>
            <option value="green">TLP:GREEN</option>
            <option value="amber">TLP:AMBER</option>
            <option value="red">TLP:RED</option>
            <option value="none">no marking</option>
          </select>
        </div>
        <div>
          <label>Confidence</label>
          <select value={confidence} onChange={(e) => setConfidence(e.target.value)}>
            <option value="none">none (the platform will decide)</option>
            <option value="15">15 - low</option>
            <option value="50">50 - medium</option>
            <option value="75">75 - high (analyst curation)</option>
            <option value="100">100 - certain</option>
          </select>
        </div>
      </div>
      <p className="hint">
        Confidence arbitrates updates at import time: a platform that uses it
        will not replace data carrying a higher confidence. 75 makes your
        curation win over most automated feeds. A confidence or TLP set on an
        entity (inspector) takes precedence over these export values.
      </p>
      <label>Author (`created_by_ref` identity, optional)</label>
      <input
        placeholder="My CERT"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
      />
      <label className="checkbox-row">
        <input
          type="checkbox"
          className="checkbox"
          checked={includeNotes}
          onChange={(e) => setIncludeNotes(e.target.checked)}
        />{' '}
        Include notes and opinions
      </label>

      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button className="primary" onClick={generate} disabled={busy}>
          {busy ? 'Generating…' : 'Generate the bundle'}
        </button>
      </div>

      {problems.length > 0 && (
        <div className="export-problems">
          <strong>Export impossible :</strong>
          <ul>
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <div className="export-result">
          <p className="fingerprint" title="Version fingerprint: identical for two analysts looking at the same state (canvas positions do not count)">
            {result.fingerprint}
          </p>
          {result.warnings.map((w, i) => (
            <p key={i} className="hint">
              <Icon name="warning" size={13} /> {w}
            </p>
          ))}
          <p className="hint">
            {(result.bundle.objects as unknown[]).length} STIX objects in the bundle.
          </p>
          {/* Said where it counts: it is on re-import that one discovers a
              renamed object arriving as a second object (#225). */}
          <p className="hint">
            Identifiers are computed from each object's properties, so re-importing
            updates rather than duplicates.{' '}
            <a href="/about#identifiers" target="_blank" rel="noreferrer">
              What that implies
            </a>
          </p>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button className="primary" onClick={download}>
              Download the .json
            </button>
            <button onClick={() => setShowPreview((s) => !s)}>
              {showPreview ? 'Hide' : 'Preview'}
            </button>
          </div>
          {showPreview && (
            <pre className="bundle-preview">
              {JSON.stringify(result.bundle, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="actions">
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
