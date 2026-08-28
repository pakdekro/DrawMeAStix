import { describe, expect, it } from 'vitest'
import { Position } from '@xyflow/react'
import { contact, type Outline } from './floating'

const box = (cx: number, cy: number, hw = 50, hh = 20): Outline => ({
  cx,
  cy,
  hw,
  hh,
  round: false,
})
const disc = (cx: number, cy: number, r = 26): Outline => ({
  cx,
  cy,
  hw: r,
  hh: r,
  round: true,
})

describe('contact on a rectangle', () => {
  it('leaves through the right border when the target is to the right', () => {
    const c = contact(box(0, 0), box(400, 0))
    expect(c).toEqual({ x: 50, y: 0, side: Position.Right })
  })

  it('leaves through the left border when the target is to the left', () => {
    const c = contact(box(0, 0), box(-400, 0))
    expect(c).toEqual({ x: -50, y: 0, side: Position.Left })
  })

  it('leaves through the top border when the target is straight above', () => {
    const c = contact(box(0, 0), box(0, -400))
    expect(c).toEqual({ x: 0, y: -20, side: Position.Top })
  })

  // The whole point of the change: an edge pointing up used to be drawn
  // leaving downwards, because the source handle was at the bottom.
  it('does not leave downwards when the target is above', () => {
    expect(contact(box(0, 0), box(30, -400)).y).toBeLessThan(0)
  })

  it('lands exactly on the corner for a 45 degree box', () => {
    const c = contact(box(0, 0, 20, 20), box(100, 100, 20, 20))
    expect(c.x).toBeCloseTo(20)
    expect(c.y).toBeCloseTo(20)
  })

  it('stays on the border, never inside and never beyond', () => {
    const from = box(0, 0)
    for (const angle of [0.3, 1.1, 2.2, 3.4, 4.5, 5.9]) {
      const c = contact(from, box(Math.cos(angle) * 900, Math.sin(angle) * 900))
      const onX = Math.abs(Math.abs(c.x) - 50) < 1e-9
      const onY = Math.abs(Math.abs(c.y) - 20) < 1e-9
      expect(onX || onY).toBe(true)
      expect(Math.abs(c.x)).toBeLessThanOrEqual(50 + 1e-9)
      expect(Math.abs(c.y)).toBeLessThanOrEqual(20 + 1e-9)
    }
  })

  it('pushes the point out by the padding it is given', () => {
    expect(contact(box(0, 0), box(400, 0), 6).x).toBeCloseTo(56)
  })

  it('reads the wide box as wide: a shallow diagonal still leaves sideways', () => {
    // 100x40 box, target 300 right and 60 down - the ray meets the right
    // border, not the bottom one
    expect(contact(box(0, 0), box(300, 60)).side).toBe(Position.Right)
  })

  it('gives up gracefully on two shapes sharing a centre', () => {
    expect(contact(box(10, 10), box(10, 10))).toEqual({ x: 10, y: 10, side: Position.Top })
  })
})

describe('contact on a disc', () => {
  it('stays at one radius from the centre whatever the direction', () => {
    const from = disc(0, 0)
    for (const angle of [0, 0.7, 1.9, 3.3, 5.1]) {
      const c = contact(from, disc(Math.cos(angle) * 500, Math.sin(angle) * 500))
      expect(Math.hypot(c.x, c.y)).toBeCloseTo(26)
    }
  })

  it('adds the padding to the radius', () => {
    const c = contact(disc(0, 0), disc(0, 500), 4)
    expect(c.y).toBeCloseTo(30)
    expect(c.side).toBe(Position.Bottom)
  })
})
