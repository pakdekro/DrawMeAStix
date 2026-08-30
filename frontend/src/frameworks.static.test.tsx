import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AttackGuide from './components/AttackGuide'
import F3Guide, { F3_TACTICS } from './components/F3Guide'
import attackDataset from '../public/attack-dataset.json'
import f3Dataset from '../public/f3-dataset.json'

/**
 * The two framework pages (#/attack and /attack, #/f3 and /f3).
 *
 * Same trap as the STIX guide: a prose page that goes wrong stays online and
 * says nothing. Two things can go wrong here. The links can be written in the
 * shape of the wrong address, and the prose can fall out of step with the
 * dataset it describes, which is the only part of it that has a source of
 * truth in the repository.
 */

const pages = {
  attack: {
    static: renderToStaticMarkup(<AttackGuide mode="static" />),
    app: renderToStaticMarkup(<AttackGuide mode="app" />),
  },
  f3: {
    static: renderToStaticMarkup(<F3Guide mode="static" />),
    app: renderToStaticMarkup(<F3Guide mode="app" />),
  },
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])

describe.each(Object.entries(pages))('the %s page', (route, html) => {
  it('writes no hash-relative link when served at its own address', () => {
    // Served at /attack, an `#/f3` href would stay put instead of reaching
    // anything, and nothing would report it.
    expect(hrefs(html.static).filter((h) => h.startsWith('#'))).toEqual([])
    expect(hrefs(html.static)).toContain('/')
    expect(hrefs(html.app)).toContain('#/')
  })

  it('leads to its sibling and to the STIX guide', () => {
    const other = route === 'attack' ? 'f3' : 'attack'
    expect(hrefs(html.static)).toContain(`/${other}`)
    expect(hrefs(html.static)).toContain('/guide')
    expect(hrefs(html.app)).toContain(`#/${other}`)
  })

  it('is a page and not a stub', () => {
    expect(html.static.length).toBeGreaterThan(4000)
  })
})

describe('the F3 page says what the shipped dataset says', () => {
  it('the same eight tactics, in the same order, with the same origins', () => {
    // The tactics are written down on the page and generated in the dataset.
    // The day F3 publishes a ninth, this is what says so.
    expect(F3_TACTICS.map((t) => t.id)).toEqual(f3Dataset.tactics.map((t) => t.id))
    expect(F3_TACTICS.map((t) => t.name)).toEqual(f3Dataset.tactics.map((t) => t.name))
    expect(F3_TACTICS.map((t) => t.own)).toEqual(
      f3Dataset.tactics.map((t) => t.framework === 'mitre-f3'),
    )
  })

  it('the number of techniques it borrows from ATT&CK', () => {
    const borrowed = f3Dataset.entries.filter((e) => e.framework !== 'mitre-f3').length
    expect(pages.f3.static).toContain(`${borrowed} techniques F3 borrows`)
  })

  it('the six shared tactics are counted right', () => {
    const shared = f3Dataset.tactics.filter((t) => t.framework !== 'mitre-f3').length
    expect(shared).toBe(6)
    expect(pages.f3.static).toContain('Six of them')
  })
})

describe('the ATT&CK page says which matrix is shipped', () => {
  it('names the one the dataset actually holds', () => {
    expect(attackDataset.source).toContain('Enterprise')
    expect(pages.attack.static).toContain('Enterprise')
  })
})
