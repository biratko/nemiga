#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

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

// CLI заглушка — расширим в Task 3+
async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: coverage.mjs --check|--report|--update-allowlist')
    process.exit(2)
  }
  console.error(`Mode "${arg}" not yet implemented`)
  process.exit(2)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
