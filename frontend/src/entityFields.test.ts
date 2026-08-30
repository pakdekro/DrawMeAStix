import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_NAME_PROPERTIES,
  DEFAULT_ACCOUNT_NAME_PROPERTY,
  INFRASTRUCTURE_TYPE_OV,
  fieldsFor,
  toFormValues,
  toProperties,
} from './entityFields'
import schema from './stix/schemas/sdos/infrastructure.json'
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

describe('infrastructure_types', () => {
  it('offre le vocabulaire de la spec, et exactement lui', () => {
    // The vendored OASIS schema is the source; it declares the property as an
    // array of plain strings, so nothing downstream would catch a value we
    // made up here. This test is the only thing holding the two in step.
    const enums = schema.definitions['infrastructure-type-ov'].enum
    expect([...INFRASTRUCTURE_TYPE_OV]).toEqual(enums)
    const field = fieldsFor('infrastructure').find((f) => f.key === 'infrastructure_types')!
    expect(field.type).toBe('multiselect')
    expect(field.options).toEqual(enums)
  })

  it('voyage comme une liste, et rien du tout quand rien n’est coché', () => {
    expect(
      toProperties('infrastructure', { infrastructure_types: ['phishing', 'staging'] })
        .infrastructure_types,
    ).toEqual(['phishing', 'staging'])
    // minItems 1 in the schema: an empty list is not a value, it is a claim
    // that the analyst never made
    expect(toProperties('infrastructure', { infrastructure_types: [] })).not.toHaveProperty(
      'infrastructure_types',
    )
  })
})

describe("le nom d'un compte", () => {
  it('propose les trois noms de la spec, avec le login par défaut', () => {
    const keys = fieldsFor('user-account').map((f) => f.key)
    expect(keys).toContain('account_name_is')
    // the three properties are all offered as fields too: the form hides the
    // one the name occupies, so they are never two ways of saying one thing
    expect(keys).toEqual(expect.arrayContaining(['account_login', 'user_id', 'display_name']))
    expect(ACCOUNT_NAME_PROPERTIES.map((o) => o.value)).toEqual([
      'account_login',
      'user_id',
      'display_name',
    ])
    expect(DEFAULT_ACCOUNT_NAME_PROPERTY).toBe('account_login')
  })

  it("ne stocke pas le défaut : un compte d'avant ce choix garde son id", () => {
    expect(
      toProperties('user-account', { account_name_is: 'account_login' }),
    ).not.toHaveProperty('account_name_is')
    expect(toProperties('user-account', { account_name_is: 'user_id' }).account_name_is).toBe(
      'user_id',
    )
  })
})
