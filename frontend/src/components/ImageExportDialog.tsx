import { useState } from 'react'
import type { Node } from '@xyflow/react'
import { buildNarrative, type NarrEntity, type NarrRelation } from '../narrative'
import { buildMarkdown } from '../export-markdown'
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
 * Visual export (#17): a "photo" of the canvas (WYSIWYG, the analyst's layout
 * is preserved) as PNG / JPG / PDF, graph alone or graph + narrative. Markdown
 * is the odd one out: the graph is redrawn as mermaid, not captured.
 */
export default function ImageExportDialog({
  title,
  nodes,
  entities,
  relations,
  onClose,
}: {
  title: string
  nodes: Node[]
  entities: NarrEntity[]
  relations: NarrRelation[]
  onClose: () => void
}) {
  const [format, setFormat] = useState<'png' | 'jpeg' | 'pdf' | 'md'>('png')
  const [withNarrative, setWithNarrative] = useState(false)
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
        const md = buildMarkdown(title, entities, relations, withNarrative)
        downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${slug}.md`)
        onClose()
        return
      }
      const narr = buildNarrative(entities, relations)
      if (format === 'pdf') {
        // JPEG for the embedded image: a far lighter PDF than PNG would give
        const graph = await captureGraph(nodes, 'jpeg', bg())
        downloadBlob(await graphToPdf(graph, title, withNarrative ? narr : null), `${slug}.pdf`)
      } else {
        const imgFormat = format as ImageFormat
        const ext = imgFormat === 'jpeg' ? 'jpg' : 'png'
        if (withNarrative) {
          const graph = await captureGraph(nodes, 'png', bg())
          downloadUrl(await composeReport(graph, title, narr, imgFormat, bg()), `${slug}-rapport.${ext}`)
        } else {
          const graph = await captureGraph(nodes, 'png', bg())
          downloadUrl(await withFooter(graph, imgFormat, bg()), `${slug}.${ext}`)
        }
      }
      onClose()
    } catch (e) {
      setError((e as Error).message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Export the graph" onClose={onClose}>
      {nodes.length === 0 && <p className="hint">The graph is empty — nothing to export.</p>}
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
        Inclure le récit
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
