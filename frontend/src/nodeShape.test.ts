import { beforeEach, describe, expect, it } from 'vitest'
import { NODE_SHAPES, readShape, writeShape } from './nodeShape'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

let store: Storage

beforeEach(() => {
  store = memoryStorage()
})

describe('node shape setting', () => {
  it('starts on the card, the shape that always existed', () => {
    expect(readShape(store)).toBe('card')
  })

  it('reads back every shape it can write', () => {
    for (const s of NODE_SHAPES) {
      writeShape(store, s.id)
      expect(readShape(store)).toBe(s.id)
    }
  })

  // The value is a plain string in a store the user can edit, and an
  // unknown one must not reach the stylesheet as a class name.
  it('falls back to the card on a value it does not know', () => {
    store.setItem('dmas.node-shape', 'hexagon')
    expect(readShape(store)).toBe('card')
  })
})
