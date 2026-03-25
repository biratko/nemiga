import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/ws/operations': {
        target: 'http://127.0.0.1:8080',
        ws: true,
      },
      '/ws/notify': {
        target: 'http://127.0.0.1:8080',
        ws: true,
      },
    },
  },
})
