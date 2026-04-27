import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

// Vitest 4 renamed the runner types: `File` -> `RunnerTestFile`, `Task` -> `RunnerTask`.
// The `Reporter` interface now exposes `onTestRunEnd(testModules, errors, reason)` with
// `TestModule` / `TestCase` reported objects (from the `vitest/node` namespace) instead of
// the legacy raw runner tasks. We rely on the runtime shape (`children`, `allTests()`,
// `name`, `result()`, `options.mode`, `location`, `moduleId`) and use `any` for the
// parameter types to stay resilient against minor API drift in 4.x.

const PROJECT_ROOT = resolve(import.meta.dirname, '../../../..')
const OUTPUT_FILE = resolve(PROJECT_ROOT, 'tests/.coverage/vitest-backend-registry.json')
const ID_TAG_RE = /^\[([A-Z]+-\d{3}(?:-\d{2})?(?:,[A-Z]+-\d{3}(?:-\d{2})?)*)\]\s+(.*)$/

interface Entry {
  ids: string[]
  name: string
  file: string
  line: number
  status: 'passed' | 'failed' | 'todo' | 'skipped'
  source: string
}

const SOURCE = 'vitest-backend'

function statusOf(testCase: any): Entry['status'] {
  const mode = testCase?.options?.mode
  if (mode === 'todo') return 'todo'
  if (mode === 'skip') return 'skipped'
  let result: any
  try {
    result = typeof testCase?.result === 'function' ? testCase.result() : undefined
  } catch {
    result = undefined
  }
  const state = result?.state
  if (state === 'passed') return 'passed'
  if (state === 'failed') return 'failed'
  if (state === 'skipped') return 'skipped'
  if (state === 'pending') return 'failed' // aborted/incomplete run; conservative
  // unknown state - treat as failed rather than silently skipped
  return 'failed'
}

function* walkAllTests(testModule: any): Generator<any> {
  // Prefer the ergonomic API when available.
  const children = testModule?.children
  if (children && typeof children.allTests === 'function') {
    for (const tc of children.allTests()) {
      yield tc
    }
    return
  }
  // Fallback duck-typed walk over a tree of items with `type` / `tasks` / `children`.
  const queue: any[] = []
  if (children && typeof children[Symbol.iterator] === 'function') {
    queue.push(...Array.from(children))
  } else if (Array.isArray(testModule?.tasks)) {
    queue.push(...testModule.tasks)
  }
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) continue
    if (node.type === 'test') {
      yield node
      continue
    }
    const subChildren = node.children
    if (subChildren && typeof subChildren[Symbol.iterator] === 'function') {
      queue.push(...Array.from(subChildren))
    } else if (Array.isArray(node.tasks)) {
      queue.push(...node.tasks)
    }
  }
}

function moduleFile(testModule: any): string {
  return testModule?.moduleId ?? testModule?.filepath ?? ''
}

function lineOf(testCase: any): number {
  const loc = testCase?.location
  if (loc && typeof loc.line === 'number') return loc.line
  return 0
}

function nameOf(testCase: any): string {
  return testCase?.name ?? ''
}

export default class CoverageReporter {
  private entries: Entry[] = []

  // Vitest 4 reporter hook. Signature kept loose for forward compatibility.
  onTestRunEnd(testModules: ReadonlyArray<any> = []): void | Promise<void> {
    this.entries = []
    for (const testModule of testModules) {
      const file = moduleFile(testModule)
      for (const testCase of walkAllTests(testModule)) {
        const taskName = nameOf(testCase)
        const m = ID_TAG_RE.exec(taskName)
        if (!m) continue
        const ids = m[1].split(',')
        const name = m[2]
        this.entries.push({
          ids,
          name,
          file,
          line: lineOf(testCase),
          status: statusOf(testCase),
          source: SOURCE,
        })
      }
    }
    return this.flush()
  }

  private async flush(): Promise<void> {
    await mkdir(dirname(OUTPUT_FILE), { recursive: true })
    await writeFile(OUTPUT_FILE, JSON.stringify(this.entries, null, 2), 'utf-8')
  }
}
