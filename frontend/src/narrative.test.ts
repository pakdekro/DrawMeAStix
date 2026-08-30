import { describe, expect, it } from 'vitest'
import { buildNarrative, eventClause, eventSentence, timelines } from './narrative'
import type { NarrEntity, NarrRelation } from './narrative'

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

/** The sentence a block reads as, so the tests keep asserting on prose. */
const sentences = (story: { subject: string; clauses: string[] }[]) =>
  story.flatMap((b) => b.clauses.map((c) => `${b.subject} ${c}.`))

describe('buildNarrative', () => {
  it("regroupe les cibles d'un même verbe par type", () => {
    const { story } = buildNarrative(E, R)
    expect(sentences(story)).toContain(
      'The intrusion set Corax uses the malware NestDrop and EggShell and the tool Cobalt Strike.',
    )
  })

  it('décrit les observables comme des artefacts concrets', () => {
    const { story } = buildNarrative(E, R)
    expect(sentences(story)).toContain(
      'The malware EggShell communicates with the domain nest.example.',
    )
    expect(sentences(story)).toContain('The domain nest.example resolves to the IP 1.2.3.4.')
  })

  it('range les indicateurs dans la section détection, pas dans le récit', () => {
    const { story, detection } = buildNarrative(E, R)
    expect(detection).toContain(
      'The indicator "C2 domain" is based on the domain nest.example and detects the malware EggShell.',
    )
    expect(sentences(story).some((s) => s.includes('C2 domain'))).toBe(false)
  })

  /**
   * The point of grouping: a hub used to produce one paragraph per verb, each
   * opening with the same six words, and the reader spent the sentence finding
   * out it was still the same subject.
   */
  it('names a subject once, however many verbs it has', () => {
    const { story } = buildNarrative(
      [
        { id: 'c', stix_type: 'campaign', name: 'Aviary' },
        { id: 'v', stix_type: 'identity', name: 'ACME' },
        { id: 'm', stix_type: 'malware', name: 'EggShell' },
        { id: 'l', stix_type: 'location', name: 'France' },
      ],
      [
        { source: 'c', type: 'targets', target: 'v' },
        { source: 'c', type: 'uses', target: 'm' },
        { source: 'c', type: 'targets', target: 'l' },
      ],
    )
    expect(story).toHaveLength(1)
    expect(story[0].subject).toBe('The campaign Aviary')
    // one clause per verb, and the two targets of the same verb share theirs
    expect(story[0].clauses).toHaveLength(2)
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
    expect(sentences(story)).toContain('The threat actor A uses the malware M1 and M2.')
    expect(sentences(story)).toContain('The threat actor A controls the infrastructure I1 and I2.')
  })

  /**
   * The defect this fixes, found by modelling a real fraud case: eight dated
   * steps came out in type order, which for a fraud IS the wrong order. The
   * case is the sequence. Ordering them in place was the first answer and it
   * was half of one: a dated statement now leaves its subject's block for a
   * chronology where every subject's statements stand together.
   */
  describe('chronology', () => {
    const CASE: NarrEntity[] = [
      { id: 'c', stix_type: 'campaign', name: 'Ferronnier' },
      { id: 'm', stix_type: 'malware', name: 'EggShell' },
      { id: 'a1', stix_type: 'user-account', name: 'FR76...0143' },
      { id: 'a2', stix_type: 'user-account', name: 'FR76...0987' },
      { id: 'a3', stix_type: 'user-account', name: 'FR76...0555' },
    ]

    it('lifts a dated statement out of its block, and leaves the rest', () => {
      const { chronology, story } = buildNarrative(CASE, [
        { source: 'c', type: 'uses', target: 'm' },
        { source: 'c', type: 'compromises', target: 'a1', start_time: '2026-03-20' },
        { source: 'c', type: 'compromises', target: 'a2', start_time: '2026-03-14' },
      ])
      expect(chronology.map((e) => `${e.day} ${eventSentence(e)}`)).toEqual([
        '2026-03-14 The campaign Ferronnier compromises the account FR76...0987.',
        '2026-03-20 The campaign Ferronnier compromises the account FR76...0143.',
      ])
      expect(story).toEqual([
        { subject: 'The campaign Ferronnier', clauses: ['uses the malware EggShell'] },
      ])
    })

    it('two relations of the same day and verb share one event', () => {
      const { chronology } = buildNarrative(CASE, [
        { source: 'c', type: 'compromises', target: 'a1', start_time: '2026-03-14' },
        { source: 'c', type: 'compromises', target: 'a2', start_time: '2026-03-14' },
        { source: 'c', type: 'compromises', target: 'a3', start_time: '2026-03-15' },
      ])
      expect(chronology.map((e) => e.clause)).toEqual([
        'compromises the accounts FR76...0143 and FR76...0987',
        'compromises the account FR76...0555',
      ])
    })

    it('an imported timestamp is read as its day', () => {
      const { chronology } = buildNarrative(CASE, [
        { source: 'c', type: 'compromises', target: 'a1', start_time: '2026-03-14T09:12:00.000Z' },
        { source: 'c', type: 'compromises', target: 'a2', start_time: '2026-03-14' },
      ])
      expect(chronology).toHaveLength(1)
      expect(chronology[0].day).toBe('2026-03-14')
    })

    /**
     * The half an in-place ordering could not do: two subjects, one timeline.
     */
    it('interleaves the subjects, earliest first', () => {
      const { chronology, story } = buildNarrative(CASE, [
        // the malware comes first in type order and last in time
        { source: 'm', type: 'communicates-with', target: 'a3', start_time: '2026-04-02' },
        { source: 'c', type: 'compromises', target: 'a1', start_time: '2026-03-14' },
      ])
      expect(chronology.map((e) => e.subject)).toEqual([
        'The campaign Ferronnier',
        'The malware EggShell',
      ])
      // both subjects said everything they had to say with a date on it
      expect(story).toEqual([])
    })

    it('leaves the undated statements in blocks, in the reading order', () => {
      const { chronology, story } = buildNarrative(CASE, [
        { source: 'm', type: 'communicates-with', target: 'a3' },
        { source: 'c', type: 'compromises', target: 'a1', start_time: '2026-03-14' },
      ])
      expect(chronology).toHaveLength(1)
      expect(story.map((b) => b.subject)).toEqual(['The malware EggShell'])
    })

    it('gives a report one timeline per subject, and only when it says something new', () => {
      const oneSubject = buildNarrative(CASE, [
        { source: 'c', type: 'compromises', target: 'a1', start_time: '2026-03-14' },
        { source: 'c', type: 'compromises', target: 'a2', start_time: '2026-03-20' },
      ])
      // one actor doing everything: the per-subject view is the same list again
      expect(timelines(oneSubject.chronology)).toEqual([])

      const two = buildNarrative(CASE, [
        { source: 'c', type: 'compromises', target: 'a1', start_time: '2026-03-14' },
        { source: 'm', type: 'communicates-with', target: 'a3', start_time: '2026-04-02' },
      ])
      expect(timelines(two.chronology).map((t) => t.subject)).toEqual([
        'The campaign Ferronnier',
        'The malware EggShell',
      ])
      expect(eventClause(two.chronology[0])).toBe('Compromises the account FR76...0143.')
    })

    it('a graph without a single date has no chronology and reads as before', () => {
      const before = buildNarrative(E, R)
      const after = buildNarrative(
        E,
        R.map((r) => ({ ...r, start_time: null })),
      )
      expect(after).toEqual(before)
      expect(before.chronology).toEqual([])
    })
  })

  it('signale un graphe vide', () => {
    expect(buildNarrative([], [])).toEqual({
      chronology: [],
      story: [],
      detection: [],
      isolated: [],
      empty: true,
    })
  })
})
