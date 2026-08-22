import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'
import { notBundle } from 'vite-plugin-electron/plugin'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          plugins: [notBundle()],
          build: {
            rollupOptions: {
              external: ['better-sqlite3', 'keytar', 'drizzle-orm'],
            },
          },
        },
      },
      preload: {
        // The Simple API's preload preset emits CJS syntax (require(...))
        // regardless of package.json's "type": "module", but with
        // package.json set to "module" it still names the output file
        // preload.mjs. Node/Electron always parses .mjs as an ES module
        // based on the extension alone, so a CJS-syntax file named .mjs
        // fails to evaluate in the sandboxed preload context — Electron
        // then never populates startupData.preloadScripts, which crashes
        // the sandbox bundle with "Cannot destructure property
        // 'preloadScripts' of 'binding.startupData' as it is null."
        // Forcing the output to .js with an explicit CJS format keeps the
        // extension and content in agreement.
        input: 'electron/preload.ts',
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: 'preload.js',
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
