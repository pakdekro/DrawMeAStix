/**
 * Visual export of the graph (#17): PNG / JPG / PDF, graph alone or graph +
 * narrative. 100% browser-side.
 *
 * - `html-to-image` captures the React Flow viewport (nodes + edges) framed
 *   on the WHOLE graph, not only the visible part.
 * - `jsPDF` composes the PDF (graph image + narrative as selectable text).
 * Both libs are loaded on demand (lazy) - zero weight at startup.
 */

import { getNodesBounds, getViewportForBounds } from '@xyflow/react'
import type { Node } from '@xyflow/react'
import type { Narrative } from './narrative'

export type ImageFormat = 'png' | 'jpeg'

/** Discreet source line added at the foot of exported documents. */
const SOURCE_URL = 'https://app.drawmeastix.io'

/** Captures the whole graph as a dataURL, framed on every node. */
export async function captureGraph(
  nodes: Node[],
  format: ImageFormat,
  background: string,
): Promise<string> {
  if (nodes.length === 0) throw new Error('The graph is empty.')
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')
  if (!viewport) throw new Error('Canvas introuvable.')

  const { toPng, toJpeg } = await import('html-to-image')
  const bounds = getNodesBounds(nodes)
  const MARGIN = 50 // margin around the graph, in canvas units
  const baseW = bounds.width + MARGIN * 2
  const baseH = bounds.height + MARGIN * 2
  // high resolution for sharpness (up to x4), capped at 7000px on the longest
  // side to stay under the browser's canvas limits. The PDF stays light all
  // the same (image embedded as JPEG).
  const MAX_DIM = 7000
  const RES = Math.min(4, MAX_DIM / Math.max(baseW, baseH))
  const width = Math.round(baseW * RES)
  const height = Math.round(baseH * RES)
  const vp = getViewportForBounds(bounds, width, height, 0.2, 8, 0.12)

  const opts = {
    backgroundColor: background,
    width,
    height,
    pixelRatio: 1,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
    },
  }
  return format === 'jpeg' ? toJpeg(viewport, { ...opts, quality: 0.95 }) : toPng(viewport, opts)
}

/**
 * Composes a "report" image (title + graph + narrative) straight onto a
 * <canvas>. More reliable than html-to-image in this case (no foreignObject
 * and no offscreen element, everything is drawn by hand).
 */
export async function composeReport(
  graphUrl: string,
  title: string,
  narr: Narrative,
  format: ImageFormat,
  background: string,
): Promise<string> {
  const graph = await loadImage(graphUrl)
  await document.fonts.ready

  const SANS = "'IBM Plex Sans', system-ui, -apple-system, sans-serif"
  const W = 1200
  const PAD = 40
  const innerW = W - PAD * 2
  const gH = (graph.height * innerW) / graph.width

  const meas = document.createElement('canvas').getContext('2d')!
  const wrap = (text: string, font: string): string[] => {
    meas.font = font
    const lines: string[] = []
    let cur = ''
    for (const word of text.split(' ')) {
      const candidate = cur ? `${cur} ${word}` : word
      if (cur && meas.measureText(candidate).width > innerW) {
        lines.push(cur)
        cur = word
      } else cur = candidate
    }
    if (cur) lines.push(cur)
    return lines
  }

  type Block = { lines: string[]; font: string; color: string; lh: number; gap: number }
  const blocks: Block[] = []
  const para = (t: string) =>
    blocks.push({ lines: wrap(t, `400 15px ${SANS}`), font: `400 15px ${SANS}`, color: '#dcd7ba', lh: 23, gap: 8 })
  const head = (t: string) =>
    blocks.push({ lines: [t.toUpperCase()], font: `700 13px ${SANS}`, color: '#7e9cd8', lh: 22, gap: 4 })

  head('Narrative')
  narr.story.forEach(para)
  if (narr.detection.length) {
    head('Detection')
    narr.detection.forEach(para)
  }
  if (narr.isolated.length) {
    blocks.push({
      lines: wrap(`Unlinked: ${narr.isolated.join(', ')}.`, `italic 14px ${SANS}`),
      font: `italic 14px ${SANS}`,
      color: '#9a9782',
      lh: 21,
      gap: 0,
    })
  }

  const titleLines = wrap(title, `700 26px ${SANS}`)
  const titleH = titleLines.length * 34
  const blocksH = blocks.reduce((h, b) => h + b.lines.length * b.lh + b.gap, 0)
  const totalH = Math.ceil(PAD + titleH + 16 + gH + 26 + blocksH + PAD)

  const RES = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * RES
  canvas.height = totalH * RES
  const ctx = canvas.getContext('2d')!
  ctx.scale(RES, RES)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, W, totalH)
  ctx.textBaseline = 'top'

  let y = PAD
  ctx.fillStyle = '#7e9cd8'
  ctx.font = `700 26px ${SANS}`
  for (const line of titleLines) {
    ctx.fillText(line, PAD, y)
    y += 34
  }
  y += 16
  ctx.drawImage(graph, PAD, y, innerW, gH)
  ctx.strokeStyle = '#54546d'
  ctx.lineWidth = 1
  ctx.strokeRect(PAD, y, innerW, gH)
  y += gH + 26

  for (const b of blocks) {
    ctx.font = b.font
    ctx.fillStyle = b.color
    for (const line of b.lines) {
      ctx.fillText(line, PAD, y)
      y += b.lh
    }
    y += b.gap
  }

  ctx.fillStyle = '#726f66'
  ctx.font = `400 12px 'IBM Plex Mono', ui-monospace, monospace`
  ctx.textAlign = 'right'
  ctx.fillText(SOURCE_URL, W - PAD, totalH - 22)

  return canvas.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95)
}

/** Redraws an image with the discreet source at the foot (graph-only case). */
export async function withFooter(
  dataUrl: string,
  format: ImageFormat,
  background: string,
): Promise<string> {
  const img = await loadImage(dataUrl)
  await document.fonts.ready
  const footH = Math.max(30, Math.round(img.width * 0.015))
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height + footH
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0)
  ctx.fillStyle = '#726f66'
  ctx.font = `400 ${Math.round(footH * 0.5)}px 'IBM Plex Mono', ui-monospace, monospace`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillText(SOURCE_URL, img.width - Math.round(footH * 0.6), img.height + footH / 2)
  return canvas.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/** PDF: graph image (page 1) + narrative as selectable text (optional). */
export async function graphToPdf(
  graphUrl: string,
  title: string,
  narr: Narrative | null,
): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const img = await loadImage(graphUrl)
  const landscape = img.width >= img.height
  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const M = 36

  pdf.setFont('helvetica', 'bold').setFontSize(16).setTextColor(30)
  pdf.text(title, M, M + 8)

  const maxW = pageW - M * 2
  const maxH = pageH - (M + 20) - M
  const scale = Math.min(maxW / img.width, maxH / img.height)
  const type = graphUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG'
  pdf.addImage(graphUrl, type, M, M + 20, img.width * scale, img.height * scale)
  pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(150)
  pdf.text(SOURCE_URL, pageW - M, pageH - 14, { align: 'right' })

  if (narr) {
    pdf.addPage()
    let y = M
    const block = (lines: string[], size: number, color: number) => {
      pdf.setFont('helvetica', 'normal').setFontSize(size).setTextColor(color)
      for (const raw of lines) {
        for (const ln of pdf.splitTextToSize(raw, pageW - M * 2) as string[]) {
          if (y > pageH - M) {
            pdf.addPage()
            y = M
          }
          pdf.text(ln, M, y)
          y += size * 1.35
        }
        y += 3
      }
    }
    const heading = (t: string) => {
      y += 8
      pdf.setFont('helvetica', 'bold').setFontSize(13).setTextColor(60)
      pdf.text(t, M, y)
      y += 16
    }
    heading('Narrative')
    block(narr.story, 10, 55)
    if (narr.detection.length) {
      heading('Detection')
      block(narr.detection, 10, 55)
    }
    if (narr.isolated.length) {
      block([`Unlinked: ${narr.isolated.join(', ')}.`], 10, 120)
    }
  }
  return pdf.output('blob')
}

/** File slug derived from the investigation name. */
export function fileSlug(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/\p{M}/gu, '') // drops the decomposed diacritics
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'investigation'
  )
}

export function downloadUrl(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  downloadUrl(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
