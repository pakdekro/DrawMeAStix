/**
 * Markdown export (#17): a portable text report (wiki, ticket, Obsidian...).
 *
 * The graph is serialized as **mermaid** (` ```mermaid `), which renders as a
 * real diagram on GitHub / GitLab / Obsidian / VS Code - that is what gives us
 * "a clean graph in Markdown". The narrative provides the readable body.
 * 100% deterministic, no LLM.
 */

import { buildNarrative, eventClause, eventSentence, timelineDiagram, timelines } from './narrative'
import type { NarrEntity, NarrRelation } from './narrative'
import { groupNotes, opinionLabel, type ReportNote } from './report'
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
  notes: ReportNote[] = [],
  /** draw the chronology as a mermaid timeline as well as listing it */
  includeTimeline = false,
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
    if (narr.chronology.length === 0 && narr.story.length === 0) {
      out.push('_No relationship yet._', '')
    }
    if (narr.chronology.length > 0) {
      out.push('### Chronology', '')
      // The drawing first when it was asked for: it is the shape of the case,
      // and the list under it is the same thing said precisely.
      if (includeTimeline) {
        out.push('```mermaid', timelineDiagram(narr.chronology), '```', '')
      }
      for (const event of narr.chronology) {
        out.push(`- **${event.when}** ${eventSentence(event)}`)
      }
      out.push('')
      // Per subject only when several of them are dated: one actor doing
      // everything would print the same list twice. See `timelines`.
      const perSubject = timelines(narr.chronology)
      if (perSubject.length > 0) {
        out.push('### Chronology, by subject', '')
        for (const { subject, events } of perSubject) {
          // one event is not a sequence: it reads as a line, the way a block
          // with a single clause reads as a sentence
          if (events.length === 1) {
            out.push(`**${subject}** - **${events[0].when}** ${eventClause(events[0])}`, '')
            continue
          }
          out.push(`**${subject}**`, '')
          for (const event of events) out.push(`- **${event.when}** ${eventClause(event)}`)
          out.push('')
        }
      }
    }
    if (narr.chronology.length > 0 && narr.story.length > 0) out.push('### Undated', '')
    for (const block of narr.story) {
      if (block.clauses.length === 1) {
        out.push(`${block.subject} ${block.clauses[0]}.`, '')
        continue
      }
      out.push(`**${block.subject}**`, '')
      for (const clause of block.clauses) out.push(`- ${clause}`)
      out.push('')
    }
    if (narr.detection.length) {
      out.push('### Detection', '')
      narr.detection.forEach((s) => out.push(s, ''))
    }
    if (narr.isolated.length) {
      out.push(`_Unlinked: ${narr.isolated.join(', ')}._`, '')
    }
  }

  // --- the analyst's own reasoning ---
  //
  // Last, and after the narrative, on purpose: the facts first, then what the
  // person who assembled them makes of the facts. Quoted rather than run into
  // the prose, so that nobody reads a doubt as a finding.
  const groups = groupNotes(notes, entities)
  if (groups.length > 0) {
    out.push('## Analyst notes', '')
    for (const { subject, notes: mine } of groups) {
      out.push(
        subject
          ? `### ${subject.name} _(${typeMeta(subject.stix_type).label})_`
          : '### About the case',
        '',
      )
      for (const note of mine) {
        if (note.kind === 'opinion') out.push(`**${opinionLabel(note)}**`, '')
        for (const line of note.content.split('\n')) out.push(`> ${line}`)
        out.push('')
      }
    }
  }

  out.push('---', '', SOURCE_URL, '')
  return out.join('\n')
}
