import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import StixGuide from './components/StixGuide'
import { label } from './guide'

/**
 * The /guide page is prerendered at build time then hydrated (#223). These
 * tests cover what the prerender produces, because it is the one place in the
 * project where a mistake does not show: a broken static page stays online,
 * silent, until somebody reads it.
 *
 * `renderToString`, like `prerender.tsx`: that HTML is exactly what ships to
 * production, hydration markers included.
 */

const staticHtml = renderToString(<StixGuide mode="static" />)
const appHtml = renderToString(<StixGuide mode="app" />)

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])

describe('la page servie à /guide', () => {
  it("n'écrit aucun lien relatif au hash", () => {
    // The invariant that would break in silence. Served at /guide, the page
    // would turn an `#/` href into a local anchor: the link would stay put
    // instead of reaching the application, and nothing would report it.
    expect(hrefs(staticHtml).filter((h) => h.startsWith('#'))).toEqual([])
    expect(hrefs(staticHtml)).toContain('/')
    // And the application itself keeps its hash links.
    expect(hrefs(appHtml)).toContain('#/')
  })

  it('dit déjà quelque chose sans JavaScript', () => {
    // The delivered HTML carries a default selection, so both interactive
    // sections are already filled in before the script even arrives.
    expect(staticHtml).toContain('An observable is never the')
    expect(staticHtml).toContain(`<strong>${label('threat-actor')}</strong>`)
    expect(staticHtml).toContain('guide-answer')
    expect(staticHtml.length).toBeGreaterThan(10_000)
  })

  it("n'offre pas de commande morte", () => {
    // A dropdown that changes its label without producing anything would
    // cast doubt on the rest of the page. They ship disabled, and hydration
    // is what hands them back to the reader.
    const selects = staticHtml.match(/<select[^>]*>/g) ?? []
    expect(selects).toHaveLength(3)
    expect(selects.every((s) => s.includes('disabled'))).toBe(true)
    expect((appHtml.match(/<select[^>]*disabled/g) ?? []).length).toBe(0)
  })
})

describe('les deux adresses servent le même guide', () => {
  it('à la forme des liens et à l’état des menus près, c’est le même HTML', () => {
    // The test that really counts: it forbids /guide from becoming a
    // stripped-down version that would age on its own. Any section added to
    // one and not the other brings it down.
    const normalise = (html: string) =>
      html
        .replaceAll('href="/"', 'href="#/"')
        .replaceAll('Open the canvas', 'Back to investigations')
        .replaceAll(' disabled=""', '')
    const ici = normalise(staticHtml)
    const appli = normalise(appHtml)

    // Comparing both pages whole would spit twice twenty kilobytes of HTML at
    // whoever breaks the test, that is to say an unreadable failure. So only
    // the neighbourhood of the first difference is shown.
    if (ici !== appli) {
      let i = 0
      while (ici[i] === appli[i]) i++
      const autour = (s: string) => `…${s.slice(Math.max(0, i - 70), i + 70)}…`
      expect(autour(ici)).toBe(autour(appli))
    }
    expect(ici).toHaveLength(appli.length)
  })
})
