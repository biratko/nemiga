import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    root: resolve(__dirname, 'src'),
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
