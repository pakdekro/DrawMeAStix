/**
 * Graph narrative (#116): turns entities + relations into short English
 * sentences, so the analyst can reread what was graphed in plain prose.
 *
 * 100% deterministic (no LLM, a project principle): every edge is a triple
 * (source, relation, target) rendered as prose, grouped by subject + verb +
 * target type.
 *
 * Observable / indicator split is deliberate: observables are described as
 * concrete artefacts ("the domain ..."), indicators go to a separate
 * "Detection" section with detection verbs.
 *
 * Switch to English (#172): the French contraction machinery ("a le" ->
 * "au") is gone, English has none. Neither does it have gender, hence
 * simpler tables than before.
 *
 * Chronology: a relation's start_time is the analyst saying when a thing
 * happened, which outranks any order we could guess from the types. To the
 * minute when they knew it, to the day when they did not.
 *
 * Dated statements are lifted OUT of their subject's block and into a
 * chronology of their own, each line naming who did what. Ordering them in
 * place, which is what this did first, put the timeline of one subject inside
 * one block: a case whose actor and whose malware are both dated then had two
 * timelines to interleave by eye. It also let the undated bulk that a scenario
 * generates - nine "the technique targets the victim" - open the story ahead
 * of what actually happened.
 *
 * So two named parts rather than one order: what happened, in order, and then
 * what carries no date. A graph with no date has no chronology, hence no
 * headings and nothing to explain: it reads exactly as it did before.
 */

export interface NarrEntity {
  id: string
  stix_type: string
  name: string
}
export interface NarrRelation {
  source: string
  type: string
  target: string
  /** the relation's "Active from" (#170), when the analyst filled it in */
  start_time?: string | null
}
/**
 * One subject and everything it does, so its name is written once.
 *
 * It used to be one sentence per verb, which on a hub meant ten paragraphs
 * opening with the same six words: "The campaign Operation Aviary targets…",
 * "The campaign Operation Aviary uses…". The reader spends the sentence
 * finding out it is still the same subject.
 *
 * A block with a single clause stays a sentence. A one-item bullet list is
 * worse prose than the sentence it replaces, and the repetition this fixes
 * only exists from two clauses up.
 */
export interface NarrBlock {
  /** "The campaign Operation Aviary", already capitalised */
  subject: string
  /** "targets the identity Aerodyne Defence and the location France" */
  clauses: string[]
}

/** One dated statement: a moment, a subject, and what it did then. */
export interface NarrEvent {
  /** `YYYY-MM-DD`, or `YYYY-MM-DD HH:mm` when the hour was known */
  when: string
  /** "The threat actor Guilde Vermeil", already capitalised */
  subject: string
  /** "uses the technique Spearphishing Link" */
  clause: string
}

export interface Narrative {
  /** the dated statements, earliest first: the case as a sequence */
  chronology: NarrEvent[]
  /** what each object does with no date on it, one block per object */
  story: NarrBlock[]
  /** sentences describing indicators (detection rules) */
  detection: string[]
  /** entities with no relation at all */
  isolated: string[]
  empty: boolean
}

// "the domain", "the IP"... : article + type, for a single object
const SINGULAR: Record<string, string> = {
  'intrusion-set': 'the intrusion set',
  'threat-actor': 'the threat actor',
  campaign: 'the campaign',
  malware: 'the malware',
  tool: 'the tool',
  'attack-pattern': 'the technique',
  vulnerability: 'the vulnerability',
  identity: 'the entity',
  location: 'the location',
  infrastructure: 'the infrastructure',
  indicator: 'the indicator',
  'ipv4-addr': 'the IP',
  'ipv6-addr': 'the IP',
  'domain-name': 'the domain',
  url: 'the URL',
  'email-addr': 'the email address',
  file: 'the file',
  'autonomous-system': 'the autonomous system',
  'mac-addr': 'the MAC address',
  mutex: 'the mutex',
  directory: 'the directory',
  software: 'the software',
  'user-account': 'the account',
  'x509-certificate': 'the certificate',
}

// "the domains", "the IPs"... : for a group sharing one type.
// malware and infrastructure stay singular: uncountable in English.
const PLURAL: Record<string, string> = {
  'intrusion-set': 'the intrusion sets',
  'threat-actor': 'the threat actors',
  campaign: 'the campaigns',
  malware: 'the malware',
  tool: 'the tools',
  'attack-pattern': 'the techniques',
  vulnerability: 'the vulnerabilities',
  identity: 'the entities',
  location: 'the locations',
  infrastructure: 'the infrastructure',
  indicator: 'the indicators',
  'ipv4-addr': 'the IPs',
  'ipv6-addr': 'the IPs',
  'domain-name': 'the domains',
  url: 'the URLs',
  'email-addr': 'the email addresses',
  file: 'the files',
  'autonomous-system': 'the autonomous systems',
  'mac-addr': 'the MAC addresses',
  mutex: 'the mutexes',
  directory: 'the directories',
  software: 'the software', // uncountable, like malware above
  'user-account': 'the accounts',
  'x509-certificate': 'the certificates',
}

const VERB: Record<string, string> = {
  uses: 'uses',
  targets: 'targets',
  'communicates-with': 'communicates with',
  'beacons-to': 'beacons to',
  'exfiltrates-to': 'exfiltrates to',
  'resolves-to': 'resolves to',
  'belongs-to': 'belongs to',
  drops: 'drops',
  downloads: 'downloads',
  delivers: 'delivers',
  exploits: 'exploits',
  'attributed-to': 'is attributed to',
  'originates-from': 'originates from',
  'located-at': 'is located at',
  'consists-of': 'consists of',
  controls: 'controls',
  hosts: 'hosts',
  owns: 'owns',
  compromises: 'compromises',
  impersonates: 'impersonates',
  has: 'has',
  'variant-of': 'is a variant of',
  'authored-by': 'is authored by',
  'related-to': 'is related to',
  indicates: 'detects',
  'based-on': 'is based on',
}

// reading order: follow the attack chain (actors -> tooling -> infra -> observables)
const TYPE_ORDER = [
  'campaign', 'intrusion-set', 'threat-actor',
  'malware', 'tool', 'attack-pattern',
  'infrastructure', 'vulnerability', 'identity', 'location',
  'domain-name', 'url', 'ipv4-addr', 'ipv6-addr', 'email-addr', 'mac-addr',
  'x509-certificate', 'file', 'directory', 'mutex', 'software', 'user-account',
  'autonomous-system',
]

const singular = (e: NarrEntity) => `${SINGULAR[e.stix_type] ?? ''} ${e.name}`.trim()
const verbOf = (t: string) => VERB[t] ?? t.replace(/-/g, ' ')
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** "A", "A and B", "A, B and C" */
function conj(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key)
  if (arr) arr.push(value)
  else map.set(key, [value])
}

/** targets grouped by type: "the malware X", "the tools Y and Z" */
function targetPhrases(targets: NarrEntity[]): string {
  const byType = new Map<string, NarrEntity[]>()
  for (const t of targets) push(byType, t.stix_type, t)
  const parts: string[] = []
  for (const [type, es] of byType) {
    const names = conj(es.map((e) => e.name))
    parts.push(
      es.length === 1
        ? `${SINGULAR[type] ?? ''} ${names}`.trim()
        : `${PLURAL[type] ?? ''} ${names}`.trim(),
    )
  }
  return conj(parts)
}

const orderIdx = (t: string) => {
  const i = TYPE_ORDER.indexOf(t)
  return i < 0 ? TYPE_ORDER.length : i
}

/**
 * When a relation happened, to the minute when the analyst knew it.
 *
 * A day alone stays a day: it is what somebody wrote down, and rendering it as
 * midnight would invent a precision they did not have. An hour, once there, is
 * kept and separates: two transfers on the same day are one line only if
 * nothing distinguishes them, and an hour distinguishes them.
 *
 * The trailing seconds and the `Z` of an imported timestamp are dropped for
 * READING, which is what this is for. The stored value keeps them, and so does
 * the bundle.
 */
const momentOf = (r: NarrRelation): string | undefined => {
  const raw = (r.start_time ?? '').trim()
  if (raw === '') return undefined
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2}))?)?/.exec(raw)
  if (m === null) return undefined
  // Midnight exactly is read as a day, and that is not a shortcut. STIX has no
  // day: everybody, this application included, writes T00:00:00Z for "that
  // day, hour unknown". Reading it back as an hour would turn every imported
  // day into a claim nobody made, and would make our own roundtrip change the
  // text of the narrative. The cost is that a genuine midnight reads as its
  // day, which is the same limit the format has.
  const midnight = m[2] === '00:00' && (m[3] ?? '00') === '00'
  return m[2] === undefined || midnight ? m[1] : `${m[1]} ${m[2]}`
}

export function buildNarrative(
  entities: NarrEntity[],
  relations: NarrRelation[],
): Narrative {
  const byId = new Map(entities.map((e) => [e.id, e]))
  const rels = relations.filter((r) => byId.has(r.source) && byId.has(r.target))

  const connected = new Set<string>()
  const outBySource = new Map<string, NarrRelation[]>()
  for (const r of rels) {
    connected.add(r.source)
    connected.add(r.target)
    push(outBySource, r.source, r)
  }

  const story: NarrBlock[] = []
  const detection: string[] = []

  // main story: each source (indicators excluded), one sentence per verb
  const sources = [...outBySource.keys()]
    .map((id) => byId.get(id)!)
    .filter((e) => e.stix_type !== 'indicator')
    .sort((a, b) => orderIdx(a.stix_type) - orderIdx(b.stix_type) || a.name.localeCompare(b.name))

  // one clause per verb AND per day: merging two days under one verb would
  // put a single date on statements that do not share it
  const chronology: NarrEvent[] = []
  for (const src of sources) {
    const groups = new Map<string, { type: string; when?: string; targets: NarrEntity[] }>()
    for (const r of outBySource.get(src.id)!) {
      const when = momentOf(r)
      const key = `${r.type}|${when ?? ''}`
      const group = groups.get(key)
      if (group) group.targets.push(byId.get(r.target)!)
      else groups.set(key, { type: r.type, when, targets: [byId.get(r.target)!] })
    }
    const subject = cap(singular(src))
    const clauses: string[] = []
    for (const g of groups.values()) {
      const clause = `${verbOf(g.type)} ${targetPhrases(g.targets)}`
      // A dated statement leaves its block for the chronology, where it can
      // stand beside the statements of every OTHER subject: that is the half
      // an in-place ordering could not do.
      if (g.when === undefined) clauses.push(clause)
      else chronology.push({ when: g.when, subject, clause })
    }
    // a subject whose every statement was dated has nothing left to say here
    if (clauses.length > 0) story.push({ subject, clauses })
  }
  // Lexicographic on the moment, which sorts correctly BECAUSE the shape is
  // fixed-width: a day alone comes before that day's hours, which is the right
  // place for "that day, hour unknown". Stable, so the same moment keeps the
  // reading order of the attack chain the subjects were sorted in above.
  chronology.sort((a, b) => a.when.localeCompare(b.when))

  // indicators: their own "Detection" section, worded as detection. No
  // chronology here on purpose: a detection is not an event of the story, it
  // is what the analyst leaves behind to catch the next one.
  const indicators = entities
    .filter((e) => e.stix_type === 'indicator')
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const ind of indicators) {
    const rs = outBySource.get(ind.id) ?? []
    const based = rs.filter((r) => r.type === 'based-on').map((r) => byId.get(r.target)!)
    const detects = rs.filter((r) => r.type === 'indicates').map((r) => byId.get(r.target)!)
    const other = rs.filter((r) => r.type !== 'based-on' && r.type !== 'indicates')
    const clauses: string[] = []
    if (based.length) clauses.push(`is based on ${targetPhrases(based)}`)
    if (detects.length) clauses.push(`detects ${targetPhrases(detects)}`)
    for (const r of other) clauses.push(`${verbOf(r.type)} ${singular(byId.get(r.target)!)}`)
    detection.push(
      clauses.length
        ? cap(`the indicator "${ind.name}" ${conj(clauses)}.`)
        : cap(`the indicator "${ind.name}" is not linked to anything.`),
    )
  }

  const isolated = entities.filter((e) => !connected.has(e.id)).map(singular)

  return {
    chronology,
    story,
    detection,
    isolated,
    empty: entities.length === 0,
  }
}

/** The sentence an event reads as, date excluded: each renderer places that. */
export function eventSentence(event: NarrEvent): string {
  return `${event.subject} ${event.clause}.`
}

/**
 * The same event under a subject that has already been named, so the sentence
 * starts at the verb. Capitalised here rather than by each renderer: prose is
 * this module's business, and four of them would have drifted.
 */
export function eventClause(event: NarrEvent): string {
  return `${cap(event.clause)}.`
}

/**
 * The chronology again, one timeline per subject, for a report read in one go.
 *
 * EVERY dated subject is here, including one with a single event. A subject
 * with one event has no sequence, which was reason enough to drop it for about
 * an hour, and dropping it made the section lie: a reader looking up what the
 * domain did and not finding it concludes it did nothing dated. A lone event
 * is printed as one line rather than as a heading over a list of one, which is
 * the rule the story blocks already follow.
 *
 * The section as a whole still needs TWO subjects: a case whose actor did all
 * the dated things would otherwise print the same list twice, in the same
 * order, under two headings.
 *
 * Kept out of the side panel on purpose: 300 pixels read while working want
 * the case, not the case and its index.
 */
export function timelines(chronology: NarrEvent[]): { subject: string; events: NarrEvent[] }[] {
  const bySubject = new Map<string, NarrEvent[]>()
  for (const event of chronology) push(bySubject, event.subject, event)
  if (bySubject.size < 2) return []
  return [...bySubject].map(([subject, events]) => ({ subject, events }))
}

/** What a drawn label may run to before it stops being a label. */
const DIAGRAM_LABEL = 72

/**
 * The chronology grouped by moment, which is the shape every drawing of it
 * needs: one row per moment, the events of that moment under it.
 */
export function timelineRows(chronology: NarrEvent[]): { when: string; events: NarrEvent[] }[] {
  const rows: { when: string; events: NarrEvent[] }[] = []
  for (const event of chronology) {
    const last = rows[rows.length - 1]
    if (last !== undefined && last.when === event.when) last.events.push(event)
    else rows.push({ when: event.when, events: [event] })
  }
  return rows
}

/**
 * The chronology as a mermaid `timeline`, for a report that wants it drawn.
 *
 * The global timeline only: a diagram per subject would be several diagrams
 * saying what the by-subject lists already say in less room.
 *
 * A drawing is a shortening, and this one shortens twice. Colons are the
 * syntax of the diagram, so they cannot survive in the text: a technique
 * called "Electronic Funds Transfer: Wire Transfer" would split into two
 * events, and `https://` into three. URLs lose their scheme, everything else
 * loses the colon, and a label past 72 characters is cut, because a box of
 * ninety characters is a paragraph in a frame. The list printed under the
 * diagram is the same chronology said in full: that is the one to read, this
 * is the one to look at.
 *
 * Empty when nothing is dated, since a timeline of nothing is a heading over
 * a blank.
 */
export function timelineDiagram(chronology: NarrEvent[]): string {
  if (chronology.length === 0) return ''
  const label = (text: string) => {
    const flat = text
      .replace(/\b[a-z][a-z0-9+.-]*:\/\//gi, '')
      .replace(/[:#<>]/g, ' -')
      .replace(/\s+/g, ' ')
      .trim()
    return flat.length > DIAGRAM_LABEL ? `${flat.slice(0, DIAGRAM_LABEL - 1).trimEnd()}…` : flat
  }
  const lines = ['timeline']
  for (const row of timelineRows(chronology)) {
    row.events.forEach((event, i) => {
      const text = label(eventSentence(event).replace(/\.$/, ''))
      // the continuation form of the diagram, indented under its moment the
      // way mermaid's own examples write it
      lines.push(i === 0 ? `    ${row.when} : ${text}` : `         : ${text}`)
    })
  }
  return lines.join('\n')
}
