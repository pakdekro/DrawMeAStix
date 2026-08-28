/** Display metadata per STIX type (color, label, family). */

interface TypeMeta {
  label: string
  /** three letters for the disc shape, where there is no room for the label */
  abbr: string
  color: string
  kind: 'sdo' | 'sco'
}

// Kanagawa colors: SDO = saturated jewel tones (objects are spotted fast),
// SCO = desaturated tones (observables stand apart from objects at a glance).
const TYPE_META: Record<string, TypeMeta> = {
  'intrusion-set': { label: 'Intrusion Set', abbr: 'INT', color: '#c34043', kind: 'sdo' }, // autumnRed
  'threat-actor': { label: 'Threat Actor', abbr: 'ACT', color: '#e46876', kind: 'sdo' }, // waveRed
  campaign: { label: 'Campaign', abbr: 'CMP', color: '#e6c384', kind: 'sdo' }, // carpYellow
  malware: { label: 'Malware', abbr: 'MAL', color: '#957fb8', kind: 'sdo' }, // oniViolet
  tool: { label: 'Tool', abbr: 'TOL', color: '#938aa9', kind: 'sdo' }, // springViolet1
  'attack-pattern': { label: 'Technique', abbr: 'TEC', color: '#dca561', kind: 'sdo' }, // autumnYellow
  indicator: { label: 'Indicator', abbr: 'IND', color: '#7fb4ca', kind: 'sdo' }, // springBlue
  vulnerability: { label: 'Vulnerability', abbr: 'VUL', color: '#ffa066', kind: 'sdo' }, // surimiOrange
  identity: { label: 'Identity', abbr: 'IDT', color: '#98bb6c', kind: 'sdo' }, // springGreen
  location: { label: 'Location', abbr: 'LOC', color: '#7aa89f', kind: 'sdo' }, // waveAqua2
  infrastructure: { label: 'Infrastructure', abbr: 'INF', color: '#d27e99', kind: 'sdo' }, // sakuraPink
  // SCO respread over distinct muted hues (blue/green/ochre/mauve/violet/cyan)
  // to tell them apart at a glance, while staying duller than the SDO.
  'ipv4-addr': { label: 'IPv4', abbr: 'IP4', color: '#6f9bb3', kind: 'sco' }, // blue
  'ipv6-addr': { label: 'IPv6', abbr: 'IP6', color: '#6f9bb3', kind: 'sco' }, // blue (IP family)
  'domain-name': { label: 'Domain', abbr: 'DOM', color: '#7fae86', kind: 'sco' }, // green
  url: { label: 'URL', abbr: 'URL', color: '#c2a568', kind: 'sco' }, // ochre
  'email-addr': { label: 'Email', abbr: 'EML', color: '#c08bb0', kind: 'sco' }, // mauve
  file: { label: 'File', abbr: 'FIL', color: '#9a8fb5', kind: 'sco' }, // violet
  'autonomous-system': { label: 'AS', abbr: 'ASN', color: '#5fb0b0', kind: 'sco' }, // cyan-teal
  // The second batch shares one muted taupe. Six more hues in a palette that
  // already holds eighteen would say "these differ" louder than they differ:
  // they are host-side observables, read by their label, and none of them is
  // the thing the eye hunts for on a graph.
  'mac-addr': { label: 'MAC', abbr: 'MAC', color: '#9a9086', kind: 'sco' },
  mutex: { label: 'Mutex', abbr: 'MTX', color: '#9a9086', kind: 'sco' },
  directory: { label: 'Directory', abbr: 'DIR', color: '#9a9086', kind: 'sco' },
  software: { label: 'Software', abbr: 'SFW', color: '#9a9086', kind: 'sco' },
  'user-account': { label: 'Account', abbr: 'ACC', color: '#9a9086', kind: 'sco' },
  'x509-certificate': { label: 'Certificate', abbr: 'CRT', color: '#9a9086', kind: 'sco' },
}

export const SDO_ORDER = [
  'intrusion-set',
  'threat-actor',
  'campaign',
  'malware',
  'tool',
  'attack-pattern',
  'indicator',
  'vulnerability',
  'identity',
  'location',
  'infrastructure',
]

export const SCO_ORDER = [
  'ipv4-addr',
  'ipv6-addr',
  'domain-name',
  'url',
  'email-addr',
  'file',
  'autonomous-system',
  'mac-addr',
  'directory',
  'mutex',
  'software',
  'user-account',
  'x509-certificate',
]

export function typeMeta(stixType: string): TypeMeta {
  return (
    TYPE_META[stixType] ?? {
      label: stixType,
      abbr: stixType.slice(0, 3).toUpperCase(),
      color: '#8992a8',
      kind: 'sdo',
    }
  )
}

/** TLP chips (#125) - colors of the FIRST convention, Kanagawa toning. */
export const TLP_META: Record<string, { label: string; color: string }> = {
  clear: { label: 'TLP:CLEAR', color: '#dcd7ba' },
  white: { label: 'TLP:CLEAR', color: '#dcd7ba' },
  green: { label: 'TLP:GREEN', color: '#98bb6c' },
  amber: { label: 'TLP:AMBER', color: '#dca561' },
  red: { label: 'TLP:RED', color: '#c34043' },
}

/* -- per-type tally (status bar breakdown) --------------------------------- */

export interface TypeCount {
  stix_type: string
  label: string
  color: string
  kind: 'sdo' | 'sco'
  count: number
}

/**
 * Objects per type, non-empty types only, in the order the palette lists
 * them.
 *
 * That order is the point. Sorting by count would be the obvious choice and
 * the wrong one: the reader has the palette on the left in this exact
 * sequence, and a breakdown that reshuffles itself every time an object is
 * added has to be re-read from the top each time. Here the eye lands where it
 * already knows to look.
 *
 * A type absent from both orders (an imported bundle carrying something the
 * palette does not offer) is not dropped, it lands at the end in alphabetical
 * order. It would otherwise be counted in the total and in nothing else.
 */
export function countByType(entities: { stix_type: string }[]): TypeCount[] {
  const counts = new Map<string, number>()
  for (const entity of entities) {
    counts.set(entity.stix_type, (counts.get(entity.stix_type) ?? 0) + 1)
  }
  const known = [...SDO_ORDER, ...SCO_ORDER]
  const unknown = [...counts.keys()].filter((t) => !known.includes(t)).sort()
  return [...known, ...unknown]
    .filter((t) => counts.has(t))
    .map((t) => ({ stix_type: t, ...typeMeta(t), count: counts.get(t)! }))
}
