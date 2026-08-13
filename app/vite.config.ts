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
        // Simple API's preload preset correctly builds this as CJS with the
        // right extension even when package.json has "type": "module" —
        // the flat API used previously does not apply this preset, which is
        // why the preload script was emitted as ESM and failed to load in
        // Electron's sandboxed preload context ("Cannot use import
        // statement outside a module").
        input: 'electron/preload.ts',
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
