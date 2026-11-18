import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        // Keep engine modules cacheable across WMS UI releases. All remain behind the 3D lazy import.
        codeSplitting: { groups: [
          { name: 'three-core', test: /node_modules\/three\/build\/three\.core\.js$/ },
          { name: 'three-renderer', test: /node_modules\/three\/build\/three\.module\.js$/ },
          { name: 'three-controls', test: /node_modules\/three\/examples\/jsm\/controls\/OrbitControls\.js$/ },
        ] },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5080',
        changeOrigin: true,
      },
    },
  },
})
