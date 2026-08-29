import { describe, expect, it } from 'vitest'
import { groupNotes, opinionLabel, type ReportNote, type ReportSubject } from './report'

const entity = (id: string, name: string): ReportSubject => ({
  id,
  stix_type: 'malware',
  name,
})
const note = (entityId: string | null, content: string): ReportNote => ({
  entityId,
  kind: 'note',
  value: null,
  content,
})

describe('gathering the reasoning', () => {
  it('puts each note under the object it is about', () => {
    const entities = [entity('a', 'Corax'), entity('b', 'NestDrop')]
    const groups = groupNotes([note('b', 'about b'), note('a', 'about a')], entities)
    expect(groups.map((g) => g.subject!.name)).toEqual(['Corax', 'NestDrop'])
    expect(groups[0].notes[0].content).toBe('about a')
  })

  it('follows the order of the objects, not the order the notes were written', () => {
    const entities = [entity('a', 'first'), entity('b', 'second')]
    const groups = groupNotes([note('b', 'x'), note('a', 'y')], entities)
    expect(groups[0].subject!.id).toBe('a')
  })

  it('keeps several notes on one object together, in the order they were written', () => {
    const groups = groupNotes([note('a', 'one'), note('a', 'two')], [entity('a', 'Corax')])
    expect(groups).toHaveLength(1)
    expect(groups[0].notes.map((n) => n.content)).toEqual(['one', 'two'])
  })

  it('gives the notes about the case as a whole a group of their own, last', () => {
    const groups = groupNotes([note(null, 'about the case'), note('a', 'about a')], [entity('a', 'Corax')])
    expect(groups).toHaveLength(2)
    expect(groups[1].subject).toBeNull()
  })

  /**
   * It cannot normally happen: a note always points at an object of the same
   * investigation. But losing what the analyst wrote is the one outcome this
   * whole thing exists to prevent, so it is kept rather than dropped.
   */
  it('keeps a note whose object is not in the report rather than losing it', () => {
    const groups = groupNotes([note('gone', 'orphan')], [entity('a', 'Corax')])
    expect(groups).toHaveLength(1)
    expect(groups[0].subject).toBeNull()
    expect(groups[0].notes[0].content).toBe('orphan')
  })

  it('says nothing at all when nothing was written', () => {
    expect(groupNotes([], [entity('a', 'Corax')])).toEqual([])
  })

  it('leaves an object with no note out of the report', () => {
    expect(groupNotes([note('a', 'x')], [entity('a', 'A'), entity('b', 'B')])).toHaveLength(1)
  })
})

describe('naming an opinion', () => {
  it('carries the scale the analyst chose, spelled out', () => {
    expect(opinionLabel({ entityId: 'a', kind: 'opinion', value: 'strongly-agree', content: '' }))
      .toBe('Opinion: strongly agree')
  })

  it('still says it is an opinion when the scale was left empty', () => {
    expect(opinionLabel({ entityId: 'a', kind: 'opinion', value: null, content: '' }))
      .toBe('Opinion')
  })
})
