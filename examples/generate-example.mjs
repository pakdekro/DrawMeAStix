/**
 * Generates a sample STIX 2.1 bundle, rich in types and relations, for the
 * tests and the demos ("Import a STIX 2.1 bundle" in DMAS).
 *
 *   node examples/generate-example.mjs
 *
 * Fictional scenario "Operation Aviary": the Corax group (imaginary APT)
 * targets Aerodyne Defence. Every entity carries the DMAS layout extension
 * with a DELIBERATELY scattered position, so the bundle imports straight onto
 * the canvas as a plate of spaghetti, ideal for testing the Re-layout button.
 *
 * Deterministic: fixed ids and timestamps, regenerates identically.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXT = 'extension-definition--4a3b8e1c-6f2d-4b9a-8c5e-1d2f3a4b5c6d'
// identity of the tool signing the definition (created_by_ref required there)
const TOOL_IDENTITY = 'identity--856129ab-fbe0-513c-822b-2266fcf038fc'
const T = '2024-11-15T09:00:00.000Z'

// Deterministic yet well-formed UUID (v4 / variant 8) built from an index.
const uuid = (i) => `c0ra0000-0000-4000-8000-${String(i).padStart(12, '0')}`

// deterministic scatter (positions that gladly cross one another)
const scatterX = (i) => 60 + ((i * 213) % 1500)
const scatterY = (i) => 60 + ((i * 129) % 820)

let n = 0
const ids = {}
const objects = []

/** entity (SDO or SCO) carrying the layout extension */
function entity(slug, type, main, props = {}) {
  const i = ++n
  const id = `${type}--${uuid(i)}`
  ids[slug] = id
  objects.push({
    type,
    spec_version: '2.1',
    id,
    ...main, // { name } or { value } or { number, name } / { hashes }
    ...props,
    created: T,
    modified: T,
    extensions: {
      [EXT]: {
        extension_type: 'property-extension',
        local_id: slug,
        position_x: scatterX(i),
        position_y: scatterY(i),
        source: 'manual',
      },
    },
  })
}

/** analyst note attached to an entity (STIX `note` object) */
function note(slug, content) {
  const i = ++n
  objects.push({
    type: 'note',
    spec_version: '2.1',
    id: `note--${uuid(i)}`,
    content,
    object_refs: [ids[slug]],
    created: T,
    modified: T,
  })
}

/** opinion: the same channel, with an explicit level of agreement */
function opinion(slug, value, explanation) {
  const i = ++n
  objects.push({
    type: 'opinion',
    spec_version: '2.1',
    id: `opinion--${uuid(i)}`,
    opinion: value,
    explanation,
    object_refs: [ids[slug]],
    created: T,
    modified: T,
  })
}

function rel(src, type, tgt) {
  const i = ++n
  objects.push({
    type: 'relationship',
    spec_version: '2.1',
    id: `relationship--${uuid(i)}`,
    relationship_type: type,
    source_ref: ids[src],
    target_ref: ids[tgt],
    created: T,
    modified: T,
  })
}

/* -- entities --------------------------------------------------------------- */

// SDO
entity('corax', 'intrusion-set', { name: 'Corax' }, {
  aliases: ['Raven Team', 'APT-Corax'],
  description: 'Fictional espionage group targeting the defence sector.',
})
entity('coraxops', 'threat-actor', { name: 'Corax Operators' }, {
  threat_actor_types: ['nation-state'],
  roles: ['agent'],
})
entity('voliere', 'campaign', { name: 'Operation Aviary' }, {
  description: 'Fictional intellectual property theft campaign (2024).',
})
entity('nestdrop', 'malware', { name: 'NestDrop' }, {
  malware_types: ['dropper'],
  is_family: true,
})
entity('eggshell', 'malware', { name: 'EggShell' }, {
  malware_types: ['remote-access-trojan'],
  is_family: true,
})
entity('cobalt', 'tool', { name: 'Cobalt Strike' }, { tool_types: ['remote-access'] })
entity('rclone', 'tool', { name: 'Rclone' }, { tool_types: ['exfiltration'] })
entity('spearphish', 'attack-pattern', { name: 'Spearphishing Attachment' }, {
  external_references: [
    { source_name: 'mitre-attack', external_id: 'T1566.001' },
  ],
})
entity('exfilc2', 'attack-pattern', { name: 'Exfiltration Over C2 Channel' }, {
  external_references: [{ source_name: 'mitre-attack', external_id: 'T1041' }],
})
entity('ind_domain', 'indicator', {
  name: 'EggShell C2 domain',
}, {
  pattern: "[domain-name:value = 'nest.corax.example']",
  pattern_type: 'stix',
  valid_from: T,
  indicator_types: ['malicious-activity'],
})
entity('ind_mail', 'indicator', { name: 'Phishing sender' }, {
  pattern: "[email-addr:value = 'rh@aerodyne-defence.example']",
  pattern_type: 'stix',
  valid_from: T,
  indicator_types: ['malicious-activity'],
})
entity('cve', 'vulnerability', { name: 'CVE-2024-3400' }, {
  description: 'Fictional vulnerability exploited for initial access.',
})
entity('aerodyne', 'identity', { name: 'Aerodyne Defence' }, {
  identity_class: 'organization',
  sectors: ['defense'],
})
entity('france', 'location', { name: 'France' }, { country: 'FR', region: 'western-europe' })
entity('russia', 'location', { name: 'Russia' }, { country: 'RU', region: 'eastern-europe' })
entity('c2infra', 'infrastructure', { name: 'Corax C2 Cluster' }, {
  infrastructure_types: ['command-and-control'],
})

// SCO
entity('d_nest', 'domain-name', { value: 'nest.corax.example' })
entity('d_spoof', 'domain-name', { value: 'update.aerodyne-defence.example' })
entity('ip4', 'ipv4-addr', { value: '185.220.101.7' })
entity('ip6', 'ipv6-addr', { value: '2001:db8::feed:7' })
entity('url_beacon', 'url', { value: 'http://nest.corax.example/beacon' })
entity('mail', 'email-addr', { value: 'rh@aerodyne-defence.example' })
entity('sample', 'file', {
  name: 'invoice_2024.pdf.exe',
  hashes: { 'SHA-256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
})
entity('asn', 'autonomous-system', { number: 209476, name: 'AS209476 CORAX-NET' })

/* -- relations (assorted types) -------------------------------------------- */

rel('voliere', 'attributed-to', 'corax')
rel('corax', 'attributed-to', 'coraxops')
rel('corax', 'originates-from', 'russia')
rel('voliere', 'targets', 'aerodyne')
rel('voliere', 'targets', 'france')
rel('corax', 'uses', 'nestdrop')
rel('corax', 'uses', 'eggshell')
rel('corax', 'uses', 'cobalt')
rel('corax', 'uses', 'rclone')
rel('corax', 'uses', 'spearphish')
rel('corax', 'uses', 'exfilc2')
rel('spearphish', 'delivers', 'nestdrop')
rel('nestdrop', 'drops', 'eggshell')
rel('nestdrop', 'drops', 'sample')
rel('eggshell', 'exploits', 'cve')
rel('eggshell', 'communicates-with', 'd_nest')
rel('eggshell', 'communicates-with', 'url_beacon')
rel('eggshell', 'beacons-to', 'c2infra')
rel('c2infra', 'consists-of', 'ip4')
rel('c2infra', 'consists-of', 'd_nest')
rel('d_nest', 'resolves-to', 'ip4')
rel('d_nest', 'resolves-to', 'ip6')
rel('d_spoof', 'resolves-to', 'ip4')
rel('ip4', 'belongs-to', 'asn')
rel('ind_domain', 'indicates', 'eggshell')
rel('ind_domain', 'based-on', 'd_nest')
rel('ind_mail', 'indicates', 'voliere')
rel('ind_mail', 'based-on', 'mail')
rel('aerodyne', 'located-at', 'france')

/* -- analyst notes ---------------------------------------------------------- */

// What an analyst really writes in the margin: hypotheses, caveats, to-dos.
// STIX `note`/`opinion` objects: they travel inside the bundle and make it
// into OpenCTI - unlike screen captures, which stay purely local.
note(
  'corax',
  'Attribution to confirm: the infrastructure overlaps two clusters we already ' +
    'track, but the evidence stays thin. Do not publish as is.',
)
note(
  'd_nest',
  'Whois: domain registered 6 days before the first detection, low-reputation ' +
    'registrar, name servers shared with the impersonation domain. ' +
    'See the attached capture.',
)
note(
  'sample',
  'The binary is an obfuscated .NET dropper (double .pdf.exe extension). ' +
    'Persistence via a scheduled task, no deobfuscation in the sandbox.',
)
note(
  'cve',
  'Exploitation confirmed on initial access; the vendor patch had been ' +
    'available for 3 weeks at the time of the incident.',
)
note(
  'url_beacon',
  'HTTP beacon every 60 s (10% jitter), User-Agent impersonating an update ' +
    'client. Proxy log extract attached.',
)
opinion(
  'voliere',
  'agree',
  'Two independent sources corroborate the modus operandi and the time ' +
    'window of the campaign.',
)

/* -- container + extension definition -------------------------------------- */

const report = {
  type: 'report',
  spec_version: '2.1',
  id: `report--${uuid(++n)}`,
  name: 'Operation Aviary',
  description:
    'Fictional investigation: the Corax espionage group targets Aerodyne Defence. ' +
    'Demonstration dataset, no real data.',
  report_types: ['campaign'],
  published: T,
  object_refs: objects.map((o) => o.id),
  created: T,
  modified: T,
}

// EXACT copy of what the builder emits (frontend/src/stix/bundle.ts): the
// example has to look like a real export, otherwise it teaches a format the
// tool does not produce. A guard test compares the two and fails on the
// slightest drift - it is what stops this block from ageing again.
//
// `schema` is TEXT and not a URL: a hosting address would travel inside every
// bundle shipped, and would end up no longer answering.
const toolIdentity = {
  type: 'identity',
  spec_version: '2.1',
  id: TOOL_IDENTITY,
  created: T,
  modified: T,
  name: 'Draw Me A STIX',
  identity_class: 'system',
}

const extensionDefinition = {
  type: 'extension-definition',
  spec_version: '2.1',
  id: EXT,
  created_by_ref: TOOL_IDENTITY,
  created: T,
  modified: T,
  name: 'Draw Me A STIX layout',
  description: 'Node positions on the DMAS canvas (ignored by other tools).',
  schema:
    'Canvas layout only. Adds position_x and position_y (numbers), local_id ' +
    'and source (strings) to an object, recording where it sat on the Draw Me ' +
    'A STIX canvas and where it came from. Carries no intelligence: a consumer ' +
    'can ignore this extension without losing anything.',
  version: '1.0',
  extension_types: ['property-extension'],
}

const bundle = {
  type: 'bundle',
  id: `bundle--${uuid(++n)}`,
  objects: [toolIdentity, extensionDefinition, report, ...objects],
}

// Writes both copies: the versioned reference and the asset served by the
// app (loading the demo in one click, #115). Direct writes rather than an
// stdout redirect: impossible to forget one of them.
const json = JSON.stringify(bundle, null, 2) + '\n'
const here = dirname(fileURLToPath(import.meta.url))
for (const out of [
  join(here, 'operation-voliere.stix.json'),
  join(here, '..', 'frontend', 'public', 'examples', 'operation-voliere.stix.json'),
]) {
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, json)
  process.stderr.write(`écrit : ${out}\n`)
}
