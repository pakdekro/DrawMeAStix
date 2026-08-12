import { describe, expect, it, vi } from 'vitest'
import { inlineUrls } from './export-image'

/**
 * Regression cover for the Firefox-only export failure.
 *
 * `html-to-image` filters the @font-face rules it collects with
 * `rule.style.fontFamily`. On an @font-face rule Firefox leaves that property
 * undefined where Chromium returns the family, so the library called `.trim()`
 * on undefined and every PNG, JPG and PDF export died with "can't access
 * property trim of undefined". Markdown was spared, being the one format that
 * never touches the library.
 *
 * We now hand it the font CSS ourselves. These tests hold that route open,
 * because the failure is invisible from a Chromium-based test run: the suite
 * would stay green while the feature is broken for half the users.
 */

// Source lue par Vite, comme le fait le garde-fou i18n : le tsconfig du
// frontend n'embarque pas les types Node, et `fetch` ne sert pas un file://.
const SOURCE = (
  Object.values(
    import.meta.glob('./export-image.ts', { query: '?raw', import: 'default', eager: true }),
  )[0] as string
)

describe('la route qui contourne le bug Firefox', () => {
  it('ne lit jamais une propriété que Firefox laisse indéfinie', async () => {
    // Le coeur du correctif tient dans une règle : passer par
    // getPropertyValue, jamais par l'accesseur camelCase sur une règle
    // @font-face. La vérification est statique parce que la différence entre
    // les deux moteurs ne se rejoue pas dans une suite de tests.
    // Commentaires retirés : celui qui explique le correctif cite forcément la
    // propriété fautive, et le test se serait déclenché sur son propre exposé.
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).toContain("getPropertyValue('src')")
    expect(code).not.toMatch(/\.style\.fontFamily/)
  })

  it('fournit son propre CSS de polices à html-to-image', async () => {
    // Sans `fontEmbedCSS`, la bibliothèque reprend son chemin fautif. Et sans
    // polices embarquées tout court, l'image sortirait dans une fonte de
    // repli : la rastérisation passe par un foreignObject SVG chargé en data
    // URL, un document qui n'atteint pas les polices de la page.
    const source = SOURCE
    expect(source).toContain('fontEmbedCSS')
  })
})

describe('inlineUrls', () => {
  const cssText = "font-family:Test;src:url(/assets/test.woff2) format('woff2')"

  it('remplace le fichier par son contenu en base64', async () => {
    vi.stubGlobal('fetch', async () => ({
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      headers: { get: () => 'font/woff2' },
    }))
    const out = await inlineUrls(cssText, cssText, 'https://x.example/')
    expect(out).toContain('data:font/woff2;base64,')
    expect(out).not.toContain('/assets/test.woff2')
    vi.unstubAllGlobals()
  })

  it('un fichier injoignable ne fait pas tomber l’export entier', async () => {
    // Perdre une police dégrade l'image ; perdre l'export ne laisse rien.
    vi.stubGlobal('fetch', async () => {
      throw new Error('réseau coupé')
    })
    await expect(inlineUrls(cssText, cssText, 'https://x.example/')).resolves.toBe(cssText)
    vi.unstubAllGlobals()
  })

  it('laisse tranquille ce qui est déjà en data URI', async () => {
    const deja = 'src:url(data:font/woff2;base64,AAA) format("woff2")'
    const appels = vi.fn()
    vi.stubGlobal('fetch', appels)
    expect(await inlineUrls(deja, deja, 'https://x.example/')).toBe(deja)
    expect(appels).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
