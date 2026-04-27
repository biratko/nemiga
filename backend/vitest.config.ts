import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import CoverageReporter from './src/__tests__/helpers/coverage-reporter.ts'

export default defineConfig({
  test: {
    root: resolve(__dirname, 'src'),
    testTimeout: 30_000,
    hookTimeout: 30_000,
    includeTaskLocation: true,
    reporters: ['default', new CoverageReporter()],
  },
})
