/**
 * Demo investigation (#115): "Operation Aviary" in one click.
 *
 * The split between the two layers is deliberate:
 * - the STIX bundle (public/examples) carries entities, relationships and
 *   **notes**: all of that exports and lands in OpenCTI;
 * - the **screenshots** are purely local (#136), they cannot travel inside a
 *   bundle - so we draw them here, at load time, rather than shipping
 *   binaries in the repository.
 *
 * Fictional scenario, no real data.
 */

import { api } from './api'
import { NODE_H, NODE_W, findFreeSpot, type Rect } from './placement'
import type { Entity } from './types'

const BUNDLE_URL = 'examples/operation-voliere.stix.json'

/* -- fabricated captures ---------------------------------------------------- */

interface Shot {
  /** entity the capture attaches to (exact name as it stands in the bundle) */
  anchor: string
  title: string
  lines: [string, string][]
}

/** Two believable investigation attachments: a whois, a proxy log. */
const SHOTS: Shot[] = [
  {
    anchor: 'nest.corax.example',
    title: '$ whois nest.corax.example',
    lines: [
      ['Domain Name:', 'NEST.CORAX.EXAMPLE'],
      ['Registrar:', 'LowCost Registrar LLC'],
      ['Creation Date:', '2024-11-09T02:14:51Z'],
      ['Updated Date:', '2024-11-09T02:14:51Z'],
      ['Name Server:', 'ns1.bulletproof.example'],
      ['Name Server:', 'ns2.bulletproof.example'],
      ['Registrant Org:', 'REDACTED FOR PRIVACY'],
    ],
  },
  {
    anchor: 'http://nest.corax.example/beacon',
    title: 'proxy.log - C2 beacon (extract)',
    lines: [
      ['09:12:04', 'GET /beacon 200 342b'],
      ['09:13:05', 'GET /beacon 200 342b'],
      ['09:14:03', 'GET /beacon 200 1284b'],
      ['09:15:06', 'GET /beacon 200 342b'],
      ['UA:', 'Aerodyne-Updater/2.1 (Windows NT)'],
      ['Interval:', '~60 s, 10% jitter'],
    ],
  },
]

async function drawShot(shot: Shot): Promise<{ blob: Blob; width: number; height: number }> {
  const width = 460
  const height = 60 + shot.lines.length * 26
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')!
  g.fillStyle = '#16161d'
  g.fillRect(0, 0, width, height)
  g.font = 'bold 15px "IBM Plex Mono", ui-monospace, monospace'
  g.fillStyle = '#98bb6c'
  g.fillText(shot.title, 18, 34)
  g.font = '14px "IBM Plex Mono", ui-monospace, monospace'
  shot.lines.forEach(([label, value], i) => {
    const y = 66 + i * 26
    g.fillStyle = '#9a9782'
    g.fillText(label, 18, y)
    g.fillStyle = '#dcd7ba'
    g.fillText(value, 150, y)
  })
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.9),
  )
  if (!blob) throw new Error('demo capture: encoding failed')
  return { blob, width, height }
}

/* -- loading ---------------------------------------------------------------- */

/** Bundle notes pinned on the canvas by default (matched on content prefix). */
const PINNED = ['Attribution to confirm', 'Whois: domain registered']

/**
 * What an HTTP status means HERE, in the words of someone who has to fix it.
 *
 * This used to say "example not found" whatever came back, including for a
 * 403, which is not a missing file but a server refusing to hand one over. It
 * cost a real deployment an evening: the message pointed at the file while the
 * cause was the permissions the build had carried into the image.
 */
function explainFetch(status: number): string {
  if (status === 403) {
    return (
      'the server refuses to serve the example bundle (HTTP 403). It is there, ' +
      'something will not hand it over: file permissions inside the image, or a ' +
      'proxy in front of it.'
    )
  }
  if (status === 404) {
    return 'the example bundle is missing from this deployment (HTTP 404).'
  }
  return `the example bundle could not be read (HTTP ${String(status)}).`
}

/**
 * Imports the demo bundle, then adds the annotation layer on top of it.
 * Returns the id of the investigation created.
 */
export async function loadDemoInvestigation(): Promise<string> {
  const response = await fetch(BUNDLE_URL)
  if (!response.ok) {
    throw new Error(explainFetch(response.status))
  }
  // The SPA falls back to index.html on an unknown path, so a bundle missing
  // from the image answers 200 with a page. Left to `json()` that came out as
  // "Unexpected token '<'", which sends whoever reads it looking at the wrong
  // thing entirely.
  if (!(response.headers.get('content-type') ?? '').includes('json')) {
    throw new Error(
      'the example bundle is not on the server: the address answered with a page ' +
        'instead of a file. The examples/ directory is missing from the deployed build.',
    )
  }
  const bundle: unknown = await response.json()
  const { investigation } = await api.importBundle(bundle, 'Operation Aviary')
  const iid = investigation.id

  const entities = await api.listEntities(iid)
  const byName = new Map(entities.map((e) => [e.name, e]))
  // the spots already taken, so nothing is dropped onto an existing node
  const occupied: Rect[] = entities.map((e) => ({
    x: e.position_x,
    y: e.position_y,
    w: NODE_W,
    h: NODE_H,
  }))
  const place = (anchor: Entity | undefined, size: { w: number; h: number }) => {
    const preferred = anchor
      ? { x: anchor.position_x + NODE_W + 90, y: anchor.position_y }
      : { x: 80, y: 80 }
    const spot = findFreeSpot(preferred, occupied, size)
    occupied.push({ ...spot, ...size })
    return spot
  }

  // pinned notes: the reader sees at once that the canvas also carries the
  // analyst's caveats, not only STIX objects
  const notes = await api.listNotes(iid)
  for (const note of notes) {
    if (!PINNED.some((prefix) => note.content.startsWith(prefix))) continue
    const anchor = note.entity_id
      ? entities.find((e) => e.id === note.entity_id)
      : undefined
    await api.pinNote(iid, note.id, place(anchor, { w: 220, h: 110 }))
  }

  // captures: drawn here, tied to their entity, never exported
  for (const shot of SHOTS) {
    const anchor = byName.get(shot.anchor)
    const { blob, width, height } = await drawShot(shot)
    const size = { w: Math.min(width, 210), h: Math.min(height, 170) }
    const { x, y } = place(anchor, size)
    const capture = await api.createCapture(iid, { blob, width, height, x, y })
    if (anchor) {
      await api.updateCapture(iid, capture.id, { entity_ids: [anchor.id] })
    }
  }

  return iid
}
