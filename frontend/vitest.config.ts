import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    includeTaskLocation: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.ts'],
    // reporter will be added in Task 8
  },
})
