/**
 * The frame the prose pages share: top bar, way back, title, sections.
 *
 * The STIX guide and "Your data" each carry their own copy of this chrome,
 * written before there was anything to share. The framework pages are the
 * third and fourth, which is where a fourth copy stops being cheaper than a
 * component. The two older pages are deliberately left alone: their static
 * HTML is compared byte for byte by their own tests, and moving them for
 * tidiness would be a change with no reader on the other end.
 */

import type { ReactNode } from 'react'
import Icon from './Icon'

/** Where the page is being read: inside the app, or as its own address. */
export type GuideMode = 'app' | 'static'

/**
 * An internal link, in the shape the current address understands.
 *
 * Served at /attack, an `#/guide` href would stay put instead of reaching the
 * application: it would read as a dead link, and nothing would report it. A
 * test forbids a hardcoded one.
 */
export function guideHref(mode: GuideMode, route: string): string {
  return mode === 'static' ? `/${route}` : `#/${route}`
}

export default function GuideShell({
  mode,
  title,
  tagline,
  children,
}: {
  mode: GuideMode
  title: string
  tagline: string
  children: ReactNode
}) {
  const home = mode === 'static' ? '/' : '#/'
  return (
    <>
      <div className="topbar">
        <a className="brand" href={home}>
          <img src="/logo.svg" alt="" />
          DRAW ME A STIX
        </a>
      </div>
      <div className="home guide">
        <a className="guide-back" href={home}>
          <Icon name="chevron-down" size={13} style={{ transform: 'rotate(90deg)' }} />
          {mode === 'static' ? 'Open the canvas' : 'Back to investigations'}
        </a>
        <h1>{title}</h1>
        <p className="tagline">{tagline}</p>
        {children}
      </div>
    </>
  )
}
