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

export interface Narrative {
  /** what each object does, one block per object */
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

  for (const src of sources) {
    const byVerb = new Map<string, NarrEntity[]>()
    for (const r of outBySource.get(src.id)!) push(byVerb, r.type, byId.get(r.target)!)
    story.push({
      subject: cap(singular(src)),
      clauses: [...byVerb].map(([type, targets]) => `${verbOf(type)} ${targetPhrases(targets)}`),
    })
  }

  // indicators: their own "Detection" section, worded as detection
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
    story,
    detection,
    isolated,
    empty: entities.length === 0,
  }
}
