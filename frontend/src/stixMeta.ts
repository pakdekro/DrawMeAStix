/** Display metadata per STIX type (color, label, family). */

interface TypeMeta {
  label: string
  color: string
  kind: 'sdo' | 'sco'
}

// Kanagawa colors: SDO = saturated jewel tones (objects are spotted fast),
// SCO = desaturated tones (observables stand apart from objects at a glance).
const TYPE_META: Record<string, TypeMeta> = {
  'intrusion-set': { label: 'Intrusion Set', color: '#c34043', kind: 'sdo' }, // autumnRed
  'threat-actor': { label: 'Threat Actor', color: '#e46876', kind: 'sdo' }, // waveRed
  campaign: { label: 'Campaign', color: '#e6c384', kind: 'sdo' }, // carpYellow
  malware: { label: 'Malware', color: '#957fb8', kind: 'sdo' }, // oniViolet
  tool: { label: 'Tool', color: '#938aa9', kind: 'sdo' }, // springViolet1
  'attack-pattern': { label: 'Technique', color: '#dca561', kind: 'sdo' }, // autumnYellow
  indicator: { label: 'Indicator', color: '#7fb4ca', kind: 'sdo' }, // springBlue
  vulnerability: { label: 'Vulnerability', color: '#ffa066', kind: 'sdo' }, // surimiOrange
  identity: { label: 'Identity', color: '#98bb6c', kind: 'sdo' }, // springGreen
  location: { label: 'Location', color: '#7aa89f', kind: 'sdo' }, // waveAqua2
  infrastructure: { label: 'Infrastructure', color: '#d27e99', kind: 'sdo' }, // sakuraPink
  // SCO respread over distinct muted hues (blue/green/ochre/mauve/violet/cyan)
  // to tell them apart at a glance, while staying duller than the SDO.
  'ipv4-addr': { label: 'IPv4', color: '#6f9bb3', kind: 'sco' }, // blue
  'ipv6-addr': { label: 'IPv6', color: '#6f9bb3', kind: 'sco' }, // blue (IP family)
  'domain-name': { label: 'Domain', color: '#7fae86', kind: 'sco' }, // green
  url: { label: 'URL', color: '#c2a568', kind: 'sco' }, // ochre
  'email-addr': { label: 'Email', color: '#c08bb0', kind: 'sco' }, // mauve
  file: { label: 'File', color: '#9a8fb5', kind: 'sco' }, // violet
  'autonomous-system': { label: 'AS', color: '#5fb0b0', kind: 'sco' }, // cyan-teal
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
]

export function typeMeta(stixType: string): TypeMeta {
  return TYPE_META[stixType] ?? { label: stixType, color: '#8992a8', kind: 'sdo' }
}

/** TLP chips (#125) - colors of the FIRST convention, Kanagawa toning. */
export const TLP_META: Record<string, { label: string; color: string }> = {
  clear: { label: 'TLP:CLEAR', color: '#dcd7ba' },
  white: { label: 'TLP:CLEAR', color: '#dcd7ba' },
  green: { label: 'TLP:GREEN', color: '#98bb6c' },
  amber: { label: 'TLP:AMBER', color: '#dca561' },
  red: { label: 'TLP:RED', color: '#c34043' },
}
