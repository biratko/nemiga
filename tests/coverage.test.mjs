import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanRequirements } from './coverage.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIX = join(__dirname, 'fixtures')

test('scanRequirements: returns IDs with file and line', async () => {
  const result = await scanRequirements([join(FIX, 'requirements-valid.md')])
  assert.equal(result.errors.length, 0)
  const ids = result.ids.map(r => r.id)
  assert.deepEqual(ids.sort(), ['TEST-001', 'TEST-001-01', 'TEST-001-02', 'TEST-002'])
  const sub01 = result.ids.find(r => r.id === 'TEST-001-01')
  assert.match(sub01.file, /requirements-valid\.md$/)
  assert.equal(sub01.line, 6)
})

test('scanRequirements: reports duplicate IDs as errors', async () => {
  const result = await scanRequirements([join(FIX, 'requirements-duplicate.md')])
  assert.ok(result.errors.length >= 1)
  assert.match(result.errors[0], /TEST-001.*duplicate/i)
})

test('scanRequirements: ignores invalid format (lowercase) but warns', async () => {
  const result = await scanRequirements([join(FIX, 'requirements-invalid-format.md')])
  assert.equal(result.ids.length, 0)
})
