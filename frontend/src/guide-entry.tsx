/**
 * Hydration of the /guide page (#223).
 *
 * A separate entry point from `main.tsx`, and that is the whole point: the
 * guide loads neither the canvas, nor the storage, nor the document
 * converters. It ships only React and what the guide really uses.
 *
 * `hydrateRoot` and not `createRoot`: the content is already in the page, we
 * do not replace it, we bring it to life. A `createRoot` would have wiped and
 * rebuilt the same HTML, flickering for nothing.
 */

import { hydrateRoot } from 'react-dom/client'
import StixGuide from './components/StixGuide'
import './index.css'

hydrateRoot(document.getElementById('root') as HTMLElement, <StixGuide mode="static" />)
