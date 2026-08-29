import { useState } from 'react'
import type { Node } from '@xyflow/react'
import { buildNarrative, type NarrEntity, type NarrRelation } from '../narrative'
import { buildMarkdown } from '../export-markdown'
import type { ReportNote } from '../report'
import {
  captureGraph,
  composeReport,
  downloadBlob,
  downloadUrl,
  fileSlug,
  graphToPdf,
  withFooter,
  type ImageFormat,
} from '../export-image'
import Modal from './Modal'

/**
 * Something a reader can act on, whatever was thrown.
 *
 * The capture loads its rendering through an `<img>`, and a browser that
 * refuses it rejects with an `Event`, not an `Error`. That carries no
 * `message`, so the dialog printed the literal string "[object Event]" at the
 * analyst: nothing to act on, and nothing to search for either.
 *
 * The message points at the serving policy without pretending to know which
 * rule bit. It was written after guessing wrong once: a violation raised
 * inside an SVG loaded as an image is not reported to the page that embeds it,
 * so the browser console stays silent and only the operator can tell.
 */
function readable(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof Event !== 'undefined' && e instanceof Event) {
    return (
      'The rendering could not be loaded. If this instance is self-hosted, the ' +
      'Content-Security-Policy serving it is the usual cause: the capture needs ' +
      "`connect-src blob:` to read pasted screenshots, and `font-src data:` for the typeface."
    )
  }
  return String(e)
}

/**
 * Visual export (#17): a "photo" of the canvas (WYSIWYG, the analyst's layout
 * is preserved) as PNG / JPG / PDF, graph alone or graph + narrative. Markdown
 * is the odd one out: the graph is redrawn as mermaid, not captured.
 */
export default function ImageExportDialog({
  title,
  nodes,
  entities,
  relations,
  notes,
  onClose,
}: {
  title: string
  nodes: Node[]
  entities: NarrEntity[]
  relations: NarrRelation[]
  /** the analyst's notes and opinions, for the human outputs only */
  notes: ReportNote[]
  onClose: () => void
}) {
  const [format, setFormat] = useState<'png' | 'jpeg' | 'pdf' | 'md'>('png')
  const [withNarrative, setWithNarrative] = useState(false)
  /**
   * Off by default, like the narrative. A report is sometimes for a colleague
   * and sometimes for a customer, and the analyst is the only one who knows
   * which of the two is reading their doubts.
   */
  const [withNotes, setWithNotes] = useState(false)
  const mine = withNotes ? notes : []
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bg = () =>
    getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#1f1f28'

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const slug = fileSlug(title)
      if (format === 'md') {
        const md = buildMarkdown(title, entities, relations, withNarrative, mine)
        downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${slug}.md`)
        onClose()
        return
      }
      const narr = buildNarrative(entities, relations)
      if (format === 'pdf') {
        // JPEG for the embedded image: a far lighter PDF than PNG would give
        const graph = await captureGraph(nodes, 'jpeg', bg())
        downloadBlob(
          await graphToPdf(graph, title, withNarrative ? narr : null, mine, entities),
          `${slug}.pdf`,
        )
      } else {
        const imgFormat = format as ImageFormat
        const ext = imgFormat === 'jpeg' ? 'jpg' : 'png'
        if (withNarrative || withNotes) {
          const graph = await captureGraph(nodes, 'png', bg())
          downloadUrl(
            await composeReport(
              graph,
              title,
              withNarrative ? narr : null,
              imgFormat,
              bg(),
              mine,
              entities,
            ),
            `${slug}-rapport.${ext}`,
          )
        } else {
          const graph = await captureGraph(nodes, 'png', bg())
          downloadUrl(await withFooter(graph, imgFormat, bg()), `${slug}.${ext}`)
        }
      }
      onClose()
    } catch (e) {
      setError(readable(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Export the graph" onClose={onClose}>
      {nodes.length === 0 && <p className="hint">The graph is empty, nothing to export.</p>}
      <label>Format</label>
      <div className="radio-row">
        {(['png', 'jpeg', 'pdf', 'md'] as const).map((f) => (
          <label key={f} className="radio">
            <input
              type="radio"
              name="imgfmt"
              checked={format === f}
              onChange={() => setFormat(f)}
            />
            {f === 'jpeg' ? 'JPG' : f === 'md' ? 'Markdown' : f.toUpperCase()}
          </label>
        ))}
      </div>
      {format === 'md' && (
        <p className="hint">Graph as a mermaid diagram (rendered by GitHub, Obsidian…) + narrative.</p>
      )}
      <label className="checkbox-row">
        <input
          type="checkbox"
          className="checkbox"
          checked={withNarrative}
          onChange={(e) => setWithNarrative(e.target.checked)}
        />
        Include the narrative
      </label>
      {/* The STIX export has its own checkbox for the same material. These are
          two audiences, not one setting: a bundle going to a platform and a
          report going to a person do not want the same candour. */}
      <label className="checkbox-row">
        <input
          type="checkbox"
          className="checkbox"
          checked={withNotes}
          onChange={(e) => setWithNotes(e.target.checked)}
          disabled={notes.length === 0}
        />
        Include my notes and opinions
        {notes.length === 0 && <em className="hint"> (none written yet)</em>}
      </label>
      {error && <p className="lint-warn">{error}</p>}
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button className="primary" onClick={run} disabled={busy || nodes.length === 0}>
          {busy ? 'Exporting…' : 'Download'}
        </button>
      <button onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}
