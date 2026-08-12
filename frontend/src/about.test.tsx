import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DataPage from './components/DataPage'
import { OPENCTI_NAMESPACE } from './stix/ids'

/**
 * The /about page describes what the product actually does: where the data
 * lives, what leaves, what the identifiers imply (#225). Text that is right
 * the day it is written and wrong six months later is worth less than no text
 * at all, since it will be read as a commitment.
 *
 * These tests do not proofread the prose. They check what would turn it into
 * a lie: a page served at /about still carrying SPA links, and claims about
 * storage or identifiers that the code no longer honours.
 */

const html = renderToStaticMarkup(<DataPage />)

describe('la page servie à /about', () => {
  it("n'écrit aucun lien relatif au hash", () => {
    // Same trap as /guide: served at /about, an href `#/` would stay put. The
    // section anchor lives here as an id, never as a link.
    const internes = [...html.matchAll(/href="([^"]*)"/g)]
      .map((m) => m[1])
      .filter((h) => h.startsWith('#'))
    expect(internes).toEqual([])
    expect(html).toContain('href="/guide"')
  })

  it('garde l’ancre vers laquelle pointe le dialogue d’export', () => {
    // ExportDialog points at /about#identifiers at download time.
    expect(html).toContain('id="identifiers"')
  })

  it('n’a besoin d’aucun script pour dire ce qu’elle dit', () => {
    // The page explaining that nothing leaves the browser runs nothing.
    // The about.html entry point declares no module; if this component ever
    // gained state, that promise would have to be revisited too.
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
  })
})

describe('ce que la page affirme du produit', () => {
  it('décrit le stockage tel qu’il est', () => {
    // `stixit` is the real database name, and persistence really is requested:
    // see store.ts (openDb / navigator.storage.persist).
    expect(html).toContain('stixit')
    expect(html).toContain('persistent')
  })

  it('ne promet pas de chiffrement au repos', () => {
    // There is none. The day there is one, this sentence is what has to be
    // rewritten, and this test is what will say so.
    expect(html).toContain('no encryption at rest')
  })

  it('parle du bon algorithme d’identifiants', () => {
    // The namespace quoted comes from the module that computes them, not from
    // a copied constant: if the algorithm changed namespace, the page would
    // stop being accurate with nobody seeing it.
    expect(OPENCTI_NAMESPACE).toBe('00abedb4-aa42-466c-9c01-fed23315a9b7')
    expect(html).toContain('RFC 8785')
    expect(html).toContain('UUID version 5')
  })
})
