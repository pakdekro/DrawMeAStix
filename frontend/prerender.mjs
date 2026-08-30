/**
 * Pre-render of the text pages, run after `vite build` (#223, #225).
 *
 * Four pages of the project are prose rather than tool: the STIX guide, "Your
 * data" and the two frameworks. Serving them as full HTML makes them readable without
 * JavaScript, indexable, and shareable by link to someone who does not know
 * the tool yet. The canvas stays a SPA - a graph does not get indexed.
 *
 * This file does nothing but fill in the `#root` of the pages Vite has just
 * produced: neither the bundle names nor the stylesheet ones are written
 * here, so a change of hash cannot leave a page bare. The guide's hydration
 * script, when there is one, is placed by Vite.
 *
 * Rendering goes through Vite's SSR API rather than a second `vite build
 * --ssr`: no extra configuration, no intermediate output directory to clean
 * up, and the TSX is transformed with exactly the same chain as the client
 * build.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = dirname(fileURLToPath(import.meta.url))
const dist = join(root, 'dist')
const ROOT = '<div id="root"></div>'

/** Each page: the file Vite produces, its destination, its renderer. */
const PAGES = [
  { built: 'guide.html', route: 'guide', render: 'renderGuide', min: 5000 },
  { built: 'about.html', route: 'about', render: 'renderAbout', min: 4000 },
  { built: 'attack.html', route: 'attack', render: 'renderAttack', min: 4000 },
  { built: 'f3.html', route: 'f3', render: 'renderF3', min: 4000 },
]

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'warn',
  // Dependency discovery off. Opening a server starts the client dependency
  // scanner in the background; we close the server as soon as the module is
  // loaded, and esbuild then threw "The server is being restarted or closed"
  // across dozens of red lines. The build still succeeded, but it read as
  // broken, which is a poor first contact with the repository. Nothing here
  // serves a client: this server exists to transform one TSX and then die.
  optimizeDeps: { noDiscovery: true, include: [] },
})
let module
try {
  module = await vite.ssrLoadModule('/src/prerender.tsx')
} finally {
  await vite.close()
}

for (const { built, route, render, min } of PAGES) {
  const source = join(dist, built)
  const shell = readFileSync(source, 'utf8')
  if (!shell.includes(ROOT)) {
    throw new Error(`prerender: no empty #root in dist/${built}, the content would have nowhere to go`)
  }

  const body = module[render]()
  if (body.length < min) {
    throw new Error(
      `prerender: suspicious render for /${route} (${body.length} bytes, below the ${min} floor)`,
    )
  }

  // dist/<route>/index.html rather than dist/<route>.html: nginx then serves
  // the page through its `try_files`, with no special rule. The original is
  // removed so the same page is not left reachable at two addresses.
  const page = shell.replace(ROOT, `<div id="root">${body}</div>`)
  mkdirSync(join(dist, route), { recursive: true })
  writeFileSync(join(dist, route, 'index.html'), page)
  rmSync(source)
  console.log(`prerender: dist/${route}/index.html (${Math.round(page.length / 1024)} Ko)`)
}
