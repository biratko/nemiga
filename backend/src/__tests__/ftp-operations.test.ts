import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { startFtpServer, seedFiles, cleanDir, type FtpTestServer } from './helpers/ftp-server.js'
import { FtpSessionManager } from '../ftp/FtpSessionManager.js'
import type { FtpProvider } from '../ftp/FtpProvider.js'
import type { OperationContext, MoveContext, DeleteContext, CopyOptions } from '../providers/FileSystemProvider.js'

function makeOperationContext(): OperationContext {
  return {
    progress: { report: () => {} },
    confirm: { ask: async () => 'skip' },
    cancellation: { cancelled: false },
  }
}

function makeMoveContext(): MoveContext {
  return {
    progress: { report: () => {} },
    confirm: { ask: async () => 'skip' },
    cancellation: { cancelled: false },
  }
}

function makeDeleteContext(): DeleteContext {
  return {
    progress: { report: () => {} },
    cancellation: { cancelled: false },
  }
}

const defaultCopyOptions: CopyOptions = { followSymlinks: false }

describe('FTP Operations', () => {
  let ftpServer: FtpTestServer
  let manager: FtpSessionManager
  let provider: FtpProvider
  let sessionId: string

  beforeAll(async () => {
    ftpServer = await startFtpServer()
    manager = new FtpSessionManager({ sessionTimeoutMs: 60_000, reaperIntervalMs: 60_000 })
  })

  afterAll(async () => {
    await manager.cleanup()
    await ftpServer.stop()
  })

  beforeEach(async () => {
    await cleanDir(ftpServer.rootDir)
    await seedFiles(ftpServer.rootDir, {
      'file1.txt': 'content1',
      'file2.txt': 'content2',
      'subdir/nested.txt': 'nested content',
    })
    if (sessionId) {
      try { await manager.disconnect(sessionId) } catch {}
    }
    sessionId = await manager.connect({
      protocol: 'ftp',
      host: ftpServer.host,
      port: ftpServer.port,
      username: 'test',
      password: 'test',
    })
    provider = manager.get(sessionId)!
  })

  describe('list', () => {
    it('should list root directory and contain seeded files and subdir', async () => {
      const result = await provider.list(`ftp://${sessionId}@${ftpServer.host}/`)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const names = result.entries.map(e => e.name)
      expect(names).toContain('file1.txt')
      expect(names).toContain('file2.txt')
      expect(names).toContain('subdir')
    })

    it('should list subdirectory and contain nested file', async () => {
      const result = await provider.list(`ftp://${sessionId}@${ftpServer.host}/subdir`)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const names = result.entries.map(e => e.name)
      expect(names).toContain('nested.txt')
    })

    it('should return empty entries for an empty directory', async () => {
      await provider.mkdir(`ftp://${sessionId}@${ftpServer.host}/emptydir`)
      const result = await provider.list(`ftp://${sessionId}@${ftpServer.host}/emptydir`)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      // Empty dir may include '..' entry but no real files
      const realEntries = result.entries.filter(e => e.name !== '..')
      expect(realEntries).toHaveLength(0)
    })

    it('should return error result for nonexistent directory', async () => {
      const result = await provider.list(`ftp://${sessionId}@${ftpServer.host}/nonexistent`)
      expect(result.ok).toBe(false)
    })
  })

  describe('mkdir', () => {
    it('should create a new directory', async () => {
      const result = await provider.mkdir(`ftp://${sessionId}@${ftpServer.host}/newdir`)
      expect(result.ok).toBe(true)
      const listResult = await provider.list(`ftp://${sessionId}@${ftpServer.host}/`)
      if (!listResult.ok) throw new Error('list failed')
      const names = listResult.entries.map(e => e.name)
      expect(names).toContain('newdir')
    })

    it('should create nested directories', async () => {
      const mkA = await provider.mkdir(`ftp://${sessionId}@${ftpServer.host}/a`)
      expect(mkA.ok).toBe(true)
      const mkB = await provider.mkdir(`ftp://${sessionId}@${ftpServer.host}/a/b`)
      expect(mkB.ok).toBe(true)
      const mkC = await provider.mkdir(`ftp://${sessionId}@${ftpServer.host}/a/b/c`)
      expect(mkC.ok).toBe(true)

      const listResult = await provider.list(`ftp://${sessionId}@${ftpServer.host}/a/b`)
      if (!listResult.ok) throw new Error('list failed')
      const names = listResult.entries.map(e => e.name)
      expect(names).toContain('c')
    })

    it('should return ok or error when creating an already-existing directory', async () => {
      // First create succeeds
      const first = await provider.mkdir(`ftp://${sessionId}@${ftpServer.host}/existingdir`)
      expect(first.ok).toBe(true)
      // Second create: either ok or error, but must not throw
      const second = await provider.mkdir(`ftp://${sessionId}@${ftpServer.host}/existingdir`)
      expect(typeof second.ok).toBe('boolean')
    })
  })

  describe('rename', () => {
    it('should rename a file', async () => {
      const result = await provider.rename(
        `ftp://${sessionId}@${ftpServer.host}/file1.txt`,
        'renamed.txt',
      )
      expect(result.ok).toBe(true)
      const listResult = await provider.list(`ftp://${sessionId}@${ftpServer.host}/`)
      if (!listResult.ok) throw new Error('list failed')
      const names = listResult.entries.map(e => e.name)
      expect(names).toContain('renamed.txt')
      expect(names).not.toContain('file1.txt')
    })

    it('should rename a directory', async () => {
      const result = await provider.rename(
        `ftp://${sessionId}@${ftpServer.host}/subdir`,
        'renameddir',
      )
      expect(result.ok).toBe(true)
      const listResult = await provider.list(`ftp://${sessionId}@${ftpServer.host}/`)
      if (!listResult.ok) throw new Error('list failed')
      const names = listResult.entries.map(e => e.name)
      expect(names).toContain('renameddir')
      expect(names).not.toContain('subdir')
    })
  })

  describe('delete', () => {
    it('should delete a file', async () => {
      const result = await provider.delete(
        [`ftp://${sessionId}@${ftpServer.host}/file1.txt`],
        makeDeleteContext(),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.deleted).toBe(1)
      const listResult = await provider.list(`ftp://${sessionId}@${ftpServer.host}/`)
      if (!listResult.ok) throw new Error('list failed')
      const names = listResult.entries.map(e => e.name)
      expect(names).not.toContain('file1.txt')
    })

    it('should delete a directory recursively', async () => {
      const result = await provider.delete(
        [`ftp://${sessionId}@${ftpServer.host}/subdir`],
        makeDeleteContext(),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.deleted).toBe(1)
      const listResult = await provider.list(`ftp://${sessionId}@${ftpServer.host}/`)
      if (!listResult.ok) throw new Error('list failed')
      const names = listResult.entries.map(e => e.name)
      expect(names).not.toContain('subdir')
    })

    it('should not throw when deleting a nonexistent path', async () => {
      const result = await provider.delete(
        [`ftp://${sessionId}@${ftpServer.host}/nonexistent.txt`],
        makeDeleteContext(),
      )
      // delete() swallows errors internally — ok: true with deleted: 0
      expect(result.ok).toBe(true)
    })
  })

  describe('copy', () => {
    it('should copy a file to a destination directory', async () => {
      await provider.mkdir(`ftp://${sessionId}@${ftpServer.host}/dest`)
      const result = await provider.copy(
        [`ftp://${sessionId}@${ftpServer.host}/file1.txt`],
        `ftp://${sessionId}@${ftpServer.host}/dest`,
        makeOperationContext(),
        defaultCopyOptions,
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.files_done).toBe(1)
      const listResult = await provider.list(`ftp://${sessionId}@${ftpServer.host}/dest`)
      if (!listResult.ok) throw new Error('list failed')
      const names = listResult.entries.map(e => e.name)
      expect(names).toContain('file1.txt')
    })

    it('should copy a directory recursively', async () => {
      await provider.mkdir(`ftp://${sessionId}@${ftpServer.host}/destdir`)
      const result = await provider.copy(
        [`ftp://${sessionId}@${ftpServer.host}/subdir`],
        `ftp://${sessionId}@${ftpServer.host}/destdir`,
        makeOperationContext(),
        defaultCopyOptions,
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.files_done).toBe(1)
      const listResult = await provider.list(`ftp://${sessionId}@${ftpServer.host}/destdir/subdir`)
      if (!listResult.ok) throw new Error('list failed')
      const names = listResult.entries.map(e => e.name)
      expect(names).toContain('nested.txt')
    })
  })

  describe('move', () => {
    it('should move a file to a destination directory', async () => {
      await provider.mkdir(`ftp://${sessionId}@${ftpServer.host}/movedest`)
      const result = await provider.move(
        [`ftp://${sessionId}@${ftpServer.host}/file1.txt`],
        `ftp://${sessionId}@${ftpServer.host}/movedest`,
        makeMoveContext(),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.files_done).toBe(1)
      const destList = await provider.list(`ftp://${sessionId}@${ftpServer.host}/movedest`)
      if (!destList.ok) throw new Error('list failed')
      expect(destList.entries.map(e => e.name)).toContain('file1.txt')
      const rootList = await provider.list(`ftp://${sessionId}@${ftpServer.host}/`)
      if (!rootList.ok) throw new Error('list failed')
      expect(rootList.entries.map(e => e.name)).not.toContain('file1.txt')
    })

    it('should move a directory to a destination', async () => {
      await provider.mkdir(`ftp://${sessionId}@${ftpServer.host}/movedir`)
      const result = await provider.move(
        [`ftp://${sessionId}@${ftpServer.host}/subdir`],
        `ftp://${sessionId}@${ftpServer.host}/movedir`,
        makeMoveContext(),
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.files_done).toBe(1)
      const destList = await provider.list(`ftp://${sessionId}@${ftpServer.host}/movedir`)
      if (!destList.ok) throw new Error('list failed')
      expect(destList.entries.map(e => e.name)).toContain('subdir')
    })
  })

  describe('streams', () => {
    it('should createReadStream and return file content', async () => {
      const readable = await provider.createReadStream(
        `ftp://${sessionId}@${ftpServer.host}/file1.txt`,
      )
      const chunks: Buffer[] = []
      for await (const chunk of readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const content = Buffer.concat(chunks).toString('utf8')
      expect(content).toBe('content1')
    })

    it('should createWriteStream and written content reads back correctly', async () => {
      const writable = await provider.createWriteStream(
        `ftp://${sessionId}@${ftpServer.host}/written.txt`,
      )
      const data = 'hello from write stream'
      await pipeline(Readable.from([data]), writable)

      const readable = await provider.createReadStream(
        `ftp://${sessionId}@${ftpServer.host}/written.txt`,
      )
      const chunks: Buffer[] = []
      for await (const chunk of readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const content = Buffer.concat(chunks).toString('utf8')
      expect(content).toBe(data)
    })
  })
})
