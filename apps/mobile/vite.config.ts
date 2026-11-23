import react from '@vitejs/plugin-react'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/**
 * Copies the prebuilt rhwp-studio bundle from apps/hwp/public/studio into
 * dist/studio so mobile WebView loads the HWP editor locally without network.
 */
function copyHwpStudioPlugin(): Plugin {
  const studioSrc = resolve(__dirname, '../hwp/public/studio')
  const studioDest = resolve(__dirname, 'dist/studio')
  return {
    name: 'copy-hwp-studio',
    closeBundle() {
      if (!existsSync(studioSrc)) return
      mkdirSync(studioDest, { recursive: true })
      cpSync(studioSrc, studioDest, { recursive: true })
    },
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react(), copyHwpStudioPlugin()],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5185,
    strictPort: true,
  },
})
