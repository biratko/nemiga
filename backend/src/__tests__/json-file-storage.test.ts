import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JsonFileStorage } from '../storage/JsonFileStorage.js'

describe('JsonFileStorage', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nemiga-storage-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('saves and loads data using custom configDir', async () => {
    const storage = new JsonFileStorage({ configDir: tmpDir })
    await storage.save('workspace', { foo: 'bar' })
    const loaded = await storage.load<{ foo: string }>('workspace')
    expect(loaded).toEqual({ foo: 'bar' })
  })

  it('returns null when key has no saved data', async () => {
    const storage = new JsonFileStorage({ configDir: tmpDir })
    const loaded = await storage.load('workspace')
    expect(loaded).toBeNull()
  })

  it('writes file atomically via .tmp + rename', async () => {
    const { readdir } = await import('node:fs/promises')
    const storage = new JsonFileStorage({ configDir: tmpDir })
    await storage.save('workspace', { x: 1 })
    const files = await readdir(tmpDir)
    expect(files).toContain('workspace.json')
    expect(files.find(f => f.endsWith('.tmp'))).toBeUndefined()
  })

  it('rejects invalid keys', async () => {
    const storage = new JsonFileStorage({ configDir: tmpDir })
    await expect(storage.save('../etc/passwd', {})).rejects.toThrow(/Invalid storage key/)
  })
})
