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
  it('marks an F3 technique', () => {
    expect(card({ x_mitre_id: 'F1050', mitre_framework: 'mitre-f3' })).toContain('>F3<')
  })

  it('leaves an ATT&CK technique unmarked, absent meaning ATT&CK', () => {
    expect(card({ x_mitre_id: 'T1566' })).not.toContain('node-framework')
    expect(card({ x_mitre_id: 'T1566', mitre_framework: 'mitre-attack' })).not.toContain(
      'node-framework',
    )
  })

  /** F3 publishes T-numbers, so the property decides and the number never does */
  it('marks an F3 technique that carries an ATT&CK number', () => {
    expect(card({ x_mitre_id: 'T1110.003', mitre_framework: 'mitre-f3' })).toContain('>F3<')
  })

  it('marks nothing on an object that is not a technique', () => {
    expect(card({ mitre_framework: 'mitre-f3' }, 'malware')).not.toContain('node-framework')
  })
})
