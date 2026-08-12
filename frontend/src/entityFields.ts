/** Form fields per STIX type - the "guided" half of editing.
 *
 * The keys match the `properties` expected by the bundle builder on the
 * backend side (app/stix_core/bundle.py).
 */

import { typeMeta } from './stixMeta'

export interface FieldOption {
  value: string
  label: string
}

interface FieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date'
  options?: (string | FieldOption)[]
  required?: boolean
  placeholder?: string
  help?: string
}

/** Normalised select option (plain lists serve as both value and label). */
export function fieldOption(o: string | FieldOption): FieldOption {
  return typeof o === 'string' ? { value: o, label: o } : o
}

/**
 * STIX 2.1 `region-ov`: an open vocabulary, but a NORMALISED one. Dropping a
 * city name in there stays legal and means nothing - the consumer filters on
 * it. So we offer the list rather than a free text field.
 */
export const REGION_OV = [
  'africa', 'eastern-africa', 'middle-africa', 'northern-africa', 'southern-africa',
  'western-africa', 'americas', 'caribbean', 'central-america',
  'latin-america-caribbean', 'northern-america', 'south-america', 'asia',
  'central-asia', 'eastern-asia', 'southern-asia', 'south-eastern-asia',
  'western-asia', 'europe', 'eastern-europe', 'northern-europe',
  'southern-europe', 'western-europe', 'oceania', 'antarctica',
  'australia-new-zealand', 'melanesia', 'micronesia', 'polynesia',
] as const

const DESCRIPTION: FieldDef = {
  key: 'description',
  label: 'Description',
  type: 'textarea',
}

const ALIASES: FieldDef = {
  key: 'aliases',
  label: 'Aliases (comma separated)',
  type: 'text',
  placeholder: 'Fancy Bear, Sofacy…',
}

/**
 * Activity window (STIX 2.1 §first_seen/last_seen) - the time of the
 * EVENT, not that of the investigation. "When this campaign was
 * active", not "when I added it to the canvas": the second one already
 * lives in created_at and has no business in a report.
 */
const SEEN_WINDOW: FieldDef[] = [
  {
    key: 'first_seen',
    label: 'First seen',
    type: 'date',
    help: 'Start of the observed activity, not the date you typed it in',
  },
  { key: 'last_seen', label: 'Last seen', type: 'date' },
]

export const TYPE_FIELDS: Record<string, FieldDef[]> = {
  'intrusion-set': [DESCRIPTION, ALIASES, ...SEEN_WINDOW],
  'threat-actor': [
    {
      key: 'actor_kind',
      label: 'Kind',
      type: 'select',
      options: ['group', 'individual'],
      help: 'Changes the deterministic identifier generated (group / individual)',
    },
    DESCRIPTION,
    ALIASES,
    ...SEEN_WINDOW,
  ],
  campaign: [DESCRIPTION, ALIASES, ...SEEN_WINDOW],
  malware: [
    { key: 'is_family', label: 'Malware family', type: 'checkbox' },
    DESCRIPTION,
    ALIASES,
    ...SEEN_WINDOW,
  ],
  tool: [DESCRIPTION, ALIASES],
  'attack-pattern': [
    {
      key: 'x_mitre_id',
      label: 'ID MITRE ATT&CK',
      type: 'text',
      placeholder: 'T1566',
      help: 'Used as the deduplication key on import when filled in',
    },
    DESCRIPTION,
  ],
  indicator: [
    {
      key: 'pattern',
      label: 'Pattern STIX',
      type: 'textarea',
      required: true,
      placeholder: "[ipv4-addr:value = '198.51.100.7']",
      help: 'Required to export the bundle',
    },
    DESCRIPTION,
    {
      key: 'valid_from',
      label: 'Valid from',
      type: 'date',
      help: 'Empty = the entity creation date, as it works today',
    },
    { key: 'valid_until', label: 'Valid until', type: 'date' },
  ],
  vulnerability: [DESCRIPTION],
  identity: [
    {
      key: 'identity_class',
      label: 'Class',
      type: 'select',
      options: ['organization', 'individual', 'group', 'system', 'class'],
    },
    DESCRIPTION,
  ],
  location: [
    {
      key: 'location_type',
      label: 'Location type',
      type: 'select',
      options: ['Country', 'Region', 'City', 'Administrative-Area', 'Position'],
    },
    // The spec requires at least ONE of these three forms: `region`,
    // `country`, or the latitude/longitude pair. None was enterable except
    // the country, so the builder made up a region from the name - a city
    // came out as a world region. All three are now offered.
    {
      key: 'country',
      label: 'Country code (ISO 3166-1)',
      type: 'text',
      placeholder: 'FR',
      help: 'One of country, region, or coordinates is required by the spec',
    },
    {
      key: 'region',
      label: 'Region',
      type: 'select',
      options: ['', ...REGION_OV],
    },
    { key: 'latitude', label: 'Latitude', type: 'text', placeholder: '48.8566' },
    { key: 'longitude', label: 'Longitude', type: 'text', placeholder: '2.3522' },
    // These narrow the place down without satisfying the constraint above:
    // they travel in addition, never instead.
    { key: 'city', label: 'City', type: 'text', placeholder: 'Lyon' },
    { key: 'administrative_area', label: 'Administrative area', type: 'text' },
    DESCRIPTION,
  ],
  infrastructure: [DESCRIPTION, ALIASES, ...SEEN_WINDOW],
  file: [
    { key: 'file_name', label: 'File name', type: 'text', placeholder: 'payload.exe' },
    { key: 'hash_md5', label: 'MD5', type: 'text' },
    { key: 'hash_sha1', label: 'SHA-1', type: 'text' },
    { key: 'hash_sha256', label: 'SHA-256', type: 'text' },
  ],
  'autonomous-system': [
    { key: 'number', label: 'AS number', type: 'text', placeholder: '64500', required: true },
    { key: 'as_name', label: 'AS name', type: 'text' },
  ],
}

/** Fields common to every SDO (#125, #132): sharing and interoperability. */
const SDO_COMMON_FIELDS: FieldDef[] = [
  {
    key: 'labels',
    label: 'Labels (comma separated)',
    type: 'text',
    placeholder: 'ransomware, campaign-2026…',
    help: 'Multi-valued field: on import it adds to the existing ones instead of replacing them',
  },
  {
    key: 'confidence',
    label: 'Confidence (0-100)',
    type: 'text',
    placeholder: 'empty = the one chosen at export time',
    help: 'Arbitrates updates: a platform may refuse to overwrite more trusted data',
  },
  {
    key: 'tlp',
    label: 'TLP',
    type: 'select',
    options: [
      { value: '', label: 'the one from the export' },
      { value: 'clear', label: 'TLP:CLEAR' },
      { value: 'green', label: 'TLP:GREEN' },
      { value: 'amber', label: 'TLP:AMBER' },
      { value: 'red', label: 'TLP:RED' },
    ],
  },
]

/** Fields shown for a type: its own + the SDO common ones (not for SCOs,
 * their markings are carried by the bundle container). */
export function fieldsFor(stixType: string): FieldDef[] {
  const own = TYPE_FIELDS[stixType] ?? []
  if (typeMeta(stixType).kind === 'sco') return own
  return [...own, ...SDO_COMMON_FIELDS]
}

/**
 * Enterable STIX temporal properties (#170). Stored exactly as the analyst
 * types them (YYYY-MM-DD); the bundle builder is what normalises them into a
 * STIX timestamp at export, the only place where the shape matters.
 */
export const TEMPORAL_KEYS = ['first_seen', 'last_seen', 'valid_from', 'valid_until'] as const

/** properties (API) → flat form values. */
export function toFormValues(props: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = { ...props }
  // an imported bundle carries a full timestamp; <input type="date"> can
  // only read the day part, otherwise the field shows up empty
  for (const key of TEMPORAL_KEYS) {
    if (typeof props[key] === 'string') values[key] = (props[key] as string).slice(0, 10)
  }
  if (Array.isArray(props.aliases)) values.aliases = (props.aliases as string[]).join(', ')
  if (Array.isArray(props.labels)) values.labels = (props.labels as string[]).join(', ')
  const hashes = (props.hashes ?? {}) as Record<string, string>
  if (hashes['MD5']) values.hash_md5 = hashes['MD5']
  if (hashes['SHA-1']) values.hash_sha1 = hashes['SHA-1']
  if (hashes['SHA-256']) values.hash_sha256 = hashes['SHA-256']
  delete values.hashes
  return values
}

/** flat form values → properties (API). */
export function toProperties(
  stixType: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(values)) {
    if (raw === '' || raw === undefined || raw === null || raw === false) continue
    props[key] = raw
  }
  for (const key of ['aliases', 'labels'] as const) {
    if (typeof props[key] !== 'string') continue
    const list = (props[key] as string)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (list.length) props[key] = list
    else delete props[key]
  }
  // The spec wants NUMBERS for the coordinates, the form yields strings: a
  // latitude left as text would fail OASIS validation with a message that
  // does not point at the field.
  if (stixType === 'location') {
    for (const key of ['latitude', 'longitude'] as const) {
      if (props[key] === undefined) continue
      const n = Number(props[key])
      if (Number.isFinite(n)) props[key] = n
      else delete props[key]
    }
  }
  if (stixType === 'file') {
    const hashes: Record<string, string> = {}
    if (props.hash_md5) hashes['MD5'] = String(props.hash_md5)
    if (props.hash_sha1) hashes['SHA-1'] = String(props.hash_sha1)
    if (props.hash_sha256) hashes['SHA-256'] = String(props.hash_sha256)
    delete props.hash_md5
    delete props.hash_sha1
    delete props.hash_sha256
    if (Object.keys(hashes).length) props.hashes = hashes
  }
  if (stixType === 'autonomous-system' && props.number !== undefined) {
    const n = parseInt(String(props.number), 10)
    if (!Number.isNaN(n)) props.number = n
    else delete props.number
  }
  if (props.confidence !== undefined) {
    const conf = parseInt(String(props.confidence), 10)
    if (Number.isInteger(conf) && conf >= 0 && conf <= 100) props.confidence = conf
    else delete props.confidence
  }
  return props
}

/** true if the type's required fields are filled in. */
export function requiredFilled(stixType: string, values: Record<string, unknown>): boolean {
  return (TYPE_FIELDS[stixType] ?? [])
    .filter((f) => f.required)
    .every((f) => String(values[f.key] ?? '').trim() !== '')
}
