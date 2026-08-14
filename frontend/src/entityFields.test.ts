import { describe, expect, it } from 'vitest'
import { fieldsFor, toFormValues, toProperties } from './entityFields'
import { SCO_TYPES, SDO_TYPES } from './stix/relationships'
import { SCO_ORDER, SDO_ORDER } from './stixMeta'

describe('la palette montre exactement les types que la matrice connaît', () => {
  // Declaring a type in the matrix and forgetting it here is silent: it never
  // shows up in the palette, and anything that reaches the canvas some other
  // way (import, paste) renders grey with its raw STIX type for a label.
  it('aucun type oublié dans un sens ni dans l’autre', () => {
    expect([...SCO_ORDER].sort()).toEqual([...SCO_TYPES].sort())
    expect([...SDO_ORDER].sort()).toEqual([...SDO_TYPES].sort())
  })
})

describe('champs communs SDO (#125)', () => {
  it('confiance et TLP proposés sur les SDO, pas sur les SCO', () => {
    const sdoKeys = fieldsFor('malware').map((f) => f.key)
    expect(sdoKeys).toContain('confidence')
    expect(sdoKeys).toContain('tlp')
    const scoKeys = fieldsFor('ipv4-addr').map((f) => f.key)
    expect(scoKeys).not.toContain('confidence')
    expect(scoKeys).not.toContain('tlp')
  })

  it('toProperties : confiance convertie en entier 0-100, sinon écartée', () => {
    expect(toProperties('malware', { confidence: '85' }).confidence).toBe(85)
    expect(toProperties('malware', { confidence: '150' })).not.toHaveProperty('confidence')
    expect(toProperties('malware', { confidence: 'haute' })).not.toHaveProperty('confidence')
    expect(toProperties('malware', { confidence: '' })).not.toHaveProperty('confidence')
  })

  it('toProperties : tlp vide (hérite de l’export) non stocké', () => {
    expect(toProperties('malware', { tlp: '' })).not.toHaveProperty('tlp')
    expect(toProperties('malware', { tlp: 'red' }).tlp).toBe('red')
  })
})

describe('labels (#132)', () => {
  it('proposés sur les SDO, convertis en liste, jamais vides', () => {
    expect(fieldsFor('malware').map((f) => f.key)).toContain('labels')
    expect(toProperties('malware', { labels: 'ransomware, campagne-2026' }).labels).toEqual([
      'ransomware',
      'campagne-2026',
    ])
    expect(toProperties('malware', { labels: ' , ' })).not.toHaveProperty('labels')
  })
})

describe('toFormValues labels', () => {
  it('liste → champ texte', () => {
    expect(toFormValues({ labels: ['a', 'b'] }).labels).toBe('a, b')
  })
})
