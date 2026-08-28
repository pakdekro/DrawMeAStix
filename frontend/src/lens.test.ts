import { describe, expect, it } from 'vitest'
import { LENSES, lensHits, type LensEdge, type LensNode } from './lens'

const node = (id: string, extra: Partial<LensNode> = {}): LensNode => ({
  id,
  stix_type: 'malware',
  tlp: '',
  source: 'manual',
  flagged: false,
  ...extra,
})
const edge = (source: string, target: string, rel_type = 'uses'): LensEdge => ({
  source,
  target,
  rel_type,
})

describe('lens: no indicator on it', () => {
  const nodes = [
    node('mal'),
    node('dom', { stix_type: 'domain-name' }),
    node('ind', { stix_type: 'indicator' }),
  ]

  it('lights what no indicator points at', () => {
    const hits = lensHits('uncovered', nodes, [edge('ind', 'dom', 'indicates')])
    expect(hits.has('mal')).toBe(true)
    expect(hits.has('dom')).toBe(false)
  })

  // Otherwise the lens lights up the very objects doing the covering.
  it('never lights an indicator itself', () => {
    expect(lensHits('uncovered', nodes, []).has('ind')).toBe(false)
  })

  it('only `indicates` counts as coverage', () => {
    expect(lensHits('uncovered', nodes, [edge('ind', 'dom', 'related-to')]).has('dom')).toBe(true)
  })
})

describe('lens: no relationship at all', () => {
  it('lights what nothing touches, in either direction', () => {
    const nodes = [node('a'), node('b'), node('alone')]
    const hits = lensHits('loose', nodes, [edge('a', 'b')])
    expect([...hits]).toEqual(['alone'])
  })
})

describe('lens: no TLP of its own', () => {
  it('lights the objects that will inherit the export marking', () => {
    const nodes = [node('bare'), node('amber', { tlp: 'amber' })]
    expect([...lensHits('unmarked', nodes, [])]).toEqual(['bare'])
  })
})

describe('lens: machine-supplied', () => {
  it('counts imports, documents and enrichers', () => {
    const nodes = [
      node('imported', { source: 'import' }),
      node('fromDoc', { source: 'doc:report.pdf' }),
      node('enriched', { source: 'enrich:whois' }),
    ]
    expect(lensHits('machine', nodes, []).size).toBe(3)
  })

  /**
   * Pasting IOCs is the analyst reading a report and typing. What the lens
   * asks is whether a human looked at it, not whether it was typed one
   * character at a time.
   */
  it('leaves what the analyst put there, pasted or not', () => {
    const nodes = [node('typed', { source: 'manual' }), node('pasted', { source: 'paste' })]
    expect(lensHits('machine', nodes, []).size).toBe(0)
  })
})

describe('lens: the export will complain', () => {
  it('lights what the validator flagged', () => {
    const nodes = [node('bad', { flagged: true }), node('fine')]
    expect([...lensHits('flagged', nodes, [])]).toEqual(['bad'])
  })
})

describe('every lens', () => {
  it('is not a special case for an empty canvas', () => {
    for (const l of LENSES) expect(lensHits(l.id, [], []).size).toBe(0)
  })

  it('answers with objects that are on the canvas', () => {
    const nodes = [node('a'), node('b', { flagged: true, tlp: 'red', source: 'import' })]
    const ids = new Set(nodes.map((n) => n.id))
    for (const l of LENSES) {
      for (const hit of lensHits(l.id, nodes, [edge('a', 'b')])) expect(ids.has(hit)).toBe(true)
    }
  })
})
