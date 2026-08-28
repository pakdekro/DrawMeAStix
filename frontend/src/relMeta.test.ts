import { describe, expect, it } from 'vitest'
import { REL_FAMILIES, relColor, relFamily } from './relMeta'

describe('relationship families', () => {
  it('reads the verbs an analyst leans on', () => {
    expect(relFamily('attributed-to')).toBe('attribution')
    expect(relFamily('uses')).toBe('capability')
    expect(relFamily('targets')).toBe('victimology')
    expect(relFamily('indicates')).toBe('detection')
    expect(relFamily('resolves-to')).toBe('infrastructure')
  })

  // An unknown verb must read as unclassified. Guessing a family for it would
  // colour a relationship as something it has not been shown to be.
  it('leaves anything it does not know unclassified', () => {
    expect(relFamily('related-to')).toBe('generic')
    expect(relFamily('some-future-stix-verb')).toBe('generic')
    expect(relFamily('')).toBe('generic')
  })

  it('gives every family a colour of its own', () => {
    const colors = REL_FAMILIES.map((f) => f.color)
    expect(new Set(colors).size).toBe(REL_FAMILIES.length)
  })

  it('answers with a colour for any verb at all', () => {
    expect(relColor('uses')).toBe(REL_FAMILIES.find((f) => f.id === 'capability')!.color)
    expect(relColor('nonsense')).toBe(REL_FAMILIES.find((f) => f.id === 'generic')!.color)
  })
})
