import { describe, expect, it } from 'vitest'
import { Position } from '@xyflow/react'
import { PAD, contact, outline, outlineFits } from './floating'

/** The card sizes the canvas actually draws: 120 to 230 wide, one to four rows. */
const CARDS = [
  [120, 40],
  [120, 63],
  [180, 63],
  [230, 63],
  [230, 88],
  [230, 120],
] as const

const at = (cx: number, cy: number, w = 230, h = 63) => outline(cx, cy, w, h)

describe('the oval an edge hangs off', () => {
  it('sits outside the card on every side', () => {
    const o = at(0, 0)
    expect(o.a).toBe(115 + PAD)
    expect(o.b).toBe(31.5 + PAD)
  })

  // The one thing the shape MUST do. An oval that cuts the corners would let
  // a diagonal edge end inside the box, arrowhead and all.
  it('clears the corners of every card the canvas draws', () => {
    for (const [w, h] of CARDS) expect(outlineFits(w, h)).toBe(true)
  })

  it('never puts a contact point inside the card', () => {
    for (const [w, h] of CARDS) {
      const from = at(0, 0, w, h)
      for (const angle of [0.1, 0.5, 0.9, 1.4, 2.0, 2.6, 3.1, 3.9, 4.7, 5.5, 6.1]) {
        const c = contact(from, at(Math.cos(angle) * 900, Math.sin(angle) * 900, w, h))
        const outside = Math.abs(c.x) > w / 2 || Math.abs(c.y) > h / 2
        expect(outside).toBe(true)
      }
    }
  })
})

describe('contact', () => {
  it('leaves through the side facing the other card', () => {
    expect(contact(at(0, 0), at(400, 0)).side).toBe(Position.Right)
    expect(contact(at(0, 0), at(-400, 0)).side).toBe(Position.Left)
    expect(contact(at(0, 0), at(0, 400)).side).toBe(Position.Bottom)
    expect(contact(at(0, 0), at(0, -400)).side).toBe(Position.Top)
  })

  it('touches the semi-axis exactly when the ray runs along one', () => {
    const o = at(0, 0)
    expect(contact(o, at(400, 0)).x).toBeCloseTo(o.a)
    expect(contact(o, at(0, -400)).y).toBeCloseTo(-o.b)
  })

  // The whole point of the change: an edge pointing up used to be drawn
  // leaving downwards, because the source handle was at the bottom.
  it('does not leave downwards when the target is above', () => {
    expect(contact(at(0, 0), at(30, -400)).y).toBeLessThan(0)
  })

  /**
   * The anchor has to travel, not snap: two targets a degree apart must give
   * two contact points a hair apart, all the way round. A jump would show up
   * as an edge flicking from one side of the card to the other while the
   * analyst drags a neighbour past it.
   */
  it('slides continuously around the oval', () => {
    const from = at(0, 0)
    let previous = contact(from, at(600, 0))
    for (let deg = 1; deg <= 360; deg++) {
      const angle = (deg * Math.PI) / 180
      const here = contact(from, at(Math.cos(angle) * 600, Math.sin(angle) * 600))
      expect(Math.hypot(here.x - previous.x, here.y - previous.y)).toBeLessThan(6)
      previous = here
    }
  })

  it('reads the wide card as wide: a shallow diagonal still leaves sideways', () => {
    expect(contact(at(0, 0), at(300, 60)).side).toBe(Position.Right)
  })

  it('gives up gracefully on two cards sharing a centre', () => {
    expect(contact(at(10, 10), at(10, 10))).toEqual({ x: 10, y: 10, side: Position.Top })
  })
})
