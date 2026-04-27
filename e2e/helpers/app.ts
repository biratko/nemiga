import { test as base } from '@playwright/test'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const E2E_ROOT = resolve(__dirname, '../.tmp/run')

export interface AppFixture {
  testRoot: string
}

export const test = base.extend<{ app: AppFixture }>({
  app: async ({}, use) => {
    const testRoot = resolve(E2E_ROOT, 'fixtures', randomUUID())
    await mkdir(testRoot, { recursive: true })
    await use({ testRoot })
    await rm(testRoot, { recursive: true, force: true })
  },
})

export { expect } from '@playwright/test'
