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
