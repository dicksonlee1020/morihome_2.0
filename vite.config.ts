import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset URLs: the preview is served under a path prefix (claude.ai
  // artifact host), where absolute /assets/... resolve to nothing and the page
  // stays blank. Keeping it here so `npm run build` can never regress it.
  base: './',
  build: {
    // Older Android WebViews / iOS 15 Safari still parse the output.
    target: ['es2020', 'chrome90', 'safari15'],
    // SINGLE=1 (scripts/build-single.mjs): one JS chunk, so the downloadable
    // HTML needs no sibling files (SheetJS is inlined instead of lazy-loaded).
    ...(process.env.SINGLE ? { outDir: 'dist-single', rolldownOptions: { output: { codeSplitting: false } } } : {}),
  },
})
