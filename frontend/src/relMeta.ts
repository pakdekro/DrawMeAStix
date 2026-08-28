/**
 * A reading colour for relationships.
 *
 * Not one colour per relationship type. STIX has twenty-six of them here and
 * six more hues in a palette that already carries eighteen for the objects
 * would say "these differ" far louder than they differ - the same argument
 * `stixMeta.ts` makes about the observables, and the same conclusion.
 *
 * What an analyst actually reads off a graph is coarser than the verb: who is
 * behind this, what does it wield, who does it hit, how would we see it, where
 * does it live. Five questions, five colours, and the verb is still written on
 * the line for the detail. So the colour groups rather than labels, which is
 * what a colour is good at.
 *
 * Deliberately duller than the object palette. An edge is thin and there are
 * more of them than there are objects; a saturated line reads as an alarm.
 */

export type RelFamily =
  | 'attribution'
  | 'capability'
  | 'victimology'
  | 'detection'
  | 'infrastructure'
  | 'generic'

export const REL_FAMILIES: { id: RelFamily; label: string; hint: string; color: string }[] = [
  {
    id: 'attribution',
    label: 'Attribution',
    hint: 'Who is behind it',
    color: '#c4746e',
  },
  {
    id: 'capability',
    label: 'Capability',
    hint: 'What it wields, and is made of',
    color: '#8ba4b0',
  },
  {
    id: 'victimology',
    label: 'Victimology',
    hint: 'Who and what it hits',
    color: '#c4b28a',
  },
  {
    id: 'detection',
    label: 'Detection',
    hint: 'How it would be seen',
    color: '#8a9a7b',
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    hint: 'Where it sits, what it talks to',
    color: '#a292a3',
  },
  { id: 'generic', label: 'Unspecified', hint: 'Only that they are related', color: '#6b6b82' },
]

const FAMILY_OF: Record<string, RelFamily> = {
  'attributed-to': 'attribution',
  impersonates: 'attribution',
  owns: 'attribution',
  'authored-by': 'attribution',

  uses: 'capability',
  drops: 'capability',
  delivers: 'capability',
  downloads: 'capability',
  exploits: 'capability',
  'variant-of': 'capability',
  'consists-of': 'capability',
  has: 'capability',

  targets: 'victimology',
  compromises: 'victimology',
  'exfiltrates-to': 'victimology',

  indicates: 'detection',
  'based-on': 'detection',

  'communicates-with': 'infrastructure',
  'beacons-to': 'infrastructure',
  'resolves-to': 'infrastructure',
  'belongs-to': 'infrastructure',
  'located-at': 'infrastructure',
  'originates-from': 'infrastructure',
  hosts: 'infrastructure',
  controls: 'infrastructure',
}

const BY_ID = new Map(REL_FAMILIES.map((f) => [f.id, f]))

/**
 * The family a verb belongs to. `related-to` is the STIX catch-all and lands
 * on `generic` on purpose, alongside anything a future version of the spec
 * adds: an unknown verb must read as unclassified, never as one of the five.
 */
export function relFamily(relType: string): RelFamily {
  return FAMILY_OF[relType] ?? 'generic'
}

export function relColor(relType: string): string {
  return BY_ID.get(relFamily(relType))!.color
}
