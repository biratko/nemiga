import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Reporter, FullResult, TestCase, TestResult } from '@playwright/test/reporter'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '../..')
const OUTPUT_FILE = resolve(PROJECT_ROOT, 'tests/.coverage/playwright-registry.json')
const SOURCE = 'playwright'
const ID_TAG_RE = /^\[([A-Z]+-\d{3}(?:-\d{2})?(?:,[A-Z]+-\d{3}(?:-\d{2})?)*)\]\s+(.*)$/

interface Entry {
  ids: string[]
  name: string
  file: string
  line: number
  status: 'passed' | 'failed' | 'todo' | 'skipped'
  source: string
}

export default class PlaywrightCoverageReporter implements Reporter {
  private entries: Entry[] = []

  onTestEnd(test: TestCase, result: TestResult): void {
    const m = ID_TAG_RE.exec(test.title)
    if (!m) return
    const ids = m[1].split(',')
    const name = m[2]

    let status: Entry['status']
    if (result.status === 'passed') status = 'passed'
    else if (result.status === 'failed' || result.status === 'timedOut' || result.status === 'interrupted') status = 'failed'
    else if (test.expectedStatus === 'skipped' && result.status === 'skipped') status = 'todo'
    else status = 'skipped'

    this.entries.push({
      ids,
      name,
      file: test.location.file,
      line: test.location.line,
      status,
      source: SOURCE,
    })
  }

  async onEnd(_result: FullResult): Promise<void> {
    await mkdir(dirname(OUTPUT_FILE), { recursive: true })
    await writeFile(OUTPUT_FILE, JSON.stringify(this.entries, null, 2), 'utf-8')
  }
}
