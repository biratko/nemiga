import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanRequirements, loadAllowlist } from './coverage.mjs'

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

import { renderReport } from './coverage.mjs'

test('renderReport: produces markdown with totals and per-domain sections', () => {
  const reqs = [
    { id: 'NAV-001', file: '/r/navigation.md', line: 5 },
    { id: 'NAV-001-01', file: '/r/navigation.md', line: 6 },
    { id: 'FILE-001', file: '/r/file-operations.md', line: 3 },
  ]
  const entries = [
    {
      ids: ['NAV-001'], status: 'passed', name: 'splitter exists',
      file: '/e2e/splitter.spec.ts', line: 14, source: 'playwright'
    }
  ]
  const status = {
    covered: new Set(['NAV-001']),
    uncovered: new Set(['FILE-001']),
    phantom: new Set(),
    allowlistedUncovered: new Set(['NAV-001-01']),
    allowlistedAlreadyCovered: new Set(),
  }

  const md = renderReport({ requirements: reqs, entries, status, generatedAt: '2026-04-25T10:00:00Z' })

  assert.match(md, /Generated: 2026-04-25T10:00:00Z/)
  assert.match(md, /Requirements: 3 total, 1 covered/)
  assert.match(md, /## NAV/)
  assert.match(md, /## FILE/)
  assert.match(md, /\[x\] \*\*NAV-001\*\*/)
  assert.match(md, /splitter\.spec\.ts:14/)
  assert.match(md, /\[ \] \*\*NAV-001-01\*\*.*allowlist/)
  assert.match(md, /\[ \] \*\*FILE-001\*\*/)
})

import { computeUpdatedAllowlist } from './coverage.mjs'

test('computeUpdatedAllowlist: removes IDs that are now covered', () => {
  const original = `# Allowlist

NAV-001    # not implemented
NAV-002    # not implemented either
FILE-001   # placeholder
`
  const covered = new Set(['NAV-001', 'FILE-001'])
  const result = computeUpdatedAllowlist(original, covered)
  // NAV-001 and FILE-001 must be removed; NAV-002 stays.
  assert.match(result, /NAV-002/)
  assert.doesNotMatch(result, /^NAV-001\b/m)
  assert.doesNotMatch(result, /^FILE-001\b/m)
  // Header preserved
  assert.match(result, /^# Allowlist/)
})

test('computeUpdatedAllowlist: empty input produces empty', () => {
  const result = computeUpdatedAllowlist('', new Set())
  assert.equal(result.trim(), '')
})

test('computeUpdatedAllowlist: preserves comments-only lines', () => {
  const original = `# top comment
# more comment

NAV-001
`
  const result = computeUpdatedAllowlist(original, new Set(['NAV-001']))
  assert.match(result, /# top comment/)
  assert.match(result, /# more comment/)
  assert.doesNotMatch(result, /NAV-001/)
})

test('loadAllowlist + computeStatus: unknown allowlist IDs are surfaced via difference', async () => {
  const reqs = { ids: [{ id: 'NAV-001', file: 'x', line: 1 }] }
  const allowlist = new Set(['NAV-001', 'BOGUS-999'])
  const reqIdSet = new Set(reqs.ids.map(r => r.id))
  const unknown = [...allowlist].filter(id => !reqIdSet.has(id))
  assert.deepEqual(unknown, ['BOGUS-999'])
})

test('loadAllowlist: ignores comments and blank lines', async () => {
  const fixture = join(FIX, 'allowlist-mixed.txt')
  const { writeFile, unlink } = await import('node:fs/promises')
  await writeFile(fixture,
    `# header comment\n\nNAV-001\nFILE-002   # trailing comment\n\n# another\n`, 'utf-8')
  const set = await loadAllowlist(fixture)
  await unlink(fixture)
  assert.deepEqual([...set].sort(), ['FILE-002', 'NAV-001'])
})
