/**
 * Entry point for the /guide pre-render (#223).
 *
 * This module is NEVER loaded by the browser: nothing in `index.html` leads to
 * it, so Vite puts it in no client bundle. It exists only for `prerender.mjs`,
 * which runs after the build.
 *
 * It deliberately holds no content of its own. Everything comes from the
 * component, which itself derives everything from the relationship matrix: the
 * static page is a projection of the app, never a copy that could drift.
 */

import { renderToString, renderToStaticMarkup } from 'react-dom/server'
import AttackGuide from './components/AttackGuide'
import DataPage from './components/DataPage'
import F3Guide from './components/F3Guide'
import StixGuide from './components/StixGuide'

/**
 * `renderToString` and not `renderToStaticMarkup`: the page is then hydrated by
 * `guide-entry.tsx`. Static markup saves a few comment markers, but those are
 * exactly the ones that let React graft its tree back onto the existing HTML.
 */
export function renderGuide(): string {
  return renderToString(<StixGuide mode="static" />)
}

/**
 * `renderToStaticMarkup` here, unlike the guide: this page is never hydrated,
 * so React's markers would only have added weight for nothing.
 */
export function renderAbout(): string {
  return renderToStaticMarkup(<DataPage />)
}

/**
 * The framework pages, static like "Your data" and for the same reason: they
 * are prose with nothing to bring to life, so they ship no script and need no
 * hydration markers.
 */
export function renderAttack(): string {
  return renderToStaticMarkup(<AttackGuide mode="static" />)
}

export function renderF3(): string {
  return renderToStaticMarkup(<F3Guide mode="static" />)
}
