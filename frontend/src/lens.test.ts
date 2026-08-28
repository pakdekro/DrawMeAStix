import { describe, expect, it } from 'vitest'
import { LENSES, labelHits, labelIndex, lensHits, type LensEdge, type LensNode } from './lens'

const node = (id: string, extra: Partial<LensNode> = {}): LensNode => ({
  id,
  stix_type: 'malware',
  labels: [],
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

describe('the labels in use', () => {
  it('counts the objects carrying each one', () => {
    const nodes = [
      node('a', { labels: ['ransomware', 'apt'] }),
      node('b', { labels: ['ransomware'] }),
      node('c', { labels: [] }),
    ]
    expect(labelIndex(nodes)).toEqual([
      { value: 'ransomware', count: 2 },
      { value: 'apt', count: 1 },
    ])
  })

  it('counts an object once however many times it repeats a label', () => {
    expect(labelIndex([node('a', { labels: ['dup', 'dup'] })])).toEqual([
      { value: 'dup', count: 1 },
    ])
  })

  it('breaks a tie on the count alphabetically, so the list never reshuffles', () => {
    const nodes = [node('a', { labels: ['zeta'] }), node('b', { labels: ['alpha'] })]
    expect(labelIndex(nodes).map((l) => l.value)).toEqual(['alpha', 'zeta'])
  })

  /**
   * STIX labels are free text and they drift. Folding the case would hide the
   * drift at the very moment a list makes it visible, and the bundle would
   * export two labels anyway.
   */
  it('keeps two spellings apart rather than tidying them together', () => {
    const nodes = [node('a', { labels: ['ransomware'] }), node('b', { labels: ['Ransomware'] })]
    expect(labelIndex(nodes)).toHaveLength(2)
  })

  it('says nothing about an investigation that labels nothing', () => {
    expect(labelIndex([node('a'), node('b')])).toEqual([])
  })

  it('lights the objects carrying one label, and only those', () => {
    const nodes = [
      node('a', { labels: ['apt'] }),
      node('b', { labels: ['apt', 'other'] }),
      node('c', { labels: ['other'] }),
    ]
    expect([...labelHits('apt', nodes)].sort()).toEqual(['a', 'b'])
    expect(labelHits('nothing-uses-this', nodes).size).toBe(0)
  })
})
