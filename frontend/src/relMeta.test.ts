import { describe, expect, it } from 'vitest'
import { REL_FAMILIES, relColor, relFamily, relLabelColor } from './relMeta'

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

/**
 * A bundle may carry any verb it likes: STIX allows custom relationship
 * types, and an import is not obliged to stay inside our vocabulary. Looked
 * up in a plain object, `constructor` came back as a function and the colour
 * lookup that followed threw.
 */
describe('a verb that is not a verb', () => {
  it('reads the names of Object.prototype as unclassified', () => {
    for (const nasty of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(relFamily(nasty)).toBe('generic')
      expect(relColor(nasty)).toMatch(/^#[0-9a-f]{6}$/)
      expect(relLabelColor(nasty)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('the colour the verb is written in', () => {
  it('is the family colour lifted towards the page, not a second colour', () => {
    for (const f of REL_FAMILIES) {
      expect(f.color).toMatch(/^#[0-9a-f]{6}$/)
    }
    // lifted, so it is lighter than the stroke it belongs to
    const lum = (hex: string) =>
      [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0)
    expect(lum(relLabelColor('uses'))).toBeGreaterThan(lum(relColor('uses')))
  })

  // Real colours and not `var(--x)`: html-to-image clones the edge's own <svg>
  // without inlining what its descendants compute, so anything the image
  // export must show has to be spelled out on the element.
  it('is a colour the image export can see', () => {
    expect(relColor('uses').startsWith('#')).toBe(true)
    expect(relLabelColor('uses').startsWith('#')).toBe(true)
  })
})
