import { describe, expect, it } from 'vitest'
import { buildNarrative, type NarrEntity, type NarrRelation } from './narrative'

const E: NarrEntity[] = [
  { id: 'corax', stix_type: 'intrusion-set', name: 'Corax' },
  { id: 'nestdrop', stix_type: 'malware', name: 'NestDrop' },
  { id: 'eggshell', stix_type: 'malware', name: 'EggShell' },
  { id: 'cobalt', stix_type: 'tool', name: 'Cobalt Strike' },
  { id: 'dnest', stix_type: 'domain-name', name: 'nest.example' },
  { id: 'ip', stix_type: 'ipv4-addr', name: '1.2.3.4' },
  { id: 'ind', stix_type: 'indicator', name: 'C2 domain' },
  { id: 'orphan', stix_type: 'identity', name: 'Orphan' },
]
const R: NarrRelation[] = [
  { source: 'corax', type: 'uses', target: 'nestdrop' },
  { source: 'corax', type: 'uses', target: 'eggshell' },
  { source: 'corax', type: 'uses', target: 'cobalt' },
  { source: 'eggshell', type: 'communicates-with', target: 'dnest' },
  { source: 'dnest', type: 'resolves-to', target: 'ip' },
  { source: 'ind', type: 'based-on', target: 'dnest' },
  { source: 'ind', type: 'indicates', target: 'eggshell' },
]

describe('buildNarrative', () => {
  it("regroupe les cibles d'un même verbe par type", () => {
    const { story } = buildNarrative(E, R)
    expect(story).toContain(
      'The intrusion set Corax uses the malware NestDrop and EggShell and the tool Cobalt Strike.',
    )
  })

  it('décrit les observables comme des artefacts concrets', () => {
    const { story } = buildNarrative(E, R)
    expect(story).toContain('The malware EggShell communicates with the domain nest.example.')
    expect(story).toContain('The domain nest.example resolves to the IP 1.2.3.4.')
  })

  it('range les indicateurs dans la section détection, pas dans le récit', () => {
    const { story, detection } = buildNarrative(E, R)
    expect(detection).toContain(
      'The indicator "C2 domain" is based on the domain nest.example and detects the malware EggShell.',
    )
    expect(story.some((s) => s.includes('C2 domain'))).toBe(false)
  })

  it('liste les entités non rattachées', () => {
    const { isolated } = buildNarrative(E, R)
    expect(isolated).toEqual(['the entity Orphan'])
  })

  it('ignore les relations vers des entités absentes', () => {
    const { story } = buildNarrative(
      [{ id: 'a', stix_type: 'malware', name: 'M' }],
      [{ source: 'a', type: 'uses', target: 'ghost' }],
    )
    expect(story).toEqual([])
  })

  it("garde les indénombrables au singulier (pas de « malwares »)", () => {
    // replaces the old test on French contractions, gone since the switch
    // to English (#172)
    const { story } = buildNarrative(
      [
        { id: 'a', stix_type: 'threat-actor', name: 'A' },
        { id: 'm1', stix_type: 'malware', name: 'M1' },
        { id: 'm2', stix_type: 'malware', name: 'M2' },
        { id: 'i1', stix_type: 'infrastructure', name: 'I1' },
        { id: 'i2', stix_type: 'infrastructure', name: 'I2' },
      ],
      [
        { source: 'a', type: 'uses', target: 'm1' },
        { source: 'a', type: 'uses', target: 'm2' },
        { source: 'a', type: 'controls', target: 'i1' },
        { source: 'a', type: 'controls', target: 'i2' },
      ],
    )
    expect(story).toContain('The threat actor A uses the malware M1 and M2.')
    expect(story).toContain('The threat actor A controls the infrastructure I1 and I2.')
  })

  it('signale un graphe vide', () => {
    expect(buildNarrative([], [])).toEqual({
      story: [],
      detection: [],
      isolated: [],
      empty: true,
    })
  })
})
