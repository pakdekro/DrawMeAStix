import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The version comes from package.json, never copied by hand: a displayed
// version that lies about what is running is worse than no version at all,
// and it is the first thing we ask of anyone reporting a defect.
const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }

// Local-first: no backend, hence no proxy - `npm run dev` is enough.
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    rollupOptions: {
      // One entry point per page, one bundle each (#223, #225). The prose
      // pages have no use for the canvas, for storage or for the PDF readers:
      // their own entry saves them from dragging the whole application along
      // to show text. `prerender.mjs` then takes dist/guide.html and
      // dist/about.html and turns them into <route>/index.html, content included.
      input: {
        main: 'index.html',
        guide: 'guide.html',
        about: 'about.html',
        attack: 'attack.html',
        f3: 'f3.html',
      },
    },
  },
})
