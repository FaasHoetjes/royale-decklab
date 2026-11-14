import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The head scripts in public/ keep their plain names; a content hash in the query lets the server cache them for good.
function versionPublicScripts(): Plugin {
  return {
    name: 'version-public-scripts',
    transformIndexHtml: (html) =>
      html.replace(/src="\/([\w-]+\.js)"/g, (_, file: string) => {
        const hash = createHash('sha256').update(readFileSync(new URL(`./public/${file}`, import.meta.url))).digest('hex').slice(0, 10)
        return `src="/${file}?v=${hash}"`
      }),
  }
}

export default defineConfig({
  plugins: [react(), versionPublicScripts()],
  build: {
    rolldownOptions: {
      output: {
        // The framework changes far less often than the app, so deploys leave returning visitors' copy of it cached.
        advancedChunks: {
          groups: [{ name: 'vendor', test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@tanstack)[\\/]/ }],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
      '/img': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    }
  }
})
