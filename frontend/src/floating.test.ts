import { describe, expect, it } from 'vitest'
import { Position } from '@xyflow/react'
import { CORNER, PAD, PITCH, anchor, type AnchorEdge, type AnchorNode } from './floating'

const W = 230
const H = 63
const card = (id: string, x: number, y: number, w = W, h = H): AnchorNode => ({
  id,
  x,
  y,
  w,
  h,
})
const link = (id: string, source: string, target: string): AnchorEdge => ({
  id,
  source,
  target,
})
const middleX = (n: AnchorNode) => n.x + n.w / 2
const middleY = (n: AnchorNode) => n.y + n.h / 2

describe('one edge on a side', () => {
  it('leaves from the middle of the side, clear of the border', () => {
    const a = card('a', 0, 0)
    const b = card('b', 900, 0)
    const ends = anchor([a, b], [link('e', 'a', 'b')]).get('e')!
    expect(ends.from).toEqual({ x: a.x + W + PAD, y: middleY(a), side: Position.Right })
    expect(ends.to).toEqual({ x: b.x - PAD, y: middleY(b), side: Position.Left })
  })

  /**
   * The reason the ray-to-outline answer was dropped. Cobalt Strike hangs off
   * one relationship, arriving from up and to the left; anchored where the
   * ray crosses the outline it met the card at a corner, which reads as a
   * mistake.
   */
  it('still uses a middle when the other card is diagonally away', () => {
    const a = card('a', 0, 0)
    const b = card('b', 300, 260)
    const ends = anchor([a, b], [link('e', 'a', 'b')]).get('e')!
    expect(ends.from.x).toBe(middleX(a))
    expect(ends.from.side).toBe(Position.Bottom)
    expect(ends.to.x).toBe(middleX(b))
    expect(ends.to.side).toBe(Position.Top)
  })

  // A card is nearly four times wider than it is tall, so the short way out of
  // it is up and down far more often than a square would suggest.
  it('reads the card as wide when it picks the side', () => {
    const a = card('a', 0, 0)
    const ends = anchor([a, card('b', 300, 60)], [link('e', 'a', 'b')]).get('e')!
    expect(ends.from.side).toBe(Position.Right)
    const steeper = anchor([a, card('b', 300, 300)], [link('e', 'a', 'b')]).get('e')!
    expect(steeper.from.side).toBe(Position.Bottom)
  })
})

describe('several edges on the same side', () => {
  const hub = card('hub', 0, 0)
  const below = (n: number) =>
    Array.from({ length: n }, (_, i) => card(`n${i}`, (i - n / 2) * 260, 400))
  const spokes = (n: number) =>
    Array.from({ length: n }, (_, i) => link(`e${i}`, 'hub', `n${i}`))

  it('fans out around the middle instead of piling up on it', () => {
    const map = anchor([hub, ...below(3)], spokes(3))
    const xs = ['e0', 'e1', 'e2'].map((id) => map.get(id)!.from.x)
    expect(new Set(xs).size).toBe(3)
    expect(xs[1]).toBe(middleX(hub)) // the odd one keeps the middle
  })

  it('stays centred on the middle, whatever the count', () => {
    for (const n of [2, 3, 4, 7]) {
      const map = anchor([hub, ...below(n)], spokes(n))
      const xs = Array.from({ length: n }, (_, i) => map.get(`e${i}`)!.from.x)
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(middleX(hub))
    }
  })

  it('never reaches the corners, however many edges want the side', () => {
    const map = anchor([hub, ...below(20)], spokes(20))
    const onTheBottom = Array.from({ length: 20 }, (_, i) => map.get(`e${i}`)!.from).filter(
      (c) => c.side === Position.Bottom,
    )
    expect(onTheBottom.length).toBeGreaterThan(4)
    for (const c of onTheBottom) {
      expect(c.x).toBeGreaterThanOrEqual(hub.x + CORNER - 0.001)
      expect(c.x).toBeLessThanOrEqual(hub.x + W - CORNER + 0.001)
    }
  })

  it('keeps a full pitch between anchors while there is room for it', () => {
    const map = anchor([hub, ...below(3)], spokes(3))
    const xs = ['e0', 'e1', 'e2'].map((id) => map.get(id)!.from.x).sort((p, q) => p - q)
    expect(xs[1] - xs[0]).toBeCloseTo(PITCH)
  })

  /**
   * Order matters as much as spacing: the leftmost target has to get the
   * leftmost anchor, or two edges leaving the same border cross each other in
   * the last few pixels, which is the very thing this is meant to stop.
   */
  it('orders the fan the way the targets lie along the side', () => {
    const nodes = [hub, card('left', -600, 400), card('mid', 0, 400), card('right', 600, 400)]
    const map = anchor(nodes, [
      link('toRight', 'hub', 'right'),
      link('toLeft', 'hub', 'left'),
      link('toMid', 'hub', 'mid'),
    ])
    expect(map.get('toLeft')!.from.x).toBeLessThan(map.get('toMid')!.from.x)
    expect(map.get('toMid')!.from.x).toBeLessThan(map.get('toRight')!.from.x)
  })

  it('fans a tall side down its height, not across its width', () => {
    // Barely off the hub's own line: a card is wide enough that a steeper
    // spread would leave through the top and the bottom instead.
    const stack = [card('a', 600, -70), card('b', 600, 0), card('c', 600, 70)]
    const map = anchor([hub, ...stack], [
      link('e0', 'hub', 'a'),
      link('e1', 'hub', 'b'),
      link('e2', 'hub', 'c'),
    ])
    const ys = ['e0', 'e1', 'e2'].map((id) => map.get(id)!.from.y)
    expect(new Set(ys).size).toBe(3)
    expect(new Set(['e0', 'e1', 'e2'].map((id) => map.get(id)!.from.x)).size).toBe(1)
  })
})

describe('the edges it cannot place', () => {
  it('skips an edge whose endpoint is gone', () => {
    expect(anchor([card('a', 0, 0)], [link('e', 'a', 'ghost')]).size).toBe(0)
  })

  it('skips two cards sharing a centre, which point nowhere', () => {
    expect(anchor([card('a', 0, 0), card('b', 0, 0)], [link('e', 'a', 'b')]).size).toBe(0)
  })

  it('counts both ends of every edge it does place', () => {
    const map = anchor(
      [card('a', 0, 0), card('b', 600, 0), card('c', 0, 400)],
      [link('e1', 'a', 'b'), link('e2', 'a', 'c'), link('e3', 'b', 'c')],
    )
    expect(map.size).toBe(3)
    for (const pair of map.values()) expect(pair.from).not.toBe(pair.to)
  })
})
