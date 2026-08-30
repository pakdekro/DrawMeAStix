/** Form fields per STIX type - the "guided" half of editing.
 *
 * The keys match the `properties` expected by the bundle builder on the
 * backend side (app/stix_core/bundle.py).
 */

import { DEFAULT_FRAMEWORK, FRAMEWORKS } from './frameworks'
import { typeMeta } from './stixMeta'

export interface FieldOption {
  value: string
  label: string
}

interface FieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date' | 'multiselect'
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

/**
 * STIX 2.1 `infrastructure-type-ov`, copied from the vendored OASIS schema
 * (`stix/schemas/sdos/infrastructure.json`), where a test holds the two in
 * step.
 *
 * The vocabulary is open, and the schema does not police it: the property is
 * declared as an array of plain strings, so an invented value passes export
 * validation without a word. That makes this list the only place the line
 * holds, which is a reason to offer it rather than a text field, not a reason
 * to add to it. Nothing here describes a set of bank accounts, and coining
 * something that does would put a word in the bundle that no consumer knows.
 */
export const INFRASTRUCTURE_TYPE_OV = [
  'amplification',
  'anonymization',
  'botnet',
  'command-and-control',
  'exfiltration',
  'hosting-malware',
  'hosting-target-lists',
  'phishing',
  'reconnaissance',
  'staging',
  'unknown',
] as const

/**
 * What the name of a `user-account` node actually is.
 *
 * STIX gives an account three names and they are not interchangeable:
 * `account_login` is what you type to sign in, `user_id` is what the system
 * calls the account (a SID, a UUID, an IBAN), and `display_name` is what a
 * human reads. Only the first two identify it, and writing an IBAN into
 * `account_login` is a fabricated claim of the same family as stamping
 * `mitre-attack` on an F1001.
 *
 * `account_login` stays the default, and not only because it is the common
 * case: it is what every account drawn before this choice existed was written
 * as, so any other default would silently move identifiers already exported.
 */
export const ACCOUNT_NAME_PROPERTIES: FieldOption[] = [
  { value: 'account_login', label: 'A login (account_login)' },
  { value: 'user_id', label: 'An account identifier: IBAN, SID… (user_id)' },
  { value: 'display_name', label: 'A display name (display_name)' },
]

export const DEFAULT_ACCOUNT_NAME_PROPERTY = 'account_login'

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
      label: 'MITRE ID',
      type: 'text',
      placeholder: 'T1566',
      help: 'Used as the deduplication key on import when filled in',
    },
    /* Which framework the number above belongs to, because the number cannot
       say on its own: F3 reuses 43 ATT&CK identifiers verbatim. Left alone it
       stays absent from the properties, and absent means ATT&CK. */
    {
      key: 'mitre_framework',
      label: 'Framework',
      type: 'select',
      options: FRAMEWORKS.map((f) => ({ value: f.id, label: f.label })),
      help: 'What the exported reference claims about the ID',
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
  infrastructure: [
    {
      key: 'infrastructure_types',
      label: 'Infrastructure types',
      type: 'multiselect',
      options: [...INFRASTRUCTURE_TYPE_OV],
      help: 'STIX open vocabulary: several may apply, and none is also an answer',
    },
    DESCRIPTION,
    ALIASES,
    ...SEEN_WINDOW,
  ],
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
  // `mac-addr`, `mutex` and `directory` are entirely carried by the node name
  // (the address, the mutex name, the path): the spec gives them one
  // identifying property and it is that one.
  software: [
    { key: 'vendor', label: 'Vendor', type: 'text', placeholder: 'Apache' },
    { key: 'version', label: 'Version', type: 'text', placeholder: '2.4.49' },
    {
      key: 'cpe',
      label: 'CPE',
      type: 'text',
      placeholder: 'cpe:2.3:a:apache:http_server:2.4.49:*:*:*:*:*:*:*',
      help: 'Part of the deterministic identifier: filling it in later changes it',
    },
    { key: 'swid', label: 'SWID tag', type: 'text' },
  ],
  'user-account': [
    {
      key: 'account_name_is',
      label: 'The value above is',
      type: 'select',
      options: ACCOUNT_NAME_PROPERTIES,
      help: 'Part of the deterministic identifier: changing it changes it',
    },
    // The property the name occupies is hidden by the form, so these three
    // are never two ways of saying the same thing.
    {
      key: 'account_login',
      label: 'Login',
      type: 'text',
      placeholder: 'j.smith',
      help: 'Part of the deterministic identifier: filling it in later changes it',
    },
    {
      key: 'user_id',
      label: 'User ID',
      type: 'text',
      placeholder: 'S-1-5-21-…, 1001…',
      help: 'Part of the deterministic identifier: filling it in later changes it',
    },
    {
      key: 'account_type',
      label: 'Account type',
      type: 'select',
      // STIX 2.1 `account-type-ov`. Open vocabulary, but a normalised one, and
      // it contributes to the identifier, so it is offered rather than typed.
      options: [
        '', 'facebook', 'ldap', 'nis', 'openid', 'radius', 'skype', 'tacacs',
        'twitter', 'unix', 'windows-local', 'windows-domain',
      ],
      help: 'Part of the deterministic identifier: filling it in later changes it',
    },
    { key: 'display_name', label: 'Display name', type: 'text', placeholder: 'Jane Doe' },
  ],
  'x509-certificate': [
    {
      key: 'serial_number',
      label: 'Serial number',
      type: 'text',
      placeholder: '36:f7:d4:…',
      help: 'Left empty, the node name is read as the serial number - or as a fingerprint when it is one',
    },
    { key: 'hash_sha256', label: 'SHA-256 fingerprint', type: 'text' },
    { key: 'hash_sha1', label: 'SHA-1 fingerprint', type: 'text' },
    { key: 'subject', label: 'Subject', type: 'text', placeholder: 'CN=example.com' },
    { key: 'issuer', label: 'Issuer', type: 'text', placeholder: "CN=R3, O=Let's Encrypt" },
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

/**
 * What the single mandatory field of an observable is asking for.
 *
 * The generic hint ("198.51.100.7, evil.example…") is right for the network
 * observables and misleading for every other one: a software node is not asked
 * for an IP address, and a certificate has no obvious "value" at all.
 */
const VALUE_PLACEHOLDER: Record<string, string> = {
  'autonomous-system': 'AS64496',
  'mac-addr': '00:1a:2b:3c:4d:5e',
  mutex: 'Global\\MsWinZonesCacheCounterMutexA',
  directory: 'C:\\Users\\Public\\Libraries',
  software: 'Apache HTTP Server',
  'user-account': 'j.smith',
  'x509-certificate': 'fingerprint, or serial number',
}

export function valuePlaceholder(stixType: string): string {
  return VALUE_PLACEHOLDER[stixType] ?? 'e.g. 198.51.100.7, evil.example…'
}

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
  // ATT&CK is the default, and a default has ONE representation. Storing it
  // explicitly would leave two ways of saying the same thing, and the second
  // one only appears if the analyst opens the select and comes back.
  if (props.mitre_framework === DEFAULT_FRAMEWORK.id) delete props.mitre_framework
  // Same rule for the account name: the default has ONE representation, so an
  // account drawn before the choice existed and one drawn after it are the
  // same object with the same identifier.
  if (props.account_name_is === DEFAULT_ACCOUNT_NAME_PROPERTY) delete props.account_name_is
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
  if (stixType === 'file' || stixType === 'x509-certificate') {
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
  // An empty list is not a value: the spec asks for at least one item, and a
  // property that says nothing would still travel and still be read.
  for (const [key, value] of Object.entries(props)) {
    if (Array.isArray(value) && value.length === 0) delete props[key]
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
