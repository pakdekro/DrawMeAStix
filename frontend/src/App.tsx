import { Suspense, lazy, useEffect, useState } from 'react'
import InvestigationList from './components/InvestigationList'
import SmallScreenNotice from './components/SmallScreenNotice'
import Workspace from './components/Workspace'
import { SMALL_SCREEN_QUERY, hasOptedIn, rememberOptIn } from './smallScreen'

/**
 * The guide is fetched when it is asked for.
 *
 * Imported statically it was 235 KB of the 599 KB of JavaScript every first
 * visit downloaded, because Vite emits a `modulepreload` for it: two fifths of
 * the initial payload, for a page most people never open from the list. Its
 * pre-rendered twin at /guide is unaffected, it is built from its own entry
 * point and ships as plain HTML.
 */
const StixGuide = lazy(() => import('./components/StixGuide'))

/** Tiny hash router: #/ (list), #/guide (STIX help) or #/inv/<id>. */
function parseHash(): { view: 'home' | 'guide' } | { view: 'workspace'; id: string } {
  const match = window.location.hash.match(/^#\/inv\/(.+)$/)
  if (match) return { view: 'workspace', id: match[1] }
  if (window.location.hash === '#/guide') return { view: 'guide' }
  return { view: 'home' }
}

export default function App() {
  const [route, setRoute] = useState(parseHash)
  const [small, setSmall] = useState(() => window.matchMedia(SMALL_SCREEN_QUERY).matches)
  const [optedIn, setOptedIn] = useState(() => hasOptedIn(window.localStorage))

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Live tracking: rotating a phone, or widening a window, must change the
  // screen without a reload.
  useEffect(() => {
    const mq = window.matchMedia(SMALL_SCREEN_QUERY)
    const onChange = () => setSmall(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // The guide comes BEFORE the small-screen guard: it is prose, and prose
  // reads perfectly well on a phone. Handing a "come back on a desktop" card
  // to someone who came to read what an observable is would be absurd.
  if (route.view === 'guide') {
    return (
      <Suspense fallback={<p className="hint guide-loading">Loading the guide...</p>}>
        <StixGuide />
      </Suspense>
    )
  }

  if (small && !optedIn) {
    return (
      <SmallScreenNotice
        onOpenAnyway={() => {
          rememberOptIn(window.localStorage)
          setOptedIn(true)
        }}
      />
    )
  }

  if (route.view === 'workspace') {
    return <Workspace investigationId={route.id} key={route.id} />
  }
  return <InvestigationList />
}
