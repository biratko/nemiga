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

import { loadRegistries, computeStatus } from './coverage.mjs'

test('loadRegistries: merges multiple JSON files', async () => {
  const result = await loadRegistries([join(FIX, 'registry-sample.json')])
  assert.equal(result.length, 4)
})

test('computeStatus: only "passed" tests count as covered', async () => {
  const reqs = await scanRequirements([join(FIX, 'requirements-valid.md')])
  const entries = await loadRegistries([join(FIX, 'registry-sample.json')])
  const status = computeStatus({ requirements: reqs.ids, entries, allowlist: new Set() })

  // TEST-001-01 covered (passed), TEST-002 covered (passed)
  // TEST-001-02 NOT covered (failed), TEST-001 NOT covered (todo)
  assert.deepEqual([...status.covered].sort(), ['TEST-001-01', 'TEST-002'])
  assert.deepEqual([...status.uncovered].sort(), ['TEST-001', 'TEST-001-02'])
})

test('computeStatus: phantom IDs (in registry but not in requirements) are reported', async () => {
  const reqs = { ids: [{ id: 'TEST-002', file: 'x', line: 1 }] }
  const entries = [
    { ids: ['NOPE-001'], status: 'passed', name: 'x', file: 'y', line: 1, source: 'vitest-backend' }
  ]
  const status = computeStatus({ requirements: reqs.ids, entries, allowlist: new Set() })
  assert.deepEqual([...status.phantom], ['NOPE-001'])
})

test('computeStatus: allowlist masks uncovered IDs', async () => {
  const reqs = { ids: [
    { id: 'TEST-001', file: 'x', line: 1 },
    { id: 'TEST-001-01', file: 'x', line: 2 },
  ] }
  const entries = [
    { ids: ['TEST-001-01'], status: 'passed', name: 'x', file: 'y', line: 1, source: 'vitest-backend' }
  ]
  const status = computeStatus({
    requirements: reqs.ids,
    entries,
    allowlist: new Set(['TEST-001'])
  })
  assert.deepEqual([...status.uncovered].sort(), [])
  assert.deepEqual([...status.allowlistedUncovered].sort(), ['TEST-001'])
  assert.deepEqual([...status.allowlistedAlreadyCovered].sort(), [])
})

test('computeStatus: ID covered AND in allowlist → allowlistedAlreadyCovered (must be removed)', async () => {
  const reqs = { ids: [{ id: 'TEST-001-01', file: 'x', line: 1 }] }
  const entries = [
    { ids: ['TEST-001-01'], status: 'passed', name: 'x', file: 'y', line: 1, source: 'vitest-backend' }
  ]
  const status = computeStatus({
    requirements: reqs.ids,
    entries,
    allowlist: new Set(['TEST-001-01'])
  })
  assert.deepEqual([...status.allowlistedAlreadyCovered], ['TEST-001-01'])
})
