import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import type { Connection, Edge } from '@xyflow/react'
import type { NarrEntity, NarrRelation } from '../narrative'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api } from '../api'
import { entryToCreation, loadAttackDataset } from '../attack'
import type { AttackEntry } from '../attack'
import { ACCEPT, pageAt, textFromFile } from '../extractors'
import { countByType, typeMeta } from '../stixMeta'
import type { CaptureItem, Entity, Investigation, NoteItem, Relationship } from '../types'
import { compressImage } from '../annotations'
import { NODE_H, NODE_W, findFreeSpot, type Rect } from '../placement'
import { anchor } from '../floating'
import { relColor } from '../relMeta'
import { ARRANGEMENTS, arrange, type Arrangement } from '../layout'
import { circleLayout, validateTemplate } from '../templates'
import type { ScenarioTemplate, TemplatePlan } from '../templates'
import { findBridges } from '../bridges'
import type { BridgeMatch, BridgeRecipe } from '../bridges'
import { loadEndpoints, runEnrich, SOURCE_REF } from '../enrich'
import type { EnrichEndpoint } from '../enrich'
import type { DetectedIoc } from '../ioc'
import { patternFromObservable } from '../pattern'
import type { EntitySnapshot } from '../store'
import type { NoteRow, RelationshipRow } from '../stix/types'
import { commonRelationships } from '../stix/relationships'
import { applyBulkPatch, type BulkPatch } from '../bulk'
import { entityKey } from '../entityKey'
import { MINIMAP_BREAKPOINT, loadLayout, saveLayout, type PanelLayout } from '../panels'
import { onExternalChange } from '../sync'
import { isQuotaError } from '../store'
import { HELP_KEY } from '../shortcuts'
import BridgeDialog from './BridgeDialog'
import BulkInspector from './BulkInspector'
import CommandPalette from './CommandPalette'
import EnrichDialog from './EnrichDialog'
import EnrichSettings from './EnrichSettings'
import EntityForm from './EntityForm'
import Icon from './Icon'
import Inspector from './Inspector'
import Alert, { type AlertState } from './Alert'
import Modal, { isModalOpen } from './Modal'
import Narrative from './Narrative'
import QuickPaste from './QuickPaste'
import RelationDialog from './RelationDialog'
import type { PendingConnection } from './RelationDialog'
import RightColumn from './RightColumn'
import ShortcutsOverlay from './ShortcutsOverlay'
import Sidebar from './Sidebar'
import StatusBar from './StatusBar'
import TemplateDialog from './TemplateDialog'
import TopbarMenu from './TopbarMenu'
import TriageTray from './TriageTray'
import WorkNotes from './WorkNotes'
import EntityNode from './EntityNode'
import Legend from './Legend'
import FloatingEdge from './FloatingEdge'
import type { EntityNodeType } from './EntityNode'
import NoteNode from './NoteNode'
import type { NoteNodeType } from './NoteNode'
import CaptureNode from './CaptureNode'
import type { CaptureNodeType } from './CaptureNode'
import ExportDialog from './ExportDialog'
import ImageExportDialog from './ImageExportDialog'

const nodeTypes = { entity: EntityNode, annotNote: NoteNode, annotCapture: CaptureNode }
// Relationships route themselves (see floating.ts); the note and capture
// links keep the default edge, since their handle IS the statement - they
// always hang off the side of the object they annotate.
const edgeTypes = { floating: FloatingEdge }

// Annotation layer (#136): pinned notes and captures share the canvas with
// the entities, but stay outside STIX. ID prefixes so an annotation node is
// never mistaken for an entity.
type CanvasNode = EntityNodeType | NoteNodeType | CaptureNodeType
const NOTE_PREFIX = 'note:'

/**
 * Undo stack for deletions.
 *
 * Deliberately limited to the DESTRUCTIVE: deleting an entity takes its
 * relationships and its notes with it, and nothing brought them back. A typo
 * in a name gets retyped; three quarters of an hour of linking does not.
 */
type UndoPayload =
  | { kind: 'entities'; label: string; snapshots: EntitySnapshot[] }
  | { kind: 'relationships'; label: string; rows: RelationshipRow[] }
  | { kind: 'note'; label: string; row: NoteRow }

/** `Omit<union, k>` does not distribute over a union: hence the split type. */
type UndoAction = UndoPayload & { at: number }

/** Past that we forget: the stack is a safety net, not a history log. */
const UNDO_DEPTH = 25

/**
 * Coalescing window for undo entries.
 *
 * Deleting a node makes its edges disappear: React Flow calls onEdgesDelete
 * AND onNodesDelete, so TWO entries are pushed for ONE gesture. Without
 * coalescing it takes two Ctrl+Z to undo a single deletion - and the first
 * one leaves a node stripped of every one of its relationships, which is
 * worse than no undo at all.
 *
 * 400 ms leaves ample room between two human gestures, and ample room for
 * the gap between two IndexedDB writes of the same one.
 */
const UNDO_COALESCE_MS = 400

/** "Corax" for one object, "4 objects" beyond - the toast stays readable. */
function deletionLabel(names: string[]): string {
  return names.length === 1 ? names[0] : `${names.length} objects`
}
const CAPTURE_PREFIX = 'cap:'
const ANNOT_STROKE = '#54546d'

function toNoteNode(note: NoteItem): NoteNodeType {
  return {
    id: NOTE_PREFIX + note.id,
    type: 'annotNote',
    position: { x: note.position_x ?? 0, y: note.position_y ?? 0 },
    data: { note },
  }
}

function toCaptureNode(
  capture: CaptureItem,
  onOpen: (capture: CaptureItem) => void,
): CaptureNodeType {
  return {
    id: CAPTURE_PREFIX + capture.id,
    type: 'annotCapture',
    position: { x: capture.position_x, y: capture.position_y },
    data: { capture, onOpen },
  }
}

// annotation link: dashed, no arrow and no verb - impossible to mistake
// for a STIX relationship
const annotEdgeStyle = {
  style: { stroke: ANNOT_STROKE, strokeWidth: 1.2, strokeDasharray: '4 4' },
  sourceHandle: 'annot',
  targetHandle: 'annot',
}

function noteEdge(note: NoteItem): Edge {
  return {
    id: `annot:note:${note.id}`,
    source: NOTE_PREFIX + note.id,
    target: note.entity_id ?? '',
    // follows entity_id: unpins with the note, never deleted on its own
    deletable: false,
    selectable: false,
    ...annotEdgeStyle,
  }
}

function captureEdge(cid: string, eid: string): Edge {
  return {
    id: `annot:cap:${cid}:${eid}`,
    source: CAPTURE_PREFIX + cid,
    target: eid,
    // clickable label like the STIX relationships: selecting it opens the
    // "Unlink" panel in the inspector
    label: 'annotation',
    labelStyle: { fill: '#9a9782', fontSize: 10, fontStyle: 'italic' },
    labelBgStyle: { fill: '#1f1f28' },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 2,
    ...annotEdgeStyle,
  }
}

function toNode(entity: Entity): EntityNodeType {
  return {
    id: entity.id,
    type: 'entity',
    position: { x: entity.position_x, y: entity.position_y },
    data: { entity },
  }
}

// Literal Kanagawa colours (no CSS var): they are set inline on the edges, so
// they survive the html-to-image capture of the image export (CSS variables,
// for their part, are not resolved in the cloned SVG → invisible strokes and
// black label backgrounds). If the theme changes, adjust here too.
function toEdge(rel: Relationship): Edge {
  // The colour groups the verb rather than naming it (see relMeta.ts). It
  // travels as a custom property rather than as a stroke, so the link focus
  // can still paint over it from the stylesheet without a fight.
  const color = relColor(rel.rel_type)
  return {
    id: rel.id,
    type: 'floating',
    source: rel.source_id,
    target: rel.target_id,
    label: rel.rel_type,
    // start/stop carried by the edge: the inspector edits them without
    // going back to the database, and the label can show the activity
    // window (#170)
    data: {
      description: rel.description,
      start_time: rel.start_time,
      stop_time: rel.stop_time,
      color,
    },
    style: { strokeWidth: 1.5 },
    labelStyle: { fontSize: 11 },
    labelBgStyle: { fill: '#1f1f28' },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 2,
    markerEnd: { type: MarkerType.ArrowClosed, color },
  }
}

/** Viewer for a capture (#136): full screen, click to close. */
function CaptureLightbox({
  capture,
  onClose,
}: {
  capture: CaptureItem
  onClose: () => void
}) {
  // blob URL in the effect, not useMemo (StrictMode revokes without recomputing)
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const u = URL.createObjectURL(capture.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [capture.blob])
  return (
    // No visible title: it is a full-screen image. So `label` carries the
    // announcement on its own, and `className` keeps the dedicated style.
    <Modal onClose={onClose} label="Capture, full screen" className="lightbox-box">
      {url && <img src={url} alt="capture" />}
    </Modal>
  )
}

function WorkspaceInner({ investigationId }: { investigationId: string }) {
  const iid = investigationId
  const [investigation, setInvestigation] = useState<Investigation | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [candidates, setCandidates] = useState<Entity[]>([])
  const [activeTemplate, setActiveTemplate] = useState<ScenarioTemplate | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [bridging, setBridging] = useState<BridgeMatch | null>(null)
  const [endpoints, setEndpoints] = useState<EnrichEndpoint[]>(() => loadEndpoints())
  const [showEnrichSettings, setShowEnrichSettings] = useState(false)
  const [enrichEntity, setEnrichEntity] = useState<Entity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [addType, setAddType] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingConnection | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // multiple selection (#185): `selectedId` stays the SINGLE selection, the
  // one the whole existing inspector depends on
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // panel layout: the width decides on first launch, the analyst's explicit
  // choice from then on (see panels.ts)
  const [layout, setLayout] = useState<PanelLayout>(() =>
    loadLayout(window.innerWidth, window.localStorage),
  )
  const [sidePanel, setSidePanel] = useState<'objects' | 'attack' | 'scenarios' | null>(
    () => (loadLayout(window.innerWidth, window.localStorage).left ? 'objects' : null),
  )
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  // note card selected on the canvas (#136): shown in full on the right
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [showExport, setShowExport] = useState(false)
  const [showImageExport, setShowImageExport] = useState(false)
  // shortcuts cheat sheet (#190), opened with "?"
  const [showShortcuts, setShowShortcuts] = useState(false)
  /**
   * Link focus (L): off by default, and that is the whole point.
   *
   * Ringing the neighbours on every selection sounds free and is not: selecting
   * is also how you pick an object up to move it, and having the canvas dim
   * itself each time you rearrange it turns a quiet gesture into a strobe. So
   * it became a mode you ask for, for the moments when the question is the
   * structure rather than the tidying.
   */
  const [linkFocus, setLinkFocus] = useState(false)
  const toggleLinkFocusRef = useRef<() => void>(() => undefined)
  /**
   * The analyst's own layout, kept aside the first time an arrangement runs.
   *
   * Captured ONCE, not on every arrangement. Arrangements are meant to be
   * tried one after another - group by TLP, then by type, then by detection -
   * and a backup rewritten each time would only ever restore the previous
   * arrangement, never the graph the analyst had actually built. Cleared once
   * it has been restored, so the button says something true about what it will
   * do.
   */
  const [layoutBackup, setLayoutBackup] = useState<Record<
    string,
    { x: number; y: number }
  > | null>(null)
  // Bumped when a re-layout has moved the nodes and the view has to follow.
  //
  // A `requestAnimationFrame` was doing this, and it fired before React had
  // committed the new positions: the fit then framed the PREVIOUS layout, and
  // the freshly organised graph opened half off the screen. Clicking the
  // button twice fixed it, which is exactly the kind of thing nobody reports.
  // An effect runs after the commit, and after React Flow's own store has
  // taken the new nodes, since a child's effects run before its parent's.
  // enlarged capture (#136) - null: no viewer open
  const [lightbox, setLightbox] = useState<CaptureItem | null>(null)
  const { screenToFlowPosition, getNodes, deleteElements, fitView, setCenter } = useReactFlow()

  /**
   * Fit the canvas once React Flow has taken the new positions in.
   *
   * Two frames and not one, which is measured rather than assumed: the same
   * arrangement chosen twice from a fresh load fitted to the PREVIOUS layout
   * the first time and to the right one the second. React commits the moved
   * nodes on its own schedule, and a single frame lands on the wrong side of
   * that commit often enough to see.
   *
   * These calls used to pass `minZoom: 0.1` to escape React Flow's floor of
   * 0.5, and that never worked: the option only changes the viewport being
   * COMPUTED, and d3-zoom then clamps the transform it is handed to the scale
   * extent the canvas was built with. Which is why every arrangement ran off
   * the sides of the screen. The floor is set on the canvas now, where it
   * takes effect, and the analyst gets to zoom out that far by hand too - on
   * a canvas that can be four screens wide, that is a gain and not a side
   * effect.
   */
  const fitSoon = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => fitView({ duration: 400, padding: 0.15 }))
    })
  }, [fitView])

  /* -- canvas search (#122) ---------------------------------------------- */
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [undoStack, setUndoStack] = useState<UndoAction[]>([])
  const [lintWarnings, setLintWarnings] = useState(0)
  // ids the validator has something to say about: the count goes to the status
  // bar, the ids to the "By validation" arrangement
  const [lintFlagged, setLintFlagged] = useState<Set<string>>(new Set())
  const pushUndo = useCallback(
    (action: UndoPayload) =>
      setUndoStack((s) => [...s.slice(-(UNDO_DEPTH - 1)), { ...action, at: Date.now() }]),
    [],
  )
  // triage tray folding: lifted up here so the rail can open it
  const [triageOpen, setTriageOpen] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hitIndex, setHitIndex] = useState(0)

  /* -- overlap-free placement (#79) -------------------------------------- */

  const placeNear = useCallback(
    (preferred: { x: number; y: number }, placed?: Rect[]) => {
      const occupied: Rect[] = getNodes().map((n) => ({
        x: n.position.x,
        y: n.position.y,
        w: n.measured?.width ?? NODE_W,
        h: n.measured?.height ?? NODE_H,
      }))
      return findFreeSpot(preferred, placed ? [...occupied, ...placed] : occupied)
    },
    [getNodes],
  )

  const viewportCenter = useCallback(
    () =>
      screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }),
    [screenToFlowPosition],
  )

  const [alert, setAlert] = useState<AlertState | null>(null)

  // Same fix as for `showInfo`: the previous message's timer was clearing
  // the next one.
  const errorTimer = useRef<number | null>(null)
  const showError = useCallback((e: unknown) => {
    // A full disk is not a message that goes away: until it is dealt with,
    // every following write will fail. So it goes up into the persistent
    // banner rather than into a six-second toast.
    if (isQuotaError(e)) {
      setAlert({ tone: 'danger', message: (e as Error).message })
      return
    }
    if (errorTimer.current !== null) window.clearTimeout(errorTimer.current)
    setError(e instanceof Error ? e.message : String(e))
    errorTimer.current = window.setTimeout(() => setError(null), 6000)
  }, [])

  // The PREVIOUS message's timer was clearing the next one: a long operation
  // showed "enrichment running…", then "3 candidates added" vanished when the
  // first one came due. The analyst had no way to know whether the operation
  // had gone through. One timer only, reset on every message.
  const infoTimer = useRef<number | null>(null)
  const showInfo = useCallback((message: string) => {
    if (infoTimer.current !== null) window.clearTimeout(infoTimer.current)
    setInfo(message)
    infoTimer.current = window.setTimeout(() => setInfo(null), 8000)
  }, [])
  useEffect(
    () => () => {
      if (infoTimer.current !== null) window.clearTimeout(infoTimer.current)
    },
    [],
  )

  const keepLayout = useCallback(
    (current: { id: string; position: { x: number; y: number } }[]) => {
      setLayoutBackup((kept) => {
        if (kept) return kept
        const positions = Object.fromEntries(
          current.map((nd) => [nd.id, { ...nd.position }]),
        )
        // to the database as well as to the state: it used to live only in
        // memory, and a page reload turned a reversible detour into a
        // permanent rearrangement. Written like the scratchpad, without
        // touching updated_at - where the objects sit is not intel.
        void api.saveLayoutBackup(iid, positions).catch(showError)
        return positions
      })
    },
    [iid, showError],
  )

  /**
   * Another tab has written: this one is now working on a stale state, and a
   * bulk edit here would write back properties read before that.
   *
   * We do not merge - that would be a subject of its own, and the product is
   * single-user. We SAY it, which is enough that nobody works believing they
   * are looking at the real state.
   */
  useEffect(
    () =>
      onExternalChange(() => {
        setAlert((current) =>
          // do not paint over a more serious alert already showing
          current?.tone === 'danger'
            ? current
            : {
                tone: 'warn',
                message:
                  'Another tab changed this data. What you see here may be out of date.',
                action: { label: 'Reload', run: () => void reloadRef.current() },
              },
        )
      }),
    [],
  )

  const onOpenCapture = useCallback((capture: CaptureItem) => setLightbox(capture), [])

  // unpins a note from its card on the canvas (its cross, or the Delete key)
  const unpinNote = useCallback(
    (noteId: string) => {
      api.pinNote(iid, noteId, null).catch(showError)
      setNodes((ns) => ns.filter((n) => n.id !== NOTE_PREFIX + noteId))
      setEdges((es) => es.filter((e) => e.id !== `annot:note:${noteId}`))
      setNotes((ns) =>
        ns.map((n) => (n.id === noteId ? { ...n, position_x: null, position_y: null } : n)),
      )
    },
    [iid, setNodes, setEdges, showError],
  )

  /**
   * Reloads the whole state from IndexedDB.
   *
   * Pulled out of the initial mount to serve undo too: after a restore,
   * having the database read again is safer than hand-injecting nodes, edges
   * and notes back into React Flow - the database is the truth, and a
   * restored cascade touches all three at once.
   */
  // A ref rather than a dependency: the cross-tab listener is mounted once,
  // it must not unmount and remount on every render.
  const reloadRef = useRef<() => Promise<unknown>>(() => Promise.resolve())
  const reload = useCallback(
    () =>
      Promise.all([
        api.getInvestigation(iid),
        api.listEntities(iid),
        api.listRelationships(iid),
        api.listNotes(iid),
        api.listCaptures(iid),
      ])
        .then(([inv, entities, rels, allNotes, captures]) => {
          setInvestigation(inv)
          // a layout kept aside before a reload: the "My layout" button has to
          // come back with it, otherwise the arrangement looks permanent
          setLayoutBackup(inv.layout_backup ?? null)
          // only confirmed entities live on the canvas; the candidates
          // wait in the triage tray
          const confirmed = entities.filter((e) => e.status === 'confirmed')
          const visible = new Set(confirmed.map((e) => e.id))
          setCandidates(entities.filter((e) => e.status === 'candidate'))
          // annotation layer (#136): pinned notes + captures
          const pinned = allNotes.filter(
            (n) => n.position_x != null && (n.entity_id === null || visible.has(n.entity_id)),
          )
          setNodes([
            ...confirmed.map(toNode),
            ...pinned.map(toNoteNode),
            ...captures.map((c) => toCaptureNode(c, onOpenCapture)),
          ])
          setEdges([
            ...rels
              .filter((r) => visible.has(r.source_id) && visible.has(r.target_id))
              .map(toEdge),
            ...pinned
              .filter((n) => n.entity_id !== null && visible.has(n.entity_id))
              .map(noteEdge),
            ...captures.flatMap((c) =>
              c.entity_ids.filter((eid) => visible.has(eid)).map((eid) => captureEdge(c.id, eid)),
            ),
          ])
          setNotes(allNotes)
        })
        .catch(showError),
    [iid, setNodes, setEdges, onOpenCapture, showError],
  )
  reloadRef.current = reload

  useEffect(() => {
    void reload()
  }, [reload])

  // matches on: entity name, type, labels and aliases + note content
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return nodes.filter((n) => {
      if (n.type === 'entity') {
        const e = n.data.entity
        const props = e.properties ?? {}
        return [
          e.name,
          typeMeta(e.stix_type).label,
          ...(Array.isArray(props.labels) ? (props.labels as string[]) : []),
          ...(Array.isArray(props.aliases) ? (props.aliases as string[]) : []),
        ]
          .join('\n')
          .toLowerCase()
          .includes(q)
      }
      if (n.type === 'annotNote') return n.data.note.content.toLowerCase().includes(q)
      return false
    })
  }, [nodes, query])

  /**
   * What the current selection touches, one hop out.
   *
   * A CTI graph is a star, and no automatic layout makes one readable (see
   * layout.ts). What does make it readable is asking it: select an object and
   * its neighbours light up, wherever the arrangement happened to put them.
   *
   * Derived, never stored: React Flow already marks the selected nodes, so
   * reading it back beats keeping a second copy in state that can disagree.
   */
  const linked = useMemo(() => {
    const selected = new Set(nodes.filter((nd) => nd.selected).map((nd) => nd.id))
    if (!linkFocus || selected.size === 0) {
      return { nodes: new Set<string>(), edges: new Set<string>() }
    }
    const neighbours = new Set<string>()
    const incident = new Set<string>()
    for (const e of edges) {
      const fromSelection = selected.has(e.source)
      const toSelection = selected.has(e.target)
      if (!fromSelection && !toSelection) continue
      incident.add(e.id)
      if (!fromSelection) neighbours.add(e.source)
      if (!toSelection) neighbours.add(e.target)
    }
    return { nodes: neighbours, edges: incident }
  }, [nodes, edges, linkFocus])

  /**
   * What each object carries, for the annotation grip to show at a glance.
   * A note pinned on the canvas is obvious; a note left in the inspector was
   * invisible until you clicked the object, which is the wrong way round -
   * you click BECAUSE you saw there was something to read.
   *
   * An opinion outranks a note: it is the analyst's own judgement, and it is
   * the thing you least want to walk past.
   */
  const annotated = useMemo(() => {
    const map = new Map<string, 'note' | 'opinion'>()
    for (const n of notes) {
      if (!n.entity_id) continue
      if (n.kind === 'opinion' || !map.has(n.entity_id)) map.set(n.entity_id, n.kind)
    }
    return map
  }, [notes])

  const displayNodes = useMemo(() => {
    const searching = searchOpen && query.trim() !== ''
    const hitIds = new Set(hits.map((n) => n.id))
    return nodes.map((n) => {
      // the search verdict wins the opacity, the link adds its ring on top:
      // a neighbour the search rejected must not come back from the dead
      const touched = linked.nodes.has(n.id) || n.selected === true
      const classes = [
        searching ? (hitIds.has(n.id) ? 'search-hit' : 'search-miss') : '',
        linked.nodes.has(n.id) ? 'linked' : '',
        // the search already dims what it rejected; stacking a second opacity
        // on top of it would push those nodes to nearly invisible
        !searching && linked.nodes.size > 0 && !touched ? 'aside' : '',
        annotated.has(n.id) ? `has-${annotated.get(n.id)}` : '',
      ].filter(Boolean)
      return classes.length === 0 ? n : { ...n, className: classes.join(' ') }
    })
  }, [nodes, hits, searchOpen, query, linked, annotated])

  /**
   * The relationships the selection is an end of, brought forward while the
   * others step back. On a graph where thirty edges cross the screen, the ring
   * around a neighbour says WHICH objects; only the edge says which link.
   */
  /**
   * Where each relationship meets each card. Worked out here rather than by
   * each edge, because an edge cannot know how many others are competing for
   * the side it wants to leave from. Only the STIX relationships take part:
   * a note or a capture hangs off the annotation handle, and that position IS
   * the statement.
   */
  const ends = useMemo(
    () =>
      anchor(
        nodes.map((nd) => ({
          id: nd.id,
          x: nd.position.x,
          y: nd.position.y,
          w: nd.measured?.width ?? NODE_W,
          h: nd.measured?.height ?? NODE_H,
        })),
        edges.filter((e) => e.type === 'floating'),
      ),
    [nodes, edges],
  )

  const displayEdges = useMemo(
    () =>
      edges.map((e) => {
        const mine = ends.get(e.id)
        if (!mine && linked.edges.size === 0) return e
        return {
          ...e,
          ...(mine ? { data: { ...e.data, ends: mine } } : {}),
          ...(linked.edges.size === 0
            ? {}
            : { className: linked.edges.has(e.id) ? 'edge-linked' : 'edge-aside' }),
        }
      }),
    [edges, ends, linked],
  )

  const centerOnHit = useCallback(
    (index: number) => {
      const hit = hits[((index % hits.length) + hits.length) % hits.length]
      if (!hit) return
      void setCenter(hit.position.x + NODE_W / 2, hit.position.y + NODE_H / 2, {
        duration: 300,
        zoom: 1.1,
      })
    },
    [hits, setCenter],
  )

  const toggleTriage = useCallback(() => setTriageOpen((o) => !o), [])

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const setPanels = useCallback((next: PanelLayout) => {
    setLayout(next)
    saveLayout(next, window.localStorage)
  }, [])

  const toggleInspector = useCallback(
    () => setLayout((l) => {
      const next = { ...l, right: !l.right }
      saveLayout(next, window.localStorage)
      return next
    }),
    [],
  )

  /** The rail drives the palette; "open or not" is stored along with it. */
  const choosePanel = useCallback(
    (panel: 'objects' | 'attack' | 'scenarios' | null) => {
      setSidePanel(panel)
      setPanels({ left: panel !== null, right: layout.right })
    },
    [layout.right, setPanels],
  )

  const toggleSidebar = useCallback(
    () => choosePanel(sidePanel ? null : 'objects'),
    [sidePanel, choosePanel],
  )

  // The global keyboard listener is mounted once: it goes through this ref
  // rather than through the closure, otherwise it would have to unmount and
  // remount on every panel change.
  const toggleSidebarRef = useRef(toggleSidebar)
  toggleSidebarRef.current = toggleSidebar

  /**
   * A mode with no visible state is a trap, so this one announces itself both
   * ways: the toolbar button stays lit while it is on, and the toggle says so
   * out loud for the times it was reached by the keyboard.
   */
  const toggleLinkFocus = useCallback(() => {
    setLinkFocus((on) => {
      showInfo(on ? 'Link focus off' : 'Link focus on: select an object to see what it touches')
      return !on
    })
  }, [showInfo])
  toggleLinkFocusRef.current = toggleLinkFocus

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setQuery('')
    setHitIndex(0)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      // Ctrl/Cmd+K goes through EVEN from inside a field: it is the only
      // shortcut that must stay reachable wherever the caret is ("/" is not,
      // it would type a slash where someone is writing).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      // Ctrl+B: fold/unfold the objects palette, the convention shared with
      // code editors
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleSidebarRef.current()
        return
      }
      // Under a dialog these two keys still fired: search opened behind an
      // opaque backdrop, or the cheat sheet on top of an entry in progress.
      // Ctrl+K stays reachable, that is the whole point of it.
      if (isModalOpen()) return
      if (e.key === '/' && !el?.closest('input, textarea, [contenteditable]')) {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      // "l" for links. A bare letter, like "/" just above: the canvas owns the
      // keyboard whenever no field does.
      if (
        e.key.toLowerCase() === 'l' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !el?.closest('input, textarea, [contenteditable]')
      ) {
        e.preventDefault()
        toggleLinkFocusRef.current()
        return
      }
      // "?": the shortcuts cheat sheet (#190). We test the CHARACTER
      // produced, not the physical key - "?" is composed differently on
      // AZERTY and on QWERTY, and the character is all the two share.
      if (e.key === HELP_KEY && !el?.closest('input, textarea, [contenteditable]')) {
        e.preventDefault()
        setShowShortcuts((s) => !s)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** Recentres the canvas on an entity and selects it (palette "go to"). */
  const goToEntity = useCallback(
    (id: string) => {
      const node = getNodes().find((n) => n.id === id)
      if (!node) return
      void setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2, {
        duration: 300,
        zoom: 1.1,
      })
      // We select the NODE, not just `selectedId`: React Flow stays the sole
      // owner of the selection, and its onSelectionChange put the id straight
      // back to null - the inspector stayed empty.
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })))
    },
    [getNodes, setCenter, setNodes],
  )

  const entityById = useMemo(() => {
    const map = new Map<string, Entity>()
    nodes.forEach((n) => {
      if (n.type === 'entity') map.set(n.id, n.data.entity)
    })
    return map
  }, [nodes])

  const selected = selectedId ? entityById.get(selectedId) : undefined

  // selected relationship (#129): resolved into labels for the inspector
  const selectedRelation = useMemo(() => {
    if (!selectedEdgeId) return undefined
    const edge = edges.find((e) => e.id === selectedEdgeId)
    if (!edge) return undefined
    const source = entityById.get(edge.source)
    const target = entityById.get(edge.target)
    if (!source || !target) return undefined
    const data = edge.data as
      | { description?: string; start_time?: string | null; stop_time?: string | null }
      | undefined
    return {
      id: edge.id,
      relType: String(edge.label ?? 'related-to'),
      source,
      target,
      description: String(data?.description ?? ''),
      // <input type="date"> only reads the day part of an imported timestamp
      startTime: (data?.start_time ?? '').slice(0, 10),
      stopTime: (data?.stop_time ?? '').slice(0, 10),
    }
  }, [selectedEdgeId, edges, entityById])
  // selected annotation link (#136): "Unlink" panel in the inspector
  const selectedAnnotation = useMemo(() => {
    if (!selectedEdgeId?.startsWith('annot:cap:')) return undefined
    const edge = edges.find((e) => e.id === selectedEdgeId)
    if (!edge) return undefined
    const entity = entityById.get(edge.target)
    return entity ? { id: edge.id, entity } : undefined
  }, [selectedEdgeId, edges, entityById])
  const selectedNotes = useMemo(
    () => notes.filter((n) => n.entity_id === (selected?.id ?? null)),
    [notes, selected?.id],
  )
  // detection excerpt for the candidates (note left by the document import):
  // shown as the tray tooltip, so triage happens knowing the context
  const contextByEntity = useMemo(() => {
    const map = new Map<string, string>()
    for (const n of notes) {
      if (n.entity_id && !map.has(n.entity_id)) map.set(n.entity_id, n.content)
    }
    return map
  }, [notes])
  const selectedNote = useMemo(
    () => (selectedNoteId ? notes.find((n) => n.id === selectedNoteId) : undefined),
    [notes, selectedNoteId],
  )
  const selectedNoteEntity = selectedNote?.entity_id
    ? entityById.get(selectedNote.entity_id)
    : undefined

  /* -- entities --------------------------------------------------------- */

  // every creation selects the new node (#81): the inspector reflects what
  // was just done, and "create then enrich" targets the right entity
  const addNodeSelected = useCallback(
    (entity: Entity) => {
      setNodes((ns) => [
        ...ns.map((n) => (n.selected ? { ...n, selected: false } : n)),
        { ...toNode(entity), selected: true },
      ])
      setSelectedId(entity.id)
    },
    [setNodes],
  )

  const createEntity = useCallback(
    async (stixType: string, name: string, properties: Record<string, unknown>) => {
      const pos = placeNear(viewportCenter())
      try {
        const entity = await api.createEntity(iid, {
          stix_type: stixType,
          name,
          properties: properties as Entity['properties'],
          position_x: pos.x,
          position_y: pos.y,
        })
        addNodeSelected(entity)
        setAddType(null)
      } catch (e) {
        showError(e)
      }
    },
    [iid, placeNear, viewportCenter, addNodeSelected, showError],
  )

  const updateEntity = useCallback(
    async (entity: Entity, name: string, properties: Record<string, unknown>) => {
      try {
        const updated = await api.updateEntity(iid, entity.id, {
          name,
          properties: properties as Entity['properties'],
        })
        setNodes((ns) =>
          ns.map((n) =>
            n.type === 'entity' && n.id === entity.id ? { ...n, data: { entity: updated } } : n,
          ),
        )
      } catch (e) {
        showError(e)
      }
    },
    [iid, setNodes, showError],
  )

  // duplication (#76): same type, properties and notes - NOT the
  // relationships (copied silently they would create false links; the
  // analyst redraws the ones that hold for the clone). The deterministic
  // STIX id recomputes itself as soon as the value changes. The clone is
  // selected: the inspector brings the form up focused on the value field.
  const duplicateEntity = useCallback(
    async (entity: Entity) => {
      try {
        const pos = placeNear({ x: entity.position_x, y: entity.position_y })
        const copy = await api.createEntity(iid, {
          stix_type: entity.stix_type,
          name: entity.name,
          properties: structuredClone(entity.properties) as Entity['properties'],
          position_x: pos.x,
          position_y: pos.y,
        })
        const copied: NoteItem[] = []
        for (const n of notes) {
          if (n.entity_id !== entity.id) continue
          copied.push(
            await api.createNote(iid, {
              content: n.content,
              kind: n.kind,
              entity_id: copy.id,
              opinion_value: n.opinion_value ?? undefined,
            }),
          )
        }
        setNotes((ns) => [...ns, ...copied])
        addNodeSelected(copy)
      } catch (e) {
        showError(e)
      }
    },
    [iid, notes, placeNear, addNodeSelected, showError],
  )

  // stable callbacks for the memoised Sidebar
  const openPaste = useCallback(() => setShowPaste(true), [])
  const pickAttack = useCallback(
    (entry: AttackEntry) => {
      const c = entryToCreation(entry)
      void createEntity(c.stix_type, c.name, c.properties)
    },
    [createEntity],
  )

  /* -- quick paste (#31) --------------------------------------------------- */

  const addIocs = async (iocs: DetectedIoc[]) => {
    setShowPaste(false)
    if (iocs.length === 1) {
      // a single IOC: deliberate gesture, straight onto the canvas
      await createEntity(iocs[0].stix_type, iocs[0].name, iocs[0].properties)
      return
    }
    // several: semi-automatic source → triage tray
    for (const ioc of iocs) {
      try {
        const entity = await api.createEntity(iid, {
          stix_type: ioc.stix_type,
          name: ioc.name,
          properties: ioc.properties as Entity['properties'],
          status: 'candidate',
          source: 'paste',
        })
        setCandidates((cs) => [...cs, entity])
      } catch (e) {
        showError(e)
      }
    }
  }

  /* -- document ingestion (#13/#14) ---------------------------------------- */

  // 100% local extraction: the file is neither uploaded nor kept, only the
  // candidates (triage tray) and their provenance note remain
  const importDocuments = useCallback(
    async (files: File[]) => {
      showInfo(`Extracting ${files.length} document(s)…`)
      try {
        // the extraction core and the dataset load on demand; pdf.js and
        // mammoth are import() calls inside the extractors, so they are
        // lazy whatever happens
        const [{ extractFromText }, dataset] = await Promise.all([
          import('../extract'),
          loadAttackDataset().catch(() => null),
        ])
        // dedup against ALL that exists (canvas + tray), IndexedDB is the truth
        const existing = new Set(
          (await api.listEntities(iid)).map(
            entityKey,
          ),
        )
        let added = 0
        let skipped = 0
        const problems: string[] = []
        for (const file of files) {
          try {
            const doc = await textFromFile(file)
            const found = extractFromText(doc.text, dataset?.entries ?? [])
            if (found.length === 0) {
              // diagnostic: tells "no text layer" apart from "text read,
              // nothing recognisable" - without it the failure is mute
              problems.push(
                `${file.name}: ${doc.text.length} characters read, no indicator recognised`,
              )
            }
            for (const cand of found) {
              const key = entityKey(cand)
              if (existing.has(key)) {
                skipped += 1
                continue
              }
              existing.add(key)
              const entity = await api.createEntity(iid, {
                stix_type: cand.stix_type,
                name: cand.name,
                properties: cand.properties as Entity['properties'],
                status: 'candidate',
                source: `doc:${file.name}`,
              })
              const page = pageAt(doc, cand.offset)
              const note = await api.createNote(iid, {
                content: `${file.name}${page > 0 ? `, p.${page}` : ''}: "${cand.context}"`,
                entity_id: entity.id,
              })
              setNotes((ns) => [...ns, note])
              setCandidates((cs) => [...cs, entity])
              added += 1
            }
          } catch (e) {
            problems.push(`${file.name} : ${(e as Error).message}`)
          }
        }
        const parts = [`${added} candidate(s) to the triage tray`]
        if (skipped > 0) parts.push(`${skipped} already present, skipped`)
        showInfo(`Extraction done: ${parts.join('; ')}.`)
        if (problems.length > 0) showError(problems.join(' ; '))
      } catch (e) {
        showError(e)
      }
    },
    [iid, showInfo, showError],
  )

  // Importing a STIX bundle → a new investigation (same model as the home
  // page: one bundle = one investigation). We navigate to it once created.
  const importStix = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        let bundle: unknown
        try {
          bundle = JSON.parse(text)
        } catch {
          throw new Error('This file is not valid JSON')
        }
        const result = await api.importBundle(bundle, file.name.replace(/\.[^.]*$/, ''))
        window.location.hash = `#/inv/${result.investigation.id}`
      } catch (e) {
        showError(e)
      }
    },
    [showError],
  )

  /**
   * Annotations (#136) put back next to their anchor entity once the objects
   * have moved: first free slot to its right, no overlap. Shared by both ways
   * of rearranging the canvas, since only the objects differ between them.
   */
  const placeAnnotations = useCallback(
    async (
      entityPositions: Record<string, { x: number; y: number }>,
      placed: Rect[],
    ): Promise<Record<string, { x: number; y: number }>> => {
      const out: Record<string, { x: number; y: number }> = { ...entityPositions }
      for (const nd of nodes) {
        if (nd.type !== 'annotNote' && nd.type !== 'annotCapture') continue
        const size = {
          w: nd.measured?.width ?? NODE_W,
          h: nd.measured?.height ?? NODE_H,
        }
        const anchorId =
          nd.type === 'annotNote' ? nd.data.note.entity_id : nd.data.capture.entity_ids[0]
        const anchor = anchorId ? entityPositions[anchorId] : undefined
        const preferred = anchor ? { x: anchor.x + NODE_W + 80, y: anchor.y } : nd.position
        const pos = findFreeSpot(preferred, placed, size)
        placed.push({ ...pos, ...size })
        out[nd.id] = pos
        if (nd.type === 'annotNote') {
          api.pinNote(iid, nd.id.slice(NOTE_PREFIX.length), pos).catch(showError)
        } else {
          api.updateCapture(iid, nd.id.slice(CAPTURE_PREFIX.length), pos).catch(showError)
        }
      }
      return out
    },
    [nodes, iid, showError],
  )

  // "Re-layout": layered top→bottom layout via Dagre (loaded on demand).
  // Minimises crossings; we keep the previous positions so it can be undone.
  // Only touches the canvas (the tray's candidates stay put).
  const reorganize = useCallback(async () => {
    // Dagre only sees the STIX; the annotations (#136) are then placed back
    // next to their anchor entity, without overlap
    const entityNodes = nodes.filter((nd) => nd.type === 'entity')
    if (entityNodes.length === 0) return
    // The one unguarded point of the function: the writes that follow all
    // have their `.catch(showError)`, but a chunk that fails to load
    // (offline, missing cache) rejected a promise nobody caught - the button
    // did nothing, without a word.
    let dagre: typeof import('@dagrejs/dagre').default
    try {
      dagre = (await import('@dagrejs/dagre')).default
    } catch (e) {
      showError(e)
      return
    }
    const g = new dagre.graphlib.Graph()
    // `nodesep` is the gap between two neighbours on a rank, `ranksep` the drop
    // from one rank to the next. A node being about four times wider than it is
    // tall, equal values lay the graph out as a horizontal band; tightening the
    // first and loosening the second buys height, which the canvas scrolls,
    // against width, which it does not.
    g.setGraph({ rankdir: 'TB', nodesep: 24, ranksep: 120 })
    g.setDefaultEdgeLabel(() => ({}))
    // The measured size, not the default footprint: a node is 230x63 on screen
    // against the 260x88 we used to declare, so Dagre reserved a margin that
    // does not exist and spread every rank by it.
    const sizeOf = (nd: (typeof nodes)[number]) => ({
      width: nd.measured?.width ?? NODE_W,
      height: nd.measured?.height ?? NODE_H,
    })
    for (const nd of entityNodes) g.setNode(nd.id, sizeOf(nd))
    for (const e of edges) {
      if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target)
    }
    dagre.layout(g)
    keepLayout(nodes)

    // 1) entities: Dagre positions (centre → top-left corner)
    const entityPositions: Record<string, { x: number; y: number }> = {}
    const placed: Rect[] = []
    for (const nd of entityNodes) {
      const p = g.node(nd.id)
      if (!p) continue
      const { width, height } = sizeOf(nd)
      const pos = { x: Math.round(p.x - width / 2), y: Math.round(p.y - height / 2) }
      entityPositions[nd.id] = pos
      placed.push({ ...pos, w: width, h: height })
    }

    const newPositions = await placeAnnotations(entityPositions, placed)

    setNodes((ns) =>
      ns.map((nd) =>
        newPositions[nd.id] ? { ...nd, position: newPositions[nd.id] } : nd,
      ),
    )
    await api.savePositions(iid, entityPositions).catch(showError)
    fitSoon()
  }, [nodes, edges, iid, keepLayout, setNodes, fitSoon, placeAnnotations, showError])

  /**
   * "Group by type": the everyday button. One band per STIX type, in palette
   * order, and no claim at all about the relationships - see layout.ts for why
   * drawing them automatically was given up on.
   */
  const arrangeCanvas = useCallback(
    async (kind: Arrangement) => {
    const entityNodes = nodes.filter((nd) => nd.type === 'entity')
    if (entityNodes.length === 0) return
    keepLayout(nodes)

    // The object stores the ATT&CK number, never the tactics: they are resolved
    // against the embedded dataset, and a technique the dataset does not know
    // simply has none. Fetched only for the one arrangement that needs it, and
    // memoised by the loader, so the others cost nothing. A dataset that fails
    // to load leaves every technique unplaced rather than breaking the button.
    const tactics =
      kind === 'tactic'
        ? new Map(
            ((await loadAttackDataset().catch(() => null))?.entries ?? [])
              .filter((e) => e.id !== undefined)
              .map((e) => [e.id!, e.tactics ?? []]),
          )
        : new Map<string, string[]>()
    const tacticsOf = (properties: Record<string, unknown>) =>
      typeof properties.x_mitre_id === 'string'
        ? (tactics.get(properties.x_mitre_id) ?? [])
        : []
    const sized = entityNodes.map((nd) => ({
      id: nd.id,
      stix_type: nd.data.entity.stix_type,
      tlp: String(nd.data.entity.properties.tlp ?? ''),
      source: nd.data.entity.source,
      tactics: tacticsOf(nd.data.entity.properties),
      flagged: lintFlagged.has(nd.id),
      w: nd.measured?.width ?? NODE_W,
      h: nd.measured?.height ?? NODE_H,
    }))
    const relations = edges
      .filter((e) => !e.id.startsWith('annot:'))
      .map((e) => ({ source: e.source, target: e.target, rel_type: String(e.label ?? '') }))
    const byId = new Map(sized.map((n) => [n.id, n]))
    const entityPositions: Record<string, { x: number; y: number }> = {}
    const placed: Rect[] = []
    for (const { id, x, y } of arrange(kind, sized, relations)) {
      entityPositions[id] = { x, y }
      const size = byId.get(id)!
      placed.push({ x, y, w: size.w, h: size.h })
    }

    const newPositions = await placeAnnotations(entityPositions, placed)
    setNodes((ns) =>
      ns.map((nd) => (newPositions[nd.id] ? { ...nd, position: newPositions[nd.id] } : nd)),
    )
    await api.savePositions(iid, entityPositions).catch(showError)
    fitSoon()
    },
    [
      nodes,
      edges,
      iid,
      lintFlagged,
      keepLayout,
      setNodes,
      fitSoon,
      placeAnnotations,
      showError,
    ],
  )

  /** Puts the objects back where the analyst had them, however many
   *  arrangements have been tried since. */
  const restoreLayout = useCallback(async () => {
    if (!layoutBackup) return
    const backup = layoutBackup
    setNodes((ns) =>
      ns.map((nd) => (backup[nd.id] ? { ...nd, position: { ...backup[nd.id] } } : nd)),
    )
    setLayoutBackup(null)
    void api.saveLayoutBackup(iid, null).catch(showError)
    // each kind gets its position back through its own persistence channel
    const entityPositions: Record<string, { x: number; y: number }> = {}
    for (const [id, pos] of Object.entries(backup)) {
      if (id.startsWith(NOTE_PREFIX)) {
        api.pinNote(iid, id.slice(NOTE_PREFIX.length), pos).catch(showError)
      } else if (id.startsWith(CAPTURE_PREFIX)) {
        api.updateCapture(iid, id.slice(CAPTURE_PREFIX.length), pos).catch(showError)
      } else {
        entityPositions[id] = pos
      }
    }
    await api.savePositions(iid, entityPositions).catch(showError)
    fitSoon()
  }, [layoutBackup, iid, setNodes, fitSoon, showError])

  // narrative data (#116): derived from the canvas nodes/edges, memoised so
  // the text is only recomputed when the graph actually changes
  const narrativeEntities = useMemo<NarrEntity[]>(
    () =>
      nodes
        .filter((nd): nd is EntityNodeType => nd.type === 'entity')
        .map((nd) => ({
          id: nd.id,
          stix_type: nd.data.entity.stix_type,
          name: nd.data.entity.name,
        })),
    [nodes],
  )
  // the status bar's type breakdown: memoised here so the bar, which is
  // memo()'d, does not re-render on every unrelated state change
  const typeBreakdown = useMemo(() => countByType(narrativeEntities), [narrativeEntities])
  const narrativeRelations = useMemo<NarrRelation[]>(
    () =>
      edges
        .filter((e) => !e.id.startsWith('annot:'))
        .map((e) => ({ source: e.source, type: String(e.label ?? ''), target: e.target })),
    [edges],
  )

  /* -- passive enrichment (#67) -------------------------------------------- */

  const applyEnrichment = async (
    endpoint: EnrichEndpoint,
    enricherId: string,
  ): Promise<{ candidates: number; notes: number; linked: number }> => {
    const entity = enrichEntity
    if (!entity) return { candidates: 0, notes: 0, linked: 0 }
    const res = await runEnrich(endpoint, enricherId, entity.stix_type, entity.name)
    const refToId = new Map<string, string>([[SOURCE_REF, entity.id]])
    // dedup against ALL that exists (canvas + tray), like the document
    // import: two domains resolving to the same IP must converge on a single
    // node, that convergence is exactly the useful information (#168)
    const known = new Map<string, string>(
      (await api.listEntities(iid)).map((e) => [entityKey(e), e.id]),
    )
    let created = 0
    let linked = 0
    for (const cand of res.candidates) {
      // a third-party enricher must not overwrite the enriched node's "source" ref
      if (cand.ref === SOURCE_REF) continue
      const key = entityKey(cand)
      const existing = known.get(key)
      if (existing !== undefined) {
        // the relationship will land on the node already there, not on a twin
        refToId.set(cand.ref, existing)
        linked += 1
        continue
      }
      const entityRow = await api.createEntity(iid, {
        stix_type: cand.stix_type,
        name: cand.name,
        properties: cand.properties as Entity['properties'],
        status: 'candidate',
        source: `enrich:${res.enricher}`,
      })
      known.set(key, entityRow.id)
      refToId.set(cand.ref, entityRow.id)
      created += 1
      setCandidates((cs) => [...cs, entityRow])
    }
    for (const rel of res.relations) {
      const src = refToId.get(rel.source_ref)
      const tgt = refToId.get(rel.target_ref)
      if (!src || !tgt) continue
      try {
        // relationship created right away; the edge only appears once the
        // candidate is accepted from the triage tray (refreshEdges)
        await api.createRelationship(iid, {
          source_id: src,
          target_id: tgt,
          rel_type: rel.rel_type,
          description: rel.description,
        })
      } catch (e) {
        // a relationship refused by the matrix (422) is expected and ignored;
        // any other error (IndexedDB, 404…) is a real loss → we report it
        if (!(e instanceof ApiError && e.status === 422)) showError(e)
      }
    }
    // enrichment notes (registrar, ASN, BGP prefix…): attached to the entity
    // they name (often the enriched node), visible in the inspector
    let notesAdded = 0
    for (const note of res.notes ?? []) {
      const entityId = refToId.get(note.target_ref)
      if (!entityId) continue
      try {
        const created = await api.createNote(iid, { content: note.content, entity_id: entityId })
        setNotes((ns) => [...ns, created])
        notesAdded += 1
      } catch (e) {
        showError(e)
      }
    }
    // a relationship laid between two already-confirmed entities waits for
    // no acceptance: without this its edge would stay invisible until the
    // next pass through the triage tray (#168)
    if (linked > 0) await refreshEdges()
    return { candidates: created, notes: notesAdded, linked }
  }

  /* -- canonical bridges (#37) ---------------------------------------------- */

  const applyBridge = async (match: BridgeMatch, recipe: BridgeRecipe, name: string) => {
    setBridging(null)
    const sdo = match.sdo as Entity
    const sco = match.sco as Entity
    try {
      const pos = placeNear({
        x: (sdo.position_x + sco.position_x) / 2,
        y: (sdo.position_y + sco.position_y) / 2,
      })
      const bridge = await api.createEntity(iid, {
        stix_type: recipe.bridgeType,
        name,
        properties: recipe.bridgeProperties(sco) as Entity['properties'],
        position_x: pos.x,
        position_y: pos.y,
      })
      addNodeSelected(bridge)
      const idOf = (role: string) =>
        role === 'bridge' ? bridge.id : role === 'sdo' ? sdo.id : sco.id
      for (const leg of recipe.legs) {
        const rel = await api.createRelationship(iid, {
          source_id: idOf(leg.from),
          target_id: idOf(leg.to),
          rel_type: leg.rel,
        })
        setEdges((es) => [...es, toEdge(rel)])
      }
    } catch (e) {
      showError(e)
    }
  }

  /* -- indicator generator (#32) ------------------------------------------- */

  const generateIndicator = useCallback(
    async (observable: Entity) => {
      const pattern = patternFromObservable(
        observable.stix_type,
        observable.name,
        observable.properties,
      )
      if (pattern === null) {
        showError(`No pattern can be generated for ${observable.stix_type}`)
        return
      }
      try {
        const pos = placeNear({
          x: observable.position_x + 80,
          y: observable.position_y - 140,
        })
        const indicator = await api.createEntity(iid, {
          stix_type: 'indicator',
          name: `Detection - ${observable.name}`,
          properties: { pattern },
          position_x: pos.x,
          position_y: pos.y,
        })
        addNodeSelected(indicator)
        const rel = await api.createRelationship(iid, {
          source_id: indicator.id,
          target_id: observable.id,
          rel_type: 'based-on',
        })
        setEdges((es) => [...es, toEdge(rel)])
      } catch (e) {
        showError(e)
      }
    },
    [iid, placeNear, addNodeSelected, setEdges, showError],
  )

  /* -- scenario templates (#28) ------------------------------------------- */

  const applyPlan = async (plan: TemplatePlan) => {
    setActiveTemplate(null)
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    })
    const positions = circleLayout(plan.entities.length, center)
    const keyToId = new Map<string, string>()
    const problems: string[] = []
    for (const [i, planned] of plan.entities.entries()) {
      try {
        const entity = await api.createEntity(iid, {
          stix_type: planned.stix_type,
          name: planned.name,
          properties: planned.properties as Entity['properties'],
          position_x: positions[i].x,
          position_y: positions[i].y,
        })
        keyToId.set(planned.key, entity.id)
        setNodes((ns) => [...ns, toNode(entity)])
      } catch (e) {
        problems.push(`${planned.name} : ${(e as Error).message}`)
      }
    }
    for (const rel of plan.relations) {
      const sourceId = keyToId.get(rel.fromKey)
      const targetId = keyToId.get(rel.toKey)
      if (!sourceId || !targetId) continue
      try {
        const created = await api.createRelationship(iid, {
          source_id: sourceId,
          target_id: targetId,
          rel_type: rel.rel,
        })
        setEdges((es) => [...es, toEdge(created)])
      } catch (e) {
        problems.push(`relationship ${rel.rel}: ${(e as Error).message}`)
      }
    }
    if (problems.length > 0) showError(problems.join(' ; '))
  }

  const loadCustomTemplate = useCallback(
    (file: File) => {
      file
        .text()
        .then((text) => {
          const tpl = JSON.parse(text) as ScenarioTemplate
          const problems = validateTemplate(tpl)
          if (problems.length > 0) {
            throw new Error(`invalid template: ${problems.join('; ')}`)
          }
          setActiveTemplate(tpl)
        })
        .catch(showError)
    },
    [showError],
  )

  /* -- triage tray -------------------------------------------------------- */

  const refreshEdges = useCallback(async () => {
    try {
      const rels = await api.listRelationships(iid)
      // `setNodes` was only used to READ the visible nodes, and called
      // `setEdges` from inside its updater. An updater must stay pure:
      // StrictMode replays it, so the side effect fired twice. `getNodes()`
      // gives the same information without hijacking a setter - which is
      // already what `onNodeDragStop` does, its comment names this same trap.
      const visible = new Set(getNodes().map((n) => n.id))
      // rebuilds the STIX edges WITHOUT sweeping away the annotation layer
      // (notes/captures): that was the bug where a note link disappeared
      // after accepting a candidate from the triage tray (#136)
      setEdges((es) => [
        ...rels
          .filter((r) => visible.has(r.source_id) && visible.has(r.target_id))
          .map(toEdge),
        ...es.filter((e) => e.id.startsWith('annot:')),
      ])
    } catch (e) {
      showError(e)
    }
  }, [iid, getNodes, setEdges, showError])

  /**
   * Index of the entities already on the canvas, business key → id (#168).
   * Built once per acceptance burst: the tray can hold hundreds of
   * candidates, we do not re-read the database for each one.
   */
  const confirmedIndex = async () =>
    new Map<string, string>(
      (await api.listEntities(iid))
        .filter((e) => e.status === 'confirmed')
        .map((e) => [entityKey(e), e.id]),
    )

  const confirmCandidate = async (
    entity: Entity,
    placed?: Rect[],
    select = false,
    known?: Map<string, string>,
  ): Promise<{ mergedInto: string | null }> => {
    // accepting a candidate that already exists on the canvas must not create
    // a second node: the duplicate is absorbed, relationships and notes follow
    const twin = known?.get(entityKey(entity))
    if (twin !== undefined && twin !== entity.id) {
      await api.mergeEntities(iid, entity.id, twin)
      setCandidates((cs) => cs.filter((c) => c.id !== entity.id))
      return { mergedInto: twin }
    }
    // `placed`: rects already handed out in the same burst ("accept all"),
    // which React state has not rendered yet
    const pos = placeNear(viewportCenter(), placed)
    placed?.push({ x: pos.x, y: pos.y, w: NODE_W, h: NODE_H })
    const updated = await api.updateEntity(iid, entity.id, {
      status: 'confirmed',
      position_x: pos.x,
      position_y: pos.y,
    })
    // the accepted candidate becomes in turn a potential duplicate for the
    // rest of the burst (two enrichers can propose the same observable)
    known?.set(entityKey(updated), updated.id)
    setCandidates((cs) => cs.filter((c) => c.id !== entity.id))
    // single acceptance: we select (#81); in a burst, no - the analyst is
    // not waiting for the selection to jump five times
    if (select) addNodeSelected(updated)
    else setNodes((ns) => [...ns, toNode(updated)])
    return { mergedInto: null }
  }

  const onConfirmCandidate = async (entity: Entity) => {
    try {
      const { mergedInto } = await confirmCandidate(
        entity,
        undefined,
        true,
        await confirmedIndex(),
      )
      await refreshEdges() // its imported relationships become visible again
      if (mergedInto !== null) {
        showInfo(`"${entity.name}" was already on the canvas: its relationships joined it.`)
        setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === mergedInto })))
      }
    } catch (e) {
      showError(e)
    }
  }

  const onConfirmAll = async () => {
    try {
      const placed: Rect[] = []
      const known = await confirmedIndex()
      let merged = 0
      for (const c of candidates) {
        const { mergedInto } = await confirmCandidate(c, placed, false, known)
        if (mergedInto !== null) merged += 1
      }
      await refreshEdges()
      if (merged > 0) {
        showInfo(
          `${merged} candidate(s) were already on the canvas: their relationships joined them.`,
        )
      }
    } catch (e) {
      showError(e)
    }
  }

  // per-group actions (#97): same mechanics as the single and global ones
  const onConfirmGroup = async (list: Entity[]) => {
    try {
      const placed: Rect[] = []
      // `known` was forgotten here, and only here: accepting a group created
      // a second node for an observable already on the canvas, where single
      // acceptance and "accept all" absorbed it.
      const known = await confirmedIndex()
      let merged = 0
      for (const c of list) {
        const { mergedInto } = await confirmCandidate(c, placed, false, known)
        if (mergedInto !== null) merged += 1
      }
      await refreshEdges()
      if (merged > 0) {
        showInfo(
          `${merged} candidate(s) were already on the canvas: their relationships joined them.`,
        )
      }
    } catch (e) {
      showError(e)
    }
  }

  /**
   * Rejecting destroys the entity and everything hanging off it: the same
   * operation as deleting a node from the canvas, which has been undoable
   * since #187. The snapshot was already returned by `deleteEntity`, simply
   * thrown away here - so a click a few pixels off the right button could
   * wipe a whole group with neither confirmation NOR undo.
   */
  const onRejectGroup = async (list: Entity[]) => {
    const ids = new Set(list.map((c) => c.id))
    try {
      const snapshots: EntitySnapshot[] = []
      for (const c of list) {
        snapshots.push(await api.deleteEntity(iid, c.id))
      }
      if (snapshots.length > 0) {
        pushUndo({
          kind: 'entities',
          label: deletionLabel(list.map((c) => c.name)),
          snapshots,
        })
      }
      setCandidates((cs) => cs.filter((c) => !ids.has(c.id)))
      setNotes((ns) => ns.filter((n) => !n.entity_id || !ids.has(n.entity_id)))
    } catch (e) {
      showError(e)
    }
  }

  const onRejectCandidate = async (entity: Entity) => {
    try {
      const snapshot = await api.deleteEntity(iid, entity.id)
      pushUndo({ kind: 'entities', label: deletionLabel([entity.name]), snapshots: [snapshot] })
      setCandidates((cs) => cs.filter((c) => c.id !== entity.id))
      setNotes((ns) => ns.filter((n) => n.entity_id !== entity.id))
    } catch (e) {
      showError(e)
    }
  }

  const sendToTriage = useCallback(
    async (entity: Entity) => {
      try {
        const updated = await api.updateEntity(iid, entity.id, { status: 'candidate' })
        setNodes((ns) => ns.filter((n) => n.id !== entity.id))
        setEdges((es) => es.filter((e) => e.source !== entity.id && e.target !== entity.id))
        setCandidates((cs) => [...cs, updated])
        setSelectedId(null)
      } catch (e) {
        showError(e)
      }
    },
    [iid, setNodes, setEdges, showError],
  )

  /* -- relationships (matrix-guided) ------------------------------------ */

  /**
   * The chosen objects and one other object -> suggested verb.
   *
   * Pulled out of onConnect to serve the command palette too: the STIX
   * matrix and the fallback to a canonical bridge (#37) must exist in one
   * single place, otherwise linking by keyboard and linking by mouse would
   * end up not validating the same thing.
   */
  /**
   * A batch of objects and one other object -> suggested verb.
   *
   * The MATRIX decides the direction. The analyst thinks "link these IPs to
   * this infrastructure" without worrying about STIX direction; but an
   * observable is never the source of a relationship towards an SDO, and the
   * correct link reads `infrastructure consists-of ip`. So we try the direct
   * direction, then the reverse one, rather than making the user know the
   * spec to choose their selection order.
   *
   * Pulled out of onConnect to serve the palette too: the matrix and the
   * fallback to a canonical bridge (#37) must exist in one single place,
   * otherwise linking by keyboard and linking by mouse would end up not
   * validating the same thing.
   */
  const beginRelation = useCallback(
    async (selected: Entity[], other: Entity) => {
      const first = selected[0]
      if (!first || selected.some((s) => s.id === other.id)) return

      const label = (list: Entity[]) => {
        if (list.length === 1) return list[0].name
        const types = new Set(list.map((e) => e.stix_type))
        const kind = types.size === 1 ? `${typeMeta(list[0].stix_type).label}s` : 'objects'
        return `${list.length} ${kind}`
      }

      try {
        const types = selected.map((s) => s.stix_type)
        const forward = commonRelationships(types.map((tp) => [tp, other.stix_type]))
        if (forward.length > 0) {
          setPending({
            source: first,
            target: other,
            allowed: forward,
            pairs: selected.map((s) => [s, other] as [Entity, Entity]),
            fromLabel: label(selected),
            toLabel: other.name,
          })
          return
        }

        // Same rule the other way round. It used to read the verbs off the
        // first selected object alone while `pairs` covered the whole
        // selection, so a mixed selection could be offered a verb that was
        // illegal for part of it (#234).
        const backward = commonRelationships(types.map((tp) => [other.stix_type, tp]))
        if (backward.length > 0) {
          setPending({
            source: other,
            target: first,
            allowed: backward,
            pairs: selected.map((s) => [other, s] as [Entity, Entity]),
            fromLabel: other.name,
            toLabel: label(selected),
          })
          return
        }

        // canonical bridge (#37): offer the intermediate instead of failing.
        // Single case only, one bridge per object makes no sense in a batch.
        if (selected.length === 1) {
          const match = findBridges(first, other)
          if (match !== null) {
            setBridging(match)
            return
          }
        }
        showError(
          selected.length === 1
            ? `No valid STIX relationship between "${typeMeta(first.stix_type).label}" and "${typeMeta(other.stix_type).label}", in either direction`
            : `No STIX relationship links these ${selected.length} objects and "${other.name}", in either direction`,
        )
      } catch (e) {
        showError(e)
      }
    },
    [showError],
  )

  /** Linking from the palette: same rules, different entry point. */
  const relateFromPalette = useCallback(
    (sourceIds: string[], targetId: string) => {
      const sources = sourceIds
        .map((id) => entityById.get(id))
        .filter((e): e is Entity => e !== undefined)
      const target = entityById.get(targetId)
      if (sources.length === 0 || !target) return
      void beginRelation(sources, target)
    },
    [entityById, beginRelation],
  )

  const onConnect = useCallback(
    async (conn: Connection) => {
      // annotation link (#136): capture ↔ entity, in both directions,
      // outside the STIX matrix
      const annotLink = conn.source.startsWith(CAPTURE_PREFIX)
        ? { cid: conn.source.slice(CAPTURE_PREFIX.length), entityId: conn.target }
        : conn.target.startsWith(CAPTURE_PREFIX)
          ? { cid: conn.target.slice(CAPTURE_PREFIX.length), entityId: conn.source }
          : null
      if (annotLink) {
        const entity = entityById.get(annotLink.entityId)
        const nodeId = CAPTURE_PREFIX + annotLink.cid
        const node = getNodes().find((n) => n.id === nodeId) as CaptureNodeType | undefined
        if (!entity || !node || node.data.capture.entity_ids.includes(entity.id)) return
        const ids = [...node.data.capture.entity_ids, entity.id]
        api.updateCapture(iid, annotLink.cid, { entity_ids: ids }).catch(showError)
        setNodes((ns) =>
          ns.map((n) =>
            n.id === nodeId && n.type === 'annotCapture'
              ? { ...n, data: { ...n.data, capture: { ...n.data.capture, entity_ids: ids } } }
              : n,
          ),
        )
        setEdges((es) => [...es, captureEdge(annotLink.cid, entity.id)])
        return
      }
      // the annotation handles never create a STIX relationship
      if (conn.targetHandle === 'annot' || conn.sourceHandle === 'annot-out') return
      const source = entityById.get(conn.source)
      const target = entityById.get(conn.target)
      if (!source || !target) return
      await beginRelation([source], target)
    },
    [iid, entityById, getNodes, setNodes, setEdges, showError, beginRelation],
  )

  const confirmRelation = async (relType: string) => {
    if (!pending) return
    try {
      const created: Relationship[] = []
      for (const [source, target] of pending.pairs) {
        created.push(
          await api.createRelationship(iid, {
            source_id: source.id,
            target_id: target.id,
            rel_type: relType,
          }),
        )
      }
      setEdges((es) => [...es, ...created.map(toEdge)])
      if (created.length > 1) showInfo(`${created.length} relationships created.`)
      setPending(null)
    } catch (e) {
      showError(e)
    }
  }

  /* -- notes ------------------------------------------------------------ */

  const addNote = useCallback(
    async (
      entityId: string | null,
      content: string,
      kind: 'note' | 'opinion',
      opinionValue?: string,
    ) => {
      try {
        const note = await api.createNote(iid, {
          content,
          kind,
          entity_id: entityId,
          opinion_value: opinionValue,
        })
        setNotes((ns) => [...ns, note])
      } catch (e) {
        showError(e)
      }
    },
    [iid, showError],
  )

  const deleteNote = useCallback(
    async (note: NoteItem) => {
      try {
        const row = await api.deleteNote(iid, note.id)
        pushUndo({ kind: 'note', label: 'a note', row })
        setNotes((ns) => ns.filter((n) => n.id !== note.id))
        // if it was pinned, it leaves the canvas too
        setNodes((ns) => ns.filter((n) => n.id !== NOTE_PREFIX + note.id))
        setEdges((es) => es.filter((e) => e.id !== `annot:note:${note.id}`))
      } catch (e) {
        showError(e)
      }
    },
    [iid, setNodes, setEdges, showError, pushUndo],
  )

  /* -- annotation layer (#136) ------------------------------------------- */

  // pins a note on the canvas (next to its entity) or takes it off
  const togglePinNote = useCallback(
    async (note: NoteItem) => {
      try {
        if (note.position_x != null) {
          unpinNote(note.id)
          return
        }
        const anchor = note.entity_id ? entityById.get(note.entity_id) : undefined
        const pos = placeNear(
          anchor
            ? { x: anchor.position_x, y: anchor.position_y + 140 }
            : viewportCenter(),
        )
        await api.pinNote(iid, note.id, pos)
        const pinned = { ...note, position_x: pos.x, position_y: pos.y }
        setNotes((ns) => ns.map((n) => (n.id === note.id ? pinned : n)))
        setNodes((ns) => [...ns, toNoteNode(pinned)])
        if (pinned.entity_id && entityById.has(pinned.entity_id)) {
          setEdges((es) => [...es, noteEdge(pinned)])
        }
      } catch (e) {
        showError(e)
      }
    },
    [iid, entityById, placeNear, viewportCenter, unpinNote, setNodes, setEdges, showError],
  )

  // Ctrl+V of an image onto the canvas → capture node (#136)
  const pasteCapture = useCallback(
    async (file: Blob) => {
      try {
        const { blob, width, height } = await compressImage(file)
        const pos = placeNear(viewportCenter())
        const capture = await api.createCapture(iid, { blob, width, height, x: pos.x, y: pos.y })
        setNodes((ns) => [...ns, toCaptureNode(capture, onOpenCapture)])
        showInfo(
          'Capture added - link it to an entity by dragging from the handle on its left edge.',
        )
      } catch (e) {
        showError(e)
      }
    },
    [iid, placeNear, viewportCenter, onOpenCapture, setNodes, showInfo, showError],
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // do not steal a paste meant for a text field or for the IOC paste box
      if (e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]')) {
        return
      }
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      )
      const file = item?.getAsFile()
      if (!file) return
      e.preventDefault()
      void pasteCapture(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [pasteCapture])

  /* -- positions & deletions -------------------------------------------- */

  const onNodeDragStop = useCallback(
    // React Flow hands over the nodes actually moved (multi-selection
    // included): we save only those, outside any setState updater
    // (a side effect inside an updater would be replayed by StrictMode)
    (_event: unknown, _node: CanvasNode, dragged: CanvasNode[]) => {
      const positions: Record<string, { x: number; y: number }> = {}
      for (const n of dragged) {
        const pos = { x: n.position.x, y: n.position.y }
        if (n.type === 'annotNote') {
          const nid = n.id.slice(NOTE_PREFIX.length)
          api.pinNote(iid, nid, pos).catch(showError)
          setNotes((ns) =>
            ns.map((x) => (x.id === nid ? { ...x, position_x: pos.x, position_y: pos.y } : x)),
          )
        } else if (n.type === 'annotCapture') {
          api.updateCapture(iid, n.id.slice(CAPTURE_PREFIX.length), pos).catch(showError)
        } else {
          positions[n.id] = pos
        }
      }
      if (Object.keys(positions).length > 0) api.savePositions(iid, positions).catch(showError)
    },
    [iid, showError],
  )

  const ignore404 = useCallback(
    (e: unknown) => {
      if (!(e instanceof Error) || !e.message.includes('404')) showError(e)
    },
    [showError],
  )

  const onNodesDelete = useCallback(
    (deleted: CanvasNode[]) => {
      const entityIds = new Set<string>()
      const snapshots: Promise<EntitySnapshot | null>[] = []
      const names: string[] = []
      for (const n of deleted) {
        if (n.type === 'annotNote') {
          // Delete on a pinned note: we unpin it, it stays in the notes
          // panel (actually deleting it is done from there)
          const nid = n.id.slice(NOTE_PREFIX.length)
          api.pinNote(iid, nid, null).catch(ignore404)
          setNotes((ns) =>
            ns.map((x) => (x.id === nid ? { ...x, position_x: null, position_y: null } : x)),
          )
        } else if (n.type === 'annotCapture') {
          api.deleteCapture(iid, n.id.slice(CAPTURE_PREFIX.length)).catch(ignore404)
        } else {
          entityIds.add(n.id)
          names.push(n.data.entity.name)
          snapshots.push(
            api.deleteEntity(iid, n.id).catch((e) => {
              ignore404(e)
              return null
            }),
          )
        }
      }
      if (snapshots.length > 0) {
        void Promise.all(snapshots).then((list) => {
          const kept = list.filter((s): s is EntitySnapshot => s !== null)
          if (kept.length > 0) {
            pushUndo({ kind: 'entities', label: deletionLabel(names), snapshots: kept })
          }
        })
      }
      if (entityIds.size > 0) {
        setNotes((ns) => ns.filter((n) => !n.entity_id || !entityIds.has(n.entity_id)))
        // the entity's pinned notes go with it (store cascade)
        setNodes((ns) =>
          ns.filter(
            (n) => n.type !== 'annotNote' || !entityIds.has(n.data.note.entity_id ?? ''),
          ),
        )
      }
      setSelectedId(null)
      setSelectedNoteId(null)
    },
    [iid, ignore404, setNodes, pushUndo],
  )

  // deletion from the inspector (#78): goes through deleteElements to take
  // exactly the same cleanup path as the Delete key
  // (onNodesDelete + removal of the connected edges)
  const deleteEntity = useCallback(
    (entity: Entity) => {
      void deleteElements({ nodes: [{ id: entity.id }] })
    },
    [deleteElements],
  )

  // unlinks a capture from an entity (persists + updates the node)
  const unlinkCapture = useCallback(
    (cid: string, eid: string) => {
      const node = getNodes().find((n) => n.id === CAPTURE_PREFIX + cid) as
        | CaptureNodeType
        | undefined
      if (!node) return
      const ids = node.data.capture.entity_ids.filter((x) => x !== eid)
      api.updateCapture(iid, cid, { entity_ids: ids }).catch(showError)
      setNodes((ns) =>
        ns.map((n) =>
          n.id === node.id && n.type === 'annotCapture'
            ? { ...n, data: { ...n.data, capture: { ...n.data.capture, entity_ids: ids } } }
            : n,
        ),
      )
    },
    [iid, getNodes, setNodes, showError],
  )

  // fixing a relationship's verb from the inspector (#164)
  const updateRelation = useCallback(
    async (
      relationId: string,
      patch: { rel_type?: string; start_time?: string | null; stop_time?: string | null },
    ) => {
      try {
        const updated = await api.updateRelationship(iid, relationId, patch)
        // `selected` carried over from the replaced edge: without it React
        // Flow deselects the relationship on the first date typed, and the
        // panel closes under the analyst's fingers (#170)
        setEdges((es) =>
          es.map((e) => (e.id === relationId ? { ...toEdge(updated), selected: e.selected } : e)),
        )
      } catch (e) {
        showError(e)
      }
    },
    [iid, setEdges, showError],
  )

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      const rows: Promise<RelationshipRow | null>[] = []
      for (const e of deleted) {
        if (e.id.startsWith('annot:cap:')) {
          // annotation link: we unlink, nothing to do with STIX relationships
          const [, , cid, eid] = e.id.split(':')
          unlinkCapture(cid, eid)
        } else if (!e.id.startsWith('annot:')) {
          // the backend cascade may already have deleted it with its entity
          rows.push(
            api.deleteRelationship(iid, e.id).catch((err) => {
              ignore404(err)
              return null
            }),
          )
        }
      }
      if (rows.length > 0) {
        void Promise.all(rows).then((list) => {
          const kept = list.filter((r): r is RelationshipRow => r !== null)
          if (kept.length > 0) {
            pushUndo({
              kind: 'relationships',
              label: kept.length === 1 ? kept[0].rel_type : `${kept.length} relationships`,
              rows: kept,
            })
          }
        })
      }
      setSelectedEdgeId(null)
    },
    [iid, ignore404, unlinkCapture, pushUndo],
  )

  // deletion from the inspector (#129): goes through deleteElements to take
  // exactly the same path as the Delete key (onEdgesDelete)
  const deleteRelation = useCallback(
    (edgeId: string) => {
      void deleteElements({ edges: [{ id: edgeId }] })
    },
    [deleteElements],
  )

  /**
   * Refreshes what the status bar sums up: validation warnings, and how
   * fresh the export is.
   *
   * The lint used to live only in the export dialog: problems were found on
   * the way out, once the investigation was over. Shown permanently, it
   * becomes a feedback loop rather than a customs check at the exit.
   *
   * We also re-read the investigation record, for its `updated_at`: without
   * that the bar would keep the one from load time, and would show
   * "exported" indefinitely while the canvas has changed - a save indicator
   * that lies is worse than no indicator.
   *
   * Deferred: all of this re-reads the database, and doing it on every frame
   * of a node drag would cost a lot for an identical result.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      api
        .lintInvestigation(iid)
        .then((findings) => {
          const warnings = findings.filter((f) => f.level === 'warn')
          setLintWarnings(warnings.length)
          setLintFlagged(
            new Set(findings.flatMap((f) => (f.entityId === undefined ? [] : [f.entityId]))),
          )
        })
        .catch(() => {
          setLintWarnings(0)
          setLintFlagged(new Set())
        })
      api
        .getInvestigation(iid)
        .then(setInvestigation)
        .catch(() => undefined)
    }, 800)
    return () => window.clearTimeout(timer)
  }, [iid, nodes, edges, notes])

  /**
   * Bulk edit (#185).
   *
   * `updateEntity` replaces `properties` wholesale: so we start again from
   * EACH object's own properties, otherwise setting a TLP would wipe its
   * aliases, its dates and all the rest. The merge rules are in bulk.ts.
   */
  const applyBulk = useCallback(
    async (patch: BulkPatch) => {
      const targets = selectedIds
        .map((id) => entityById.get(id))
        .filter((e): e is Entity => e !== undefined)
      if (targets.length === 0) return
      try {
        for (const entity of targets) {
          await api.updateEntity(iid, entity.id, {
            properties: applyBulkPatch(entity.properties, patch) as Entity['properties'],
          })
        }
        await reload()
        // `reload` rebuilds the nodes without their selection: without this
        // restore, the panel closes on every apply and everything has to be
        // reselected to chain a second field
        const kept = new Set(targets.map((e) => e.id))
        setNodes((ns) => ns.map((n) => ({ ...n, selected: kept.has(n.id) })))
        showInfo(`Updated ${targets.length} objects.`)
      } catch (e) {
        showError(e)
      }
    },
    [iid, selectedIds, entityById, reload, setNodes, showInfo, showError],
  )

  const bulkSelection = useMemo(
    () =>
      selectedIds
        .map((id) => entityById.get(id))
        .filter((e): e is Entity => e !== undefined),
    [selectedIds, entityById],
  )

  /**
   * A selection reopens the inspector.
   *
   * This is what makes the automatic folding bearable: on a narrow screen you
   * navigate with the whole canvas, and the panel comes back exactly when it
   * becomes relevant. The effect only fires on a CHANGE of selection, so
   * folding the column while a node is selected does not reopen it a second
   * later.
   */
  const [focusInspector, setFocusInspector] = useState(0)
  useEffect(() => {
    if (selectedId || selectedEdgeId || selectedNoteId || selectedIds.length > 1) {
      setLayout((l) => (l.right ? l : { ...l, right: true }))
      // ask for the Inspector tab: selecting something is asking to see it,
      // not to re-read the narrative
      setFocusInspector((n) => n + 1)
    }
  }, [selectedId, selectedEdgeId, selectedNoteId, selectedIds.length])

  /* -- undo (Ctrl+Z) -------------------------------------------------------- */

  /**
   * Undoes the last deletion, or failing that the last repositioning.
   *
   * The fallback to `restoreLayout` is not an elegance: without it, Ctrl+Z
   * right after an arrangement would do nothing while a "My layout" button
   * sits there on screen. Ctrl+Z has to undo "the last thing" - and here the
   * last thing is however many arrangements were tried in a row, since that
   * is what the analyst thinks of as one detour.
   */
  const undo = useCallback(async () => {
    if (undoStack.length === 0) {
      if (layoutBackup) void restoreLayout()
      else showInfo('Nothing to undo.')
      return
    }
    // everything pushed within the same fraction of a second belongs to the
    // same gesture: we undo it as one block (see UNDO_COALESCE_MS)
    const last = undoStack[undoStack.length - 1]
    let from = undoStack.length - 1
    while (from > 0 && last.at - undoStack[from - 1].at <= UNDO_COALESCE_MS) from -= 1
    const group = undoStack.slice(from)
    try {
      // entities first: a relationship only restores if both of its
      // endpoints are already back
      for (const action of group) {
        if (action.kind === 'entities') {
          for (const snap of action.snapshots) await api.restoreEntity(iid, snap)
        }
      }
      let dropped = 0
      for (const action of group) {
        if (action.kind === 'relationships') {
          for (const row of action.rows) {
            if (!(await api.restoreRelationship(iid, row))) dropped += 1
          }
        }
      }
      for (const action of group) {
        if (action.kind === 'note') await api.restoreNote(iid, action.row)
      }
      if (dropped > 0) {
        showError(
          `${dropped} relationship(s) could not be restored: one of their endpoints is gone.`,
        )
      }
      // Popped ONLY now: popping before the restores lost the entry whenever
      // one of them failed, so the analyst could not even retry. The restores
      // are idempotent (`put` on the original id), so a second Ctrl+Z during
      // the wait breaks nothing.
      setUndoStack((s) => s.slice(0, from))
      await reload()
      showInfo(`Restored ${group.map((a) => a.label).join(', ')}.`)
    } catch (e) {
      showError(e)
    }
  }, [undoStack, iid, reload, showInfo, showError, layoutBackup, restoreLayout])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      // inside a field, Ctrl+Z must stay the browser's own undo of typing
      if (el?.closest('input, textarea, [contenteditable]')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        void undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  /* -- command palette (Ctrl+K) -------------------------------------------- */

  const paletteActions = useMemo(
    () => [
      { label: 'Export STIX bundle…', hint: 'export', run: () => setShowExport(true) },
      { label: 'Export image / PDF / Markdown…', hint: 'share', run: () => setShowImageExport(true) },
      { label: 'Paste IOCs…', hint: 'import', run: openPaste },
      // every arrangement is searchable, so the menu is a shortcut and not the
      // only door
      ...ARRANGEMENTS.map((a) => ({
        label: `Arrange the canvas: ${a.label.toLowerCase()}`,
        hint: 'canvas',
        run: () => arrangeCanvas(a.id),
      })),
      // Dagre stays reachable, one search away, for the times the structure is
      // the question. It is not the button any more because on a real CTI
      // graph it answers with a 5700px ribbon (layout.ts).
      { label: 'Re-layout the graph by relationship', hint: 'canvas', run: reorganize },
      { label: 'Toggle the objects panel', hint: 'Ctrl B', run: toggleSidebar },
      { label: 'Toggle the inspector', hint: 'panel', run: toggleInspector },
      { label: 'Undo the last deletion', hint: 'Ctrl Z', run: () => void undo() },
      { label: 'Search the canvas', hint: '/', run: () => setSearchOpen(true) },
      {
        label: linkFocus ? 'Stop highlighting what the selection links to' : 'Highlight what the selection links to',
        hint: 'L',
        run: toggleLinkFocus,
      },
      { label: 'Keyboard shortcuts', hint: '?', run: () => setShowShortcuts(true) },
      {
        label: 'STIX guide: what links to what',
        hint: 'help',
        run: () => window.open('#/guide', '_blank'),
      },
      {
        label: 'Your data: what stays here, what leaves',
        hint: 'help',
        run: () => window.open('/about', '_blank'),
      },
      {
        label: 'Enrichment endpoints…',
        hint: 'settings',
        run: () => setShowEnrichSettings(true),
      },
      { label: 'Back to investigations', hint: 'navigate', run: () => (location.hash = '#/') },
    ],
    [openPaste, reorganize, undo, toggleSidebar, toggleInspector],
  )

  /* ---------------------------------------------------------------------- */

  return (
    <>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        entities={narrativeEntities}
        onGoTo={goToEntity}
        onCreate={setAddType}
        onPickAttack={pickAttack}
        onPickTemplate={setActiveTemplate}
        onRelate={relateFromPalette}
        selectedEntityId={selectedId}
        selectedEntityIds={selectedIds}
        actions={paletteActions}
      />
      {/* Before the top bar: a state that LASTS is read before the rest, and
          it pushes the content instead of covering it. Stuck at the bottom it
          blurred into the status bar, whose job is the opposite: reporting
          what is going well. */}
      {alert && <Alert alert={alert} onDismiss={() => setAlert(null)} />}
      <div className="topbar">
        <a className="brand" href="#/">
          <img src="/logo.svg" alt="" />
          DRAW ME A STIX
        </a>
        <span className="inv-name">{investigation?.name ?? '…'}</span>
        <span className="spacer" />
        {/* a shortcut nothing announces exists for nobody: the palette needs
            a visible door as much as it needs its Ctrl+K */}
        <button className="cmdk-hint" onClick={() => setPaletteOpen(true)}>
          <Icon name="search" size={14} />
          <span className="cmdk-label">Search or run a command</span>
          <span className="kbd">Ctrl K</span>
        </button>
        <span className="spacer" />
        {/* same reason as for Ctrl+K: "?" is only learned if something shows
            it. The icon serves as the door, the key as the shortcut. */}
        <button
          className="topbar-icon"
          title="Keyboard shortcuts (?)"
          onClick={() => setShowShortcuts(true)}
        >
          <Icon name="help" size={15} />
        </button>
        <TopbarMenu label="Import" icon={<Icon name="import" size={15} />}>
          {(close) => (
            <>
              <label
                className="menu-item"
                title="PDF, docx, html, txt… - local extraction, the file is neither uploaded nor kept"
              >
                <Icon name="import" size={15} />
                <span>
                  A document…
                  <em>PDF, docx, html, txt - extracted locally</em>
                </span>
                <input
                  type="file"
                  accept={ACCEPT}
                  multiple
                  hidden
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? [])
                    if (files.length > 0) importDocuments(files)
                    e.target.value = ''
                    close()
                  }}
                />
              </label>
              <label className="menu-item" title="Import a STIX 2.1 bundle → new investigation">
                <Icon name="doc" size={15} />
                <span>
                  A STIX bundle…
                  <em>opens a new investigation</em>
                </span>
                <input
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) importStix(file)
                    e.target.value = ''
                    close()
                  }}
                />
              </label>
              <button
                className="menu-item"
                onClick={() => {
                  openPaste()
                  close()
                }}
              >
                <Icon name="paste" size={15} />
                <span>
                  Paste IOCs…
                  <em>defanged or not</em>
                </span>
              </button>
            </>
          )}
        </TopbarMenu>
        <TopbarMenu label="Share" icon={<Icon name="image" size={15} />}>
          {(close) => (
            <button
              className="menu-item"
              onClick={() => {
                setShowImageExport(true)
                close()
              }}
            >
              <Icon name="image" size={15} />
              <span>
                Image / PDF / MD…
                <em>for a report, not for a machine</em>
              </span>
            </button>
          )}
        </TopbarMenu>
        <button className="primary" onClick={() => setShowExport(true)}>
          <Icon name="export" size={15} />
          Export STIX
        </button>
        {/* Named, not pictured. It wore a magnifying glass, which says "search"
            in every other piece of software on the analyst's screen, and this
            button configures where enrichment requests are sent. No icon was
            going to carry that, so the word does it.

            Past the primary action on purpose: it is a setting, not a step of
            the work, and the far right is where settings are looked for. */}
        <button
          className="topbar-btn"
          title="Where enrichment requests are sent. Nothing leaves this browser until you add one."
          onClick={() => setShowEnrichSettings(true)}
        >
          Enrichment
          {endpoints.length > 0 && <span className="topbar-count">{endpoints.length}</span>}
        </button>
      </div>
      <div className="workspace">
        <Sidebar
          onAdd={setAddType}
          onPaste={openPaste}
          onPickAttack={pickAttack}
          onPickTemplate={setActiveTemplate}
          onLoadTemplate={loadCustomTemplate}
          candidateCount={candidates.length}
          triageOpen={triageOpen}
          onToggleTriage={toggleTriage}
          panel={sidePanel}
          onPanel={choosePanel}
        />
        <div className="canvas-wrap">
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            onSelectionChange={({ nodes: sel, edges: selEdges }) => {
              const first = sel[0] as CanvasNode | undefined
              setSelectedId(first?.type === 'entity' ? first.id : null)
              setSelectedIds(
                (sel as CanvasNode[]).filter((n) => n.type === 'entity').map((n) => n.id),
              )
              setSelectedNoteId(
                first?.type === 'annotNote' ? first.id.slice(NOTE_PREFIX.length) : null,
              )
              setSelectedEdgeId(selEdges[0]?.id ?? null)
            }}
            deleteKeyCode={['Delete']}
            // Ctrl+click is React Flow's default off macOS, but a window
            // manager can intercept it before the page ever sees it (seen
            // under Hyprland). Shift+click always gets through, and it is
            // the expected gesture everywhere anyway.
            multiSelectionKeyCode={['Control', 'Meta', 'Shift']}
            fitView
            // See `fitSoon`: a whole investigation does not fit on a screen at
            // half size, and this is the only place the limit is real.
            minZoom={0.15}
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} />
            <Controls />
            <Legend />
            {/* 200px wide: on a narrow canvas it eats the very space it is
                supposed to help you cover */}
            {viewportWidth >= MINIMAP_BREAKPOINT && <MiniMap pannable zoomable />}
            {searchOpen && (
              <Panel position="top-left" className="search-panel">
                <Icon name="search" size={14} />
                <input
                  autoFocus
                  placeholder="Search (name, type, label, note)…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setHitIndex(0)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeSearch()
                    if (e.key === 'Enter' && hits.length > 0) {
                      const next = e.shiftKey ? hitIndex - 1 : hitIndex + 1
                      setHitIndex(next)
                      centerOnHit(next)
                    }
                  }}
                />
                {/* "3 / 12" and not "12 results": on a dense graph, knowing
                    how many are left matters as much as how many there are.
                    `hitIndex` already existed, it just was not shown. */}
                <span className="search-count">
                  {query.trim()
                    ? hits.length > 0
                      ? `${(((hitIndex % hits.length) + hits.length) % hits.length) + 1} / ${hits.length}`
                      : '0'
                    : '/'}
                </span>
                <button className="rf-btn" title="Close (Esc)" onClick={closeSearch}>
                  <Icon name="cross" size={13} />
                </button>
              </Panel>
            )}
            <Panel position="top-right" className="rf-actions">
              <button
                className="rf-btn"
                title="Search the canvas (/ key)"
                onClick={() => setSearchOpen(true)}
              >
                <Icon name="search" size={15} />
              </button>
              <button
                className={`rf-btn${linkFocus ? ' on' : ''}`}
                aria-pressed={linkFocus}
                onClick={toggleLinkFocus}
                title="Highlight what the selection is linked to (L)"
              >
                <Icon name="target" size={15} />
              </button>
              {/* The button asks a question rather than promising a drawing:
                  each entry lines the objects up in blocks that answer one,
                  and the arranging of meaning stays the analyst's. */}
              <TopbarMenu
                label="Arrange"
                icon={<Icon name="layout" size={15} />}
                buttonClass="rf-btn"
              >
                {(close) =>
                  ARRANGEMENTS.map((a) => (
                    <button
                      key={a.id}
                      className="menu-item"
                      onClick={() => {
                        close()
                        arrangeCanvas(a.id)
                      }}
                    >
                      <span>
                        {a.label}
                        <em>{a.hint}</em>
                      </span>
                    </button>
                  ))
                }
              </TopbarMenu>
              {layoutBackup && (
                <button
                  className="rf-btn"
                  onClick={restoreLayout}
                  title="Put the objects back where you had them, before the arrangements"
                >
                  <Icon name="return" size={15} />
                  My layout
                </button>
              )}
            </Panel>
          </ReactFlow>
          <TriageTray
            open={triageOpen}
            onToggle={toggleTriage}
            candidates={candidates}
            onConfirm={onConfirmCandidate}
            onReject={onRejectCandidate}
            onConfirmAll={onConfirmAll}
            onConfirmGroup={onConfirmGroup}
            onRejectGroup={onRejectGroup}
            contextByEntity={contextByEntity}
          />
        </div>
        <RightColumn
          inspector={
            bulkSelection.length > 1 ? (
              <BulkInspector entities={bulkSelection} onApply={applyBulk} />
            ) : (
            <Inspector
              selected={selected}
              selectedRelation={selectedRelation}
              selectedAnnotation={selectedAnnotation}
              selectedNote={selectedNote}
              selectedNoteEntity={selectedNoteEntity}
              selectedNotes={selectedNotes}
              enrichEnabled={endpoints.length > 0}
              onDeleteRelation={deleteRelation}
              onUpdateRelation={updateRelation}
              onPinNote={togglePinNote}
              onUpdate={updateEntity}
              onGenerateIndicator={generateIndicator}
              onEnrich={setEnrichEntity}
              onDuplicate={duplicateEntity}
              onSendToTriage={sendToTriage}
              onDeleteEntity={deleteEntity}
              onAddNote={addNote}
              onDeleteNote={deleteNote}
            />
            )
          }
          narrative={<Narrative entities={narrativeEntities} relations={narrativeRelations} />}
          open={layout.right}
          onToggle={toggleInspector}
          focusInspector={focusInspector}
        />
      </div>
      {investigation && (
        <WorkNotes key={iid} investigationId={iid} initialText={investigation.scratchpad ?? ''} />
      )}
      <StatusBar
        objects={narrativeEntities.length}
        breakdown={typeBreakdown}
        relationships={narrativeRelations.length}
        candidates={candidates.length}
        notes={notes.length}
        lintWarnings={lintWarnings}
        updatedAt={investigation?.updated_at}
        exportedAt={investigation?.exported_at}
        exportedStateAt={investigation?.exported_state_at}
      />

      {lightbox && <CaptureLightbox capture={lightbox} onClose={() => setLightbox(null)} />}

      {addType && (
        <Modal
          onClose={() => setAddType(null)}
          title={
            <>
              New object -{' '}
              <span style={{ color: typeMeta(addType).color }}>
                {typeMeta(addType).label}
              </span>
            </>
          }
        >
          <EntityForm
            autoFocus
            stixType={addType}
            submitLabel="Add"
            onSubmit={(name, props) => createEntity(addType, name, props)}
            onCancel={() => setAddType(null)}
          />
        </Modal>
      )}
      {showPaste && (
        <QuickPaste onAdd={(iocs) => void addIocs(iocs)} onCancel={() => setShowPaste(false)} />
      )}
      {bridging && (
        <BridgeDialog
          match={bridging}
          onApply={(choices) =>
            void (async () => {
              for (const c of choices) await applyBridge(bridging, c.recipe, c.name)
            })()
          }
          onCancel={() => setBridging(null)}
        />
      )}
      {showEnrichSettings && (
        <EnrichSettings
          endpoints={endpoints}
          onChange={setEndpoints}
          onClose={() => setShowEnrichSettings(false)}
        />
      )}
      {enrichEntity && (
        <EnrichDialog
          entity={enrichEntity}
          endpoints={endpoints}
          onRun={applyEnrichment}
          onClose={() => setEnrichEntity(null)}
        />
      )}
      {activeTemplate && (
        <TemplateDialog
          template={activeTemplate}
          onApply={(plan) => void applyPlan(plan)}
          onCancel={() => setActiveTemplate(null)}
        />
      )}
      {pending && (
        <RelationDialog
          pending={pending}
          onCancel={() => setPending(null)}
          onSubmit={confirmRelation}
        />
      )}
      {showExport && investigation && (
        <ExportDialog
          investigation={investigation}
          onClose={() => setShowExport(false)}
          onExported={() => void reload()}
        />
      )}
      {showImageExport && (
        <ImageExportDialog
          title={investigation?.name ?? 'Investigation'}
          nodes={nodes}
          entities={narrativeEntities}
          relations={narrativeRelations}
          onClose={() => setShowImageExport(false)}
        />
      )}
      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      {error && <div className="error-banner">{error}</div>}
      {info && !error && <div className="info-banner">{info}</div>}
    </>
  )
}

export default function Workspace({ investigationId }: { investigationId: string }) {
  return (
    <ReactFlowProvider>
      <WorkspaceInner investigationId={investigationId} />
    </ReactFlowProvider>
  )
}
