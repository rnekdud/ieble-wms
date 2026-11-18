import { defineConfig, mergeConfig } from 'vite'
import webConfig from './vite.config.ts'

// Package the same React app, with native initialization only in Android builds.
export default mergeConfig(webConfig, defineConfig({
  plugins: [{
    name: 'wms-android-entry',
    transformIndexHtml: {
      order: 'pre',
      handler(html) { return html.replace('/src/main.tsx', '/src/android-entry.ts') },
    },
  }],
}))
