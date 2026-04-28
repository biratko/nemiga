#!/usr/bin/env node
import { readFile, writeFile, glob } from 'node:fs/promises'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const REQUIREMENTS_GLOB = join(PROJECT_ROOT, 'docs/requirements/*.md')
const COVERAGE_DIR = join(PROJECT_ROOT, 'tests/.coverage')
const ALLOWLIST_PATH = join(PROJECT_ROOT, 'tests/uncovered-allowlist.txt')

const ID_RE = /\[([A-Z]+-\d{3}(?:-\d{2})?)\]/g

/**
 * Сканирует .md файлы требований, извлекает все ID.
 * @param {string[]} files - абсолютные пути к .md файлам.
 * @returns {Promise<{ids: {id, file, line}[], errors: string[]}>}
 */
export async function scanRequirements(files) {
  const ids = []
  const errors = []
  const seen = new Map() // id -> { file, line }

  for (const file of files) {
    const content = await readFile(file, 'utf-8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const matches = lines[i].matchAll(ID_RE)
      for (const m of matches) {
        const id = m[1]
        const entry = { id, file, line: i + 1 }
        if (seen.has(id)) {
          const prev = seen.get(id)
          errors.push(
            `Duplicate ID ${id}: ${file}:${i + 1} (already seen at ${prev.file}:${prev.line})`
          )
          continue
        }
        seen.set(id, entry)
        ids.push(entry)
      }
    }
  }

  return { ids, errors }
}

/**
 * Загружает массив записей из нескольких JSON-файлов реестра.
 * Несуществующие файлы — игнор (тесты могли не запускаться).
 */
export async function loadRegistries(files) {
  const all = []
  for (const file of files) {
    let content
    try {
      content = await readFile(file, 'utf-8')
    } catch (err) {
      if (err.code === 'ENOENT') continue
      throw err
    }
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) {
      throw new Error(`Registry must be array: ${file}`)
    }
    all.push(...parsed)
  }
  return all
}

/**
 * Читает allowlist-файл — построчно, ID до # (комментарий), пустые строки игнор.
 */
export async function loadAllowlist(path) {
  let content
  try {
    content = await readFile(path, 'utf-8')
  } catch (err) {
    if (err.code === 'ENOENT') return new Set()
    throw err
  }
  const ids = new Set()
  for (const raw of content.split('\n')) {
    const line = raw.split('#')[0].trim()
    if (!line) continue
    ids.add(line)
  }
  return ids
}

/**
 * Сравнивает требования, реестр, allowlist и возвращает классификацию.
 */
export function computeStatus({ requirements, entries, allowlist }) {
  const reqIds = new Set(requirements.map(r => r.id))
  const passedIds = new Set()
  const phantom = new Set()

  for (const entry of entries) {
    if (entry.status !== 'passed') continue
    for (const id of entry.ids) {
      if (!reqIds.has(id)) {
        phantom.add(id)
        continue
      }
      passedIds.add(id)
    }
  }

  const covered = new Set()
  const uncovered = new Set()
  const allowlistedUncovered = new Set()
  const allowlistedAlreadyCovered = new Set()

  for (const id of reqIds) {
    if (passedIds.has(id)) {
      covered.add(id)
      if (allowlist.has(id)) allowlistedAlreadyCovered.add(id)
    } else if (allowlist.has(id)) {
      allowlistedUncovered.add(id)
    } else {
      uncovered.add(id)
    }
  }

  return { covered, uncovered, phantom, allowlistedUncovered, allowlistedAlreadyCovered }
}

function domainOf(id) {
  return id.split('-')[0]
}

/**
 * Возвращает Map<id, entry[]> — какие тесты покрывают каждый ID (только passed).
 */
function buildCoverageIndex(entries) {
  const idx = new Map()
  for (const entry of entries) {
    if (entry.status !== 'passed') continue
    for (const id of entry.ids) {
      if (!idx.has(id)) idx.set(id, [])
      idx.get(id).push(entry)
    }
  }
  return idx
}

export function renderReport({ requirements, entries, status, generatedAt }) {
  const idx = buildCoverageIndex(entries)
  const total = requirements.length
  const lines = []

  lines.push('# Test Coverage Report')
  lines.push('')
  lines.push(`Generated: ${generatedAt}`)
  lines.push(
    `Requirements: ${total} total, ${status.covered.size} covered ` +
    `(${total === 0 ? '100.0' : ((status.covered.size / total) * 100).toFixed(1)}%), ` +
    `${status.allowlistedUncovered.size} in allowlist, ` +
    `${status.uncovered.size} uncovered.`
  )
  lines.push('')

  const byDomain = new Map()
  for (const r of requirements) {
    const d = domainOf(r.id)
    if (!byDomain.has(d)) byDomain.set(d, [])
    byDomain.get(d).push(r)
  }

  lines.push('## By domain')
  lines.push('')
  lines.push('| Domain | Total | Covered | % |')
  lines.push('|--------|------:|--------:|--:|')
  for (const [d, list] of [...byDomain.entries()].sort()) {
    const covered = list.filter(r => status.covered.has(r.id)).length
    const pct = list.length === 0 ? '100.0' : ((covered / list.length) * 100).toFixed(1)
    lines.push(`| ${d} | ${list.length} | ${covered} | ${pct}% |`)
  }
  lines.push('')

  for (const [d, list] of [...byDomain.entries()].sort()) {
    lines.push(`## ${d}`)
    lines.push('')
    for (const r of list) {
      const checked = status.covered.has(r.id)
      const box = checked ? '[x]' : '[ ]'
      const tests = idx.get(r.id) || []
      const suffix = checked
        ? `\n      ${tests.map(t => `_${relativeFile(t.file)}:${t.line}_ (${t.source})`).join(', ')}`
        : status.allowlistedUncovered.has(r.id)
          ? ' — *in allowlist*'
          : ''
      lines.push(`- ${box} **${r.id}**${suffix}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function computeUpdatedAllowlist(content, covered) {
  const out = []
  for (const line of content.split('\n')) {
    const stripped = line.split('#')[0].trim()
    if (!stripped) {
      out.push(line)
      continue
    }
    if (covered.has(stripped)) {
      // skip line
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

function relativeFile(file) {
  // make absolute file paths a bit shorter for the report
  const cwd = PROJECT_ROOT
  return file.startsWith(cwd) ? file.slice(cwd.length + 1) : file
}

async function listRequirementFiles() {
  const files = []
  for await (const f of glob(REQUIREMENTS_GLOB)) {
    // exclude index.md and RETIRED.md from coverage scan
    if (f.endsWith('index.md') || f.endsWith('RETIRED.md')) continue
    files.push(f)
  }
  return files.sort()
}

async function listRegistryFiles() {
  return [
    join(COVERAGE_DIR, 'vitest-backend-registry.json'),
    join(COVERAGE_DIR, 'vitest-frontend-registry.json'),
    join(COVERAGE_DIR, 'playwright-registry.json'),
  ]
}

async function runCheck() {
  const reqFiles = await listRequirementFiles()
  const reqs = await scanRequirements(reqFiles)
  if (reqs.errors.length) {
    console.error('Requirements errors:')
    for (const e of reqs.errors) console.error(`  ${e}`)
    return 1
  }

  const entries = await loadRegistries(await listRegistryFiles())
  const allowlist = await loadAllowlist(ALLOWLIST_PATH)

  const reqIdSet = new Set(reqs.ids.map(r => r.id))
  const allowlistedNotInRequirements = [...allowlist].filter(id => !reqIdSet.has(id))
  if (allowlistedNotInRequirements.length) {
    console.error('Allowlist references unknown IDs (not in requirements):')
    for (const id of allowlistedNotInRequirements.sort()) console.error(`  ${id}`)
    return 1
  }

  const status = computeStatus({ requirements: reqs.ids, entries, allowlist })

  let failed = false
  if (status.phantom.size) {
    console.error('Phantom IDs (in tests but not in requirements):')
    for (const id of [...status.phantom].sort()) console.error(`  ${id}`)
    failed = true
  }
  if (status.allowlistedAlreadyCovered.size) {
    console.error('Allowlisted IDs that are already covered (remove from allowlist):')
    for (const id of [...status.allowlistedAlreadyCovered].sort()) console.error(`  ${id}`)
    failed = true
  }
  if (status.uncovered.size) {
    console.error('Uncovered IDs (not in allowlist):')
    for (const id of [...status.uncovered].sort()) console.error(`  ${id}`)
    failed = true
  }

  const total = reqs.ids.length
  const covered = status.covered.size
  const pct = total === 0 ? '100.0' : ((covered / total) * 100).toFixed(1)
  console.log(`Coverage: ${covered}/${total} (${pct}%), allowlist: ${status.allowlistedUncovered.size}`)

  return failed ? 1 : 0
}

async function runReport() {
  const reqFiles = await listRequirementFiles()
  const reqs = await scanRequirements(reqFiles)
  const entries = await loadRegistries(await listRegistryFiles())
  const allowlist = await loadAllowlist(ALLOWLIST_PATH)
  const status = computeStatus({ requirements: reqs.ids, entries, allowlist })
  const md = renderReport({
    requirements: reqs.ids,
    entries,
    status,
    generatedAt: new Date().toISOString(),
  })
  const reportPath = join(PROJECT_ROOT, 'docs/test-coverage.md')
  await writeFile(reportPath, md, 'utf-8')
  console.log(`Report written: ${reportPath}`)
  return 0
}

async function runUpdateAllowlist() {
  const reqFiles = await listRequirementFiles()
  const reqs = await scanRequirements(reqFiles)
  const entries = await loadRegistries(await listRegistryFiles())
  const allowlist = await loadAllowlist(ALLOWLIST_PATH)
  const status = computeStatus({ requirements: reqs.ids, entries, allowlist })

  let original
  try {
    original = await readFile(ALLOWLIST_PATH, 'utf-8')
  } catch (err) {
    if (err.code === 'ENOENT') original = ''
    else throw err
  }
  const updated = computeUpdatedAllowlist(original, status.covered)
  await writeFile(ALLOWLIST_PATH, updated, 'utf-8')
  console.log(`Allowlist updated: removed ${status.allowlistedAlreadyCovered.size} now-covered IDs`)
  return 0
}

async function main() {
  const arg = process.argv[2]
  if (arg === '--check') process.exit(await runCheck())
  if (arg === '--report') process.exit(await runReport())
  if (arg === '--update-allowlist') process.exit(await runUpdateAllowlist())
  console.error('Usage: coverage.mjs --check|--report|--update-allowlist')
  process.exit(2)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err); process.exit(2) })
}
