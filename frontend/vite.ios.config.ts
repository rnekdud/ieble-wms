import { defineConfig, mergeConfig } from 'vite'
import webConfig from './vite.config.ts'

// Separate output and entry: web and Android builds keep their existing behavior.
export default mergeConfig(webConfig, defineConfig({
  build: { outDir: 'dist-ios' },
  plugins: [{
    name: 'wms-ios-entry',
    transformIndexHtml: {
      order: 'pre',
      handler(html) { return html.replace('/src/main.tsx', '/src/ios-entry.ts') },
    },
  }],
}))
