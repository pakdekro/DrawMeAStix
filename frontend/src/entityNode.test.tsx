import { renderToStaticMarkup } from 'react-dom/server'
import { ReactFlowProvider } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import EntityNode from './components/EntityNode'
import type { Entity } from './types'

/**
 * The card says which framework a technique came from, because a fraud case
 * mixes the two and the number does not arbitrate: F3 reuses 43 ATT&CK
 * numbers and publishes T-numbers of its own.
 */
const card = (properties: Record<string, unknown>, stix_type = 'attack-pattern') => {
  const entity = {
    id: 'e1',
    investigation_id: 'i1',
    stix_type,
    name: 'Impersonate Account Holder',
    status: 'confirmed',
    properties,
  } as unknown as Entity
  const props = {
    id: 'e1',
    data: { entity },
    selected: false,
  } as unknown as React.ComponentProps<typeof EntityNode>
  return renderToStaticMarkup(
    <ReactFlowProvider>
      <EntityNode {...props} />
    </ReactFlowProvider>,
  )
}

describe('the framework mark on a card', () => {
  it('names F3', () => {
    expect(card({ x_mitre_id: 'F1050', mitre_framework: 'mitre-f3' })).toContain('>F3<')
  })

  it('names ATT&CK too, said rather than implied', () => {
    // Two frameworks is where "no mark means ATT&CK" still reads as a rule,
    // three is where it reads as an oversight.
    expect(card({ x_mitre_id: 'T1566' })).toContain('>ATT&amp;CK<')
    expect(card({ x_mitre_id: 'T1566', mitre_framework: 'mitre-attack' })).toContain(
      '>ATT&amp;CK<',
    )
  })

  /** F3 publishes T-numbers, so the property decides and the number never does */
  it('marks an F3 technique that carries an ATT&CK number', () => {
    expect(card({ x_mitre_id: 'T1110.003', mitre_framework: 'mitre-f3' })).toContain('>F3<')
  })

  it('claims nothing for a technique with no number', () => {
    expect(card({})).not.toContain('node-framework')
  })

  it('marks nothing on an object that is not a technique', () => {
    expect(card({ x_mitre_id: 'F1050', mitre_framework: 'mitre-f3' }, 'malware')).not.toContain(
      'node-framework',
    )
  })
})
