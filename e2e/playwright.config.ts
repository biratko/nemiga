import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const E2E_ROOT = resolve(__dirname, '.tmp/run')

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  globalSetup: './helpers/global-setup.ts',
  globalTeardown: './helpers/global-teardown.ts',
  webServer: {
    command: `cd ${PROJECT_ROOT} && make frontend && cd backend && PORT=8181 ALLOWED_ROOTS=${E2E_ROOT} WORKSPACE_DIR=${E2E_ROOT}/workspace npx tsx src/main.ts`,
    url: 'http://127.0.0.1:8181',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:8181',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  reporter: [
    ['list'],
    ['./helpers/coverage-reporter.ts'],
  ],
})
