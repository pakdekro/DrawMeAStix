/**
 * Markdown export (#17): a portable text report (wiki, ticket, Obsidian...).
 *
 * The graph is serialized as **mermaid** (` ```mermaid `), which renders as a
 * real diagram on GitHub / GitLab / Obsidian / VS Code - that is what gives us
 * "a clean graph in Markdown". The narrative provides the readable body.
 * 100% deterministic, no LLM.
 */

import { buildNarrative, type NarrEntity, type NarrRelation } from './narrative'
import { typeMeta } from './stixMeta'

const SOURCE_URL = 'https://app.drawmeastix.io'

// mermaid labels: keep out the quotes and newlines that break the syntax
const mm = (s: string) => s.replace(/["\r\n]+/g, "'").trim()
// mermaid class name (alphanumeric) derived from a STIX type
const classOf = (t: string) => 'st' + t.replace(/[^a-z0-9]/gi, '')

export function buildMarkdown(
  title: string,
  entities: NarrEntity[],
  relations: NarrRelation[],
  includeNarrative: boolean,
): string {
  const idOf = new Map(entities.map((e, i) => [e.id, `n${i}`]))
  const rels = relations.filter((r) => idOf.has(r.source) && idOf.has(r.target))
  const out: string[] = []

  out.push(`# ${title}`, '')
  out.push(
    `> ${entities.length} entit${entities.length > 1 ? 'ies' : 'y'}, ` +
      `${rels.length} relation${rels.length > 1 ? 's' : ''}, ` +
      `generated with [Draw Me A STIX](${SOURCE_URL}).`,
    '',
  )

  // --- graph as mermaid ---
  out.push('```mermaid', 'graph TD')
  for (const e of entities) {
    out.push(`  ${idOf.get(e.id)}["${mm(typeMeta(e.stix_type).label)}: ${mm(e.name)}"]`)
  }
  for (const r of rels) {
    out.push(`  ${idOf.get(r.source)} -->|${mm(r.type)}| ${idOf.get(r.target)}`)
  }
  // border color per type (Kanagawa colors), so the diagram stays colored
  for (const t of [...new Set(entities.map((e) => e.stix_type))]) {
    out.push(`  classDef ${classOf(t)} stroke:${typeMeta(t).color},stroke-width:2px`)
  }
  for (const e of entities) {
    out.push(`  class ${idOf.get(e.id)} ${classOf(e.stix_type)}`)
  }
  out.push('```', '')

  // --- narrative ---
  if (includeNarrative) {
    const narr = buildNarrative(entities, relations)
    out.push('## Narrative', '')
    if (narr.story.length === 0) out.push('_No relationship yet._', '')
    narr.story.forEach((s) => out.push(s, ''))
    if (narr.detection.length) {
      out.push('### Detection', '')
      narr.detection.forEach((s) => out.push(s, ''))
    }
    if (narr.isolated.length) {
      out.push(`_Unlinked: ${narr.isolated.join(', ')}._`, '')
    }
  }

  out.push('---', '', SOURCE_URL, '')
  return out.join('\n')
}
