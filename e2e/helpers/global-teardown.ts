import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const E2E_ROOT = resolve(__dirname, '../.tmp/run')

export default async function globalTeardown(): Promise<void> {
  await rm(E2E_ROOT, { recursive: true, force: true })
}
