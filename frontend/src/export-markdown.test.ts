import { describe, expect, it } from 'vitest'
import { buildMarkdown } from './export-markdown'

const E = [
  { id: 'a', stix_type: 'intrusion-set', name: 'Corax' },
  { id: 'b', stix_type: 'malware', name: 'EggShell' },
  { id: 'c', stix_type: 'domain-name', name: 'nest.example' },
]
const R = [
  { source: 'a', type: 'uses', target: 'b' },
  { source: 'b', type: 'communicates-with', target: 'c' },
]

describe('buildMarkdown', () => {
  it('produit un bloc mermaid avec nœuds et arêtes', () => {
    const md = buildMarkdown('Op Test', E, R, false)
    expect(md).toContain('```mermaid')
    expect(md).toContain('graph TD')
    expect(md).toContain('n0["Intrusion Set: Corax"]')
    expect(md).toContain('n0 -->|uses| n1')
    expect(md).toContain('n1 -->|communicates-with| n2')
  })

  it('colore les nœuds par type via classDef', () => {
    const md = buildMarkdown('Op Test', E, R, false)
    expect(md).toMatch(/classDef stintrusionset stroke:#[0-9a-f]{6}/i)
    expect(md).toContain('class n0 stintrusionset')
  })

  it('inclut le récit seulement quand demandé', () => {
    expect(buildMarkdown('T', E, R, false)).not.toContain('## Narrative')
    const withNarr = buildMarkdown('T', E, R, true)
    expect(withNarr).toContain('## Narrative')
    expect(withNarr).toContain('The intrusion set Corax uses the malware EggShell.')
  })

  it('commence par le titre et cite la source', () => {
    const md = buildMarkdown('Mon Op', E, R, false)
    expect(md.startsWith('# Mon Op')).toBe(true)
    expect(md).toContain('https://app.drawmeastix.io')
  })
})

describe('buildMarkdown: the analyst notes', () => {
  const NOTES = [
    { entityId: 'a', kind: 'note' as const, value: null, content: 'Evidence stays thin.' },
    { entityId: 'a', kind: 'opinion' as const, value: 'agree', content: 'Two sources corroborate.' },
    { entityId: null, kind: 'note' as const, value: null, content: 'Reopen in a month.' },
  ]

  it('says nothing when nothing was written', () => {
    expect(buildMarkdown('T', E, R, false)).not.toContain('## Analyst notes')
    expect(buildMarkdown('T', E, R, false, [])).not.toContain('## Analyst notes')
  })

  it('files each note under the object it is about', () => {
    const md = buildMarkdown('T', E, R, false, NOTES)
    expect(md).toContain('## Analyst notes')
    expect(md).toContain('### Corax _(Intrusion Set)_')
    expect(md.indexOf('### Corax')).toBeLessThan(md.indexOf('> Evidence stays thin.'))
    expect(md.indexOf('> Evidence stays thin.')).toBeLessThan(md.indexOf('### About the case'))
    expect(md).toContain('### About the case')
    expect(md).toContain('> Reopen in a month.')
  })

  /**
   * A doubt set in the same voice as a finding becomes a finding by the time
   * it is read aloud, so it is quoted and the opinion says it is one.
   */
  it('marks an opinion as an opinion, with the scale the analyst chose', () => {
    expect(buildMarkdown('T', E, R, false, NOTES)).toContain('**Opinion: agree**')
  })

  it('comes after the narrative: the facts, then what is made of them', () => {
    const md = buildMarkdown('T', E, R, true, NOTES)
    expect(md.indexOf('## Narrative')).toBeLessThan(md.indexOf('## Analyst notes'))
  })

  it('keeps a note written over several lines readable as one quote', () => {
    const md = buildMarkdown('T', E, R, false, [
      { entityId: 'a', kind: 'note' as const, value: null, content: 'first\nsecond' },
    ])
    expect(md).toContain('> first\n> second')
  })
})
