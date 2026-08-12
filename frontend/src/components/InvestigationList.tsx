import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { ReplacedInvestigation } from '../store'
import type { ImportResult, Investigation } from '../types'
import Icon from './Icon'
import Modal from './Modal'

export default function InvestigationList() {
  const [investigations, setInvestigations] = useState<Investigation[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [importReport, setImportReport] = useState<ImportResult | null>(null)
  const [busyDemo, setBusyDemo] = useState(false)
  // backup / restore (#123)
  const [pendingRestore, setPendingRestore] = useState<{
    data: unknown
    replaced: ReplacedInvestigation[]
    counts: { investigations: number; captures: number }
  } | null>(null)
  const [restoreReport, setRestoreReport] = useState<string | null>(null)
  const backupInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const reload = () => {
    api.listInvestigations().then(setInvestigations).catch((e) => setError(String(e)))
  }

  useEffect(reload, [])

  const create = async () => {
    if (!name.trim()) return
    try {
      const inv = await api.createInvestigation(name.trim())
      setName('')
      window.location.hash = `#/inv/${inv.id}`
    } catch (e) {
      setError(String(e))
    }
  }

  const importFile = async (file: File) => {
    try {
      const text = await file.text()
      let bundle: unknown
      try {
        bundle = JSON.parse(text)
      } catch {
        throw new Error('This file is not valid JSON')
      }
      const result = await api.importBundle(bundle, file.name.replace(/\.[^.]*$/, ''))
      setImportReport(result)
      reload()
    } catch (e) {
      setError(String(e))
    }
  }

  // "Operation Aviary" demo (#115): the module and the bundle are only
  // loaded on click - no weight at startup
  const loadDemo = async () => {
    setBusyDemo(true)
    setError(null)
    try {
      const { loadDemoInvestigation } = await import('../demo')
      window.location.hash = `#/inv/${await loadDemoInvestigation()}`
    } catch (e) {
      setError(`Loading the example: ${(e as Error).message}`)
    } finally {
      setBusyDemo(false)
    }
  }

  // Full backup (#123): everything IndexedDB holds, including what STIX
  // cannot carry (triage, positions, captures, drafts).
  const saveBackup = async (includeSettings: boolean) => {
    try {
      const file = await api.exportBackup(includeSettings)
      const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dmas-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(`Backup: ${(e as Error).message}`)
    }
  }

  // two-step restore: we announce what is about to be replaced
  const openBackup = async (file: File) => {
    try {
      const data: unknown = JSON.parse(await file.text())
      const { file: parsed, replaced } = await api.inspectBackup(data)
      setPendingRestore({
        data,
        replaced,
        counts: {
          investigations: parsed.investigations.length,
          captures: (parsed.captures ?? []).length,
        },
      })
    } catch (e) {
      setError(`Restore: ${(e as Error).message}`)
    }
  }

  const confirmRestore = async () => {
    if (!pendingRestore) return
    try {
      const report = await api.importBackup(pendingRestore.data)
      setPendingRestore(null)
      setRestoreReport(
        `${report.investigations} investigation(s) restored` +
          (report.replaced.length > 0 ? ` (including ${report.replaced.length} replaced)` : '') +
          ` - ${report.entities} entities, ${report.relationships} relationships, ` +
          `${report.notes} notes, ${report.captures} capture(s)` +
          (report.settings ? ', settings included' : '') +
          // Said out loud: a file carrying enrichment endpoints would
          // repoint the app at a sidecar chosen by whoever built that
          // file. We refuse, and we say so - a silent refusal would let
          // the file pass for harmless.
          (report.skippedSettings > 0
            ? '. Note: this file also carried enrichment endpoint settings ' +
              '(a URL and its token), which were NOT applied. Check your ' +
              'enrichment settings if you expected them.'
            : '') +
          // Same principle as above: what we refuse to write gets said.
          // These rows point at an investigation the file does not carry,
          // so writing them would touch an investigation the confirmation
          // dialog never named.
          (report.skippedRows > 0
            ? `. ${report.skippedRows} row(s) in this file belonged to no restored ` +
              'investigation and were left out.'
            : ''),
      )
      reload()
    } catch (e) {
      setPendingRestore(null)
      setError(`Restore: ${(e as Error).message}`)
    }
  }

  const remove = async (inv: Investigation) => {
    if (!window.confirm(`Delete "${inv.name}" and all its content?`)) return
    await api.deleteInvestigation(inv.id)
    reload()
  }

  return (
    <>
      <div className="topbar">
        <a className="brand" href="#/">
          <img src="/logo.svg" alt="" />
          DRAW ME A STIX
        </a>
      </div>
      <div className="home">
        <h1>Investigations</h1>
        <p className="tagline">
          The CTI analyst's STIX scratchpad - structure it, annotate it, export it.
        </p>
        {/* Way into the guide: on the home page, so it is read BEFORE
            starting. The shortcuts memo lives on the canvas ("?") instead,
            where it is needed. Two audiences, two places. */}
        <p className="home-guide-link">
          <a href="#/guide">
            <Icon name="help" size={14} />
            New to STIX? Objects, observables and what links to what
          </a>
        </p>
        <div className="create-row">
          <input
            placeholder="Name of the new investigation…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button className="primary" onClick={create} disabled={!name.trim()}>
            Create
          </button>
          <button onClick={() => fileInput.current?.click()}>Import a bundle</button>
          <button
            onClick={loadDemo}
            disabled={busyDemo}
            title="Fictional investigation 'Operation Aviary': entities, relationships, notes and captures"
          >
            {busyDemo ? 'Loading…' : 'Load the example'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importFile(f)
              e.target.value = ''
            }}
          />
        </div>
        {investigations.length === 0 ? (
          <div className="welcome">
            <h2>First time here?</h2>
            <p>
              Load "Operation Aviary", a complete fictional investigation:
              around thirty linked STIX objects, the analyst's notes and their
              screenshots. Nothing leaves your browser.
            </p>
            <button className="primary" onClick={loadDemo} disabled={busyDemo}>
              <Icon name="scenario" size={15} />
              {busyDemo ? 'Loading…' : 'Load the example investigation'}
            </button>
          </div>
        ) : (
          <table className="inv-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Entities</th>
                <th>Relationships</th>
                <th>Modified</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {investigations.map((inv) => (
                <tr key={inv.id}>
                  <td
                    className="name"
                    onClick={() => (window.location.hash = `#/inv/${inv.id}`)}
                  >
                    {inv.name}
                  </td>
                  <td>{inv.entity_count}</td>
                  <td>{inv.relationship_count}</td>
                  <td>{new Date(inv.updated_at).toLocaleString()}</td>
                  <td>
                    <button className="danger" onClick={() => remove(inv)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="backup-row">
          {/* The link leaves the SPA for /about, a page served as HTML (#225).
              That is where we spell out what "everything lives in this
              browser" really implies: retention, erasure, what a backup
              file carries. */}
          <span className="hint">
            Everything lives in this browser: a regular backup protects you
            from a cleared cache or a change of machine.{' '}
            <a href="/about">Where your data lives</a>
          </span>
          <button onClick={() => saveBackup(false)}>
            <Icon name="export" size={14} /> Back up everything
          </button>
          <button onClick={() => backupInput.current?.click()}>
            <Icon name="import" size={14} /> Restore…
          </button>
          <input
            ref={backupInput}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) openBackup(f)
              e.target.value = ''
            }}
          />
        </div>
        {error && <div className="error-banner">{error}</div>}
        {restoreReport && (
          <Modal title="Restore complete" onClose={() => setRestoreReport(null)}>
            <p>{restoreReport}</p>
            <div className="actions">
              <button className="primary" onClick={() => setRestoreReport(null)}>
                Close
              </button>
            </div>
          </Modal>
        )}
        {pendingRestore && (
          <Modal title="Restore this backup?" onClose={() => setPendingRestore(null)}>
            <p>
              {pendingRestore.counts.investigations} investigation(s),{' '}
              {pendingRestore.counts.captures} capture(s).
            </p>
            {pendingRestore.replaced.length > 0 ? (
              <div className="export-problems">
                <strong>
                  {pendingRestore.replaced.length} investigation(s) already present
                  will be replaced:
                </strong>
                {/* The content destroyed, not just the name: restoring
                    yesterday's backup can wipe work done today, and the
                    dialog used to say nothing about it. */}
                <ul>
                  {pendingRestore.replaced.map((r) => (
                    <li key={r.name}>
                      {r.name}, {r.entities} object{r.entities === 1 ? '' : 's'},{' '}
                      {r.relationships} relationship{r.relationships === 1 ? '' : 's'},{' '}
                      {r.notes} note{r.notes === 1 ? '' : 's'}, last modified{' '}
                      {new Date(r.updatedAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="hint">
                No existing investigation will be touched: everything is added.
              </p>
            )}
            <div className="actions">
              <button onClick={() => setPendingRestore(null)}>Cancel</button>
              <button className="primary" onClick={confirmRestore}>
                Restore
              </button>
            </div>
          </Modal>
        )}
        {importReport && (
          <Modal title="Bundle imported" onClose={() => setImportReport(null)}>
            <p>
              <strong>{importReport.investigation.name}</strong> -{' '}
              {importReport.report.entities} entities,{' '}
              {importReport.report.relationships} relationships,{' '}
              {importReport.report.notes} notes.
            </p>
            {Object.entries(importReport.report.skipped).length > 0 && (
              <p className="hint">
                Skipped:{' '}
                {Object.entries(importReport.report.skipped)
                  .map(([t, c]) => `${t} ×${c}`)
                  .join(', ')}
              </p>
            )}
            {importReport.report.warnings.map((w, i) => (
              <p key={i} className="hint">
                <Icon name="warning" size={13} /> {w}
              </p>
            ))}
            <div className="actions">
              <button onClick={() => setImportReport(null)}>Close</button>
              <button
                className="primary"
                onClick={() =>
                  (window.location.hash = `#/inv/${importReport.investigation.id}`)
                }
              >
                Open the investigation
              </button>
            </div>
          </Modal>
        )}
      </div>
    </>
  )
}
