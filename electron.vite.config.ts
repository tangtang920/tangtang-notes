import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } }
  },
  renderer: {
    build: { minify: true },
    server: { host: '127.0.0.1' },
    plugins: [react(), {
      name: 'development-csp',
      apply: 'serve',
      // Vite injects refresh scripts/styles only during development.
      transformIndexHtml: html => html.replace(/content="default-src[^\"]*"/,
        'content="default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; connect-src \'self\' ws://127.0.0.1:*; object-src \'none\'; base-uri \'none\'; form-action \'none\'"')
    }]
  }
})
