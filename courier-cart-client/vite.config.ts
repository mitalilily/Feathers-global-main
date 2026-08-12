import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: 'index.html',
        shopifyApp: 'shopify-app.html',
      },
    },
  },
})
