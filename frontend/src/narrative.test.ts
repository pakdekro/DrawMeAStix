import { describe, expect, it } from 'vitest'
import {
  buildNarrative,
  eventClause,
  eventSentence,
  timelineDiagram,
  timelineRows,
  timelines,
} from './narrative'
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
      expect(chronology.map((e) => `${e.when} ${eventSentence(e)}`)).toEqual([
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

    it('an hour, once known, separates and orders what a day would merge', () => {
      // two transfers on one day are one line only if nothing distinguishes
      // them, and an hour distinguishes them
      const { chronology } = buildNarrative(CASE, [
        { source: 'c', type: 'compromises', target: 'a1', start_time: '2026-03-14T23:50:00Z' },
        { source: 'c', type: 'compromises', target: 'a2', start_time: '2026-03-14T09:12:00Z' },
        { source: 'c', type: 'compromises', target: 'a3', start_time: '2026-03-14' },
      ])
      expect(chronology.map((e) => `${e.when} ${e.clause}`)).toEqual([
        // the day alone comes first: "that day, hour unknown" sits before the
        // hours of that day rather than in the middle of them
        '2026-03-14 compromises the account FR76...0555',
        '2026-03-14 09:12 compromises the account FR76...0987',
        '2026-03-14 23:50 compromises the account FR76...0143',
      ])
    })

    it('an imported timestamp keeps its hour and drops what nobody reads', () => {
      const { chronology } = buildNarrative(CASE, [
        { source: 'c', type: 'compromises', target: 'a1', start_time: '2026-03-14T09:12:34.500Z' },
        { source: 'c', type: 'compromises', target: 'a2', start_time: '2026-03-14T09:12:00Z' },
      ])
      // same minute, one line: the seconds are not read, and the store keeps
      // them for the bundle
      expect(chronology).toHaveLength(1)
      expect(chronology[0].when).toBe('2026-03-14 09:12')
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

      // Every dated subject is listed, including one with a single event: a
      // reader looking up what the malware did and not finding it would
      // conclude it did nothing dated. The renderers print that one as a line
      // rather than as a heading over a list of one.
      const mixed = buildNarrative(CASE, [
        { source: 'c', type: 'compromises', target: 'a1', start_time: '2026-03-14' },
        { source: 'c', type: 'compromises', target: 'a2', start_time: '2026-03-16' },
        { source: 'm', type: 'communicates-with', target: 'a3', start_time: '2026-04-02' },
      ])
      // and it is listed before the blocks: a line printed under a subject
      // that has a sequence reads as the end of that sequence
      expect(timelines(mixed.chronology).map((t) => `${t.subject} (${t.events.length})`)).toEqual([
        'The malware EggShell (1)',
        'The campaign Ferronnier (2)',
      ])
      expect(eventClause(mixed.chronology[0])).toBe('Compromises the account FR76...0143.')
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

/**
 * The grouping the three drawn timelines share. The markdown draws it as a
 * mermaid diagram, the image and the PDF paint it on a rail, and all three
 * ask this for the same thing: what happened at each moment, once.
 */
describe('the chronology drawn', () => {
  const E: NarrEntity[] = [
    { id: 'a', stix_type: 'threat-actor', name: 'Guilde Vermeil' },
    { id: 't', stix_type: 'attack-pattern', name: 'Electronic Funds Transfer: Wire Transfer' },
    { id: 'u', stix_type: 'url', name: 'https://portail.example/sso/login' },
    { id: 'i', stix_type: 'infrastructure', name: 'Kit AiTM' },
  ]
  const R: NarrRelation[] = [
    { source: 'i', type: 'consists-of', target: 'u', start_time: '2026-08-10T00:00:00Z' },
    { source: 'a', type: 'uses', target: 't', start_time: '2026-08-21T09:12:00Z' },
    { source: 'a', type: 'targets', target: 'i', start_time: '2026-08-21T09:12:00Z' },
  ]

  it('gives one row per moment, in order, with the events of that moment', () => {
    const { chronology } = buildNarrative(E, R)
    const rows = timelineRows(chronology)
    expect(rows.map((r) => `${r.when} (${r.events.length})`)).toEqual([
      '2026-08-10 (1)',
      '2026-08-21 09:12 (2)',
    ])
    expect(rows[1].events.map(eventSentence)).toEqual([
      'The threat actor Guilde Vermeil uses the technique Electronic Funds Transfer: Wire Transfer.',
      'The threat actor Guilde Vermeil targets the infrastructure Kit AiTM.',
    ])
  })

  it('writes the moment once, and keeps colons out of the diagram', () => {
    const diagram = timelineDiagram(buildNarrative(E, R).chronology)
    const lines = diagram.split('\n')
    expect(lines[0]).toBe('timeline')
    // the moment names its first event, the next ones continue under it
    expect(lines[2]).toBe(
      '    2026-08-21 09:12 : The threat actor Guilde Vermeil uses the technique Electronic Funds Tra…',
    )
    expect(lines[3]).toMatch(/^ {9}: The threat actor Guilde Vermeil targets/)
    // one colon per event as the separator, plus the one in the hour: the
    // technique name and the URL scheme each lost theirs, and a colon left in
    // a label would have split that event into two boxes
    expect(diagram.split(':').length - 1).toBe(3 + 1)
  })

  it('draws nothing when nothing is dated', () => {
    expect(timelineRows([])).toEqual([])
    expect(timelineDiagram([])).toBe('')
  })
})
