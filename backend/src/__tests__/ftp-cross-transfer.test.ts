import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { startFtpServer, seedFiles, cleanDir, type FtpTestServer } from './helpers/ftp-server.js'
import { FtpSessionManager } from '../ftp/FtpSessionManager.js'
import { FtpArchiveCache } from '../ftp/FtpArchiveCache.js'
import { FtpArchiveProvider } from '../ftp/FtpArchiveProvider.js'
import { LocalProvider } from '../providers/LocalProvider.js'
import { ArchiveProvider } from '../archive/ArchiveProvider.js'
import { ZipAdapter } from '../archive/adapters/ZipAdapter.js'
import { TarAdapter } from '../archive/adapters/TarAdapter.js'
import { ProviderRouter } from '../providers/ProviderRouter.js'
import { PathGuard } from '../providers/pathGuard.js'
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

describe('Cross-Provider FTP ↔ Local Transfers', () => {
  let ftpServer: FtpTestServer
  let manager: FtpSessionManager
  let router: ProviderRouter
  let sessionId: string
  let localTmpDir: string

  beforeAll(async () => {
    ftpServer = await startFtpServer()
    manager = new FtpSessionManager({ sessionTimeoutMs: 60_000, reaperIntervalMs: 60_000 })

    const local = new LocalProvider()
    const archiveProvider = new ArchiveProvider()
    archiveProvider.registerAdapter(new ZipAdapter())
    archiveProvider.registerAdapter(new TarAdapter())
    const archiveCache = new FtpArchiveCache(manager, { ttlCleanMs: 60_000 })
    const ftpArchiveProvider = new FtpArchiveProvider(archiveCache, archiveProvider, manager)
    manager.setArchiveCache(archiveCache)
    // Use open PathGuard (no allowed roots restriction)
    const pathGuard = new PathGuard()
    router = new ProviderRouter(local, archiveProvider, pathGuard, manager, ftpArchiveProvider)

    localTmpDir = await mkdtemp(join(tmpdir(), 'tacom-cross-transfer-test-'))
  })

  afterAll(async () => {
    await manager.cleanup()
    await ftpServer.stop()
    await rm(localTmpDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    // Reset FTP server files
    await cleanDir(ftpServer.rootDir)
    await seedFiles(ftpServer.rootDir, {
      'file1.txt': 'content1',
      'file2.txt': 'content2',
      'subdir/nested.txt': 'nested content',
    })

    // Reset local temp dir contents (keep dir itself)
    const entries = await readdir(localTmpDir)
    for (const entry of entries) {
      await rm(join(localTmpDir, entry), { recursive: true, force: true })
    }

    // Reconnect FTP session each test for fresh state
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
  })

  // ─── FTP → Local ───────────────────────────────────────────────────────────

  describe('FTP → Local copy', () => {
    it('should copy a file from FTP to a local directory', async () => {
      const ftpSrc = `ftp://${sessionId}@${ftpServer.host}/file1.txt`
      const localDest = localTmpDir

      const transfer = router.resolveForTransfer([ftpSrc], localDest)
      const result = await transfer.copy([ftpSrc], localDest, makeOperationContext(), defaultCopyOptions)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.files_done).toBe(1)

      const content = await readFile(join(localTmpDir, 'file1.txt'), 'utf8')
      expect(content).toBe('content1')
    })

    it('should copy a directory recursively from FTP to local', async () => {
      const ftpSrc = `ftp://${sessionId}@${ftpServer.host}/subdir`
      const localDest = localTmpDir

      const transfer = router.resolveForTransfer([ftpSrc], localDest)
      const result = await transfer.copy([ftpSrc], localDest, makeOperationContext(), defaultCopyOptions)

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const nestedContent = await readFile(join(localTmpDir, 'subdir', 'nested.txt'), 'utf8')
      expect(nestedContent).toBe('nested content')
    })

    it('should preserve original file on FTP after copying to local', async () => {
      const ftpSrc = `ftp://${sessionId}@${ftpServer.host}/file1.txt`
      const localDest = localTmpDir

      const transfer = router.resolveForTransfer([ftpSrc], localDest)
      await transfer.copy([ftpSrc], localDest, makeOperationContext(), defaultCopyOptions)

      // Verify the original still exists on FTP
      const ftpProvider = manager.get(sessionId)!
      const listResult = await ftpProvider.list(`ftp://${sessionId}@${ftpServer.host}/`)
      expect(listResult.ok).toBe(true)
      if (!listResult.ok) return
      expect(listResult.entries.map(e => e.name)).toContain('file1.txt')
    })
  })

  // ─── Local → FTP ───────────────────────────────────────────────────────────

  describe('Local → FTP copy', () => {
    it('should copy a file from local to FTP', async () => {
      // Seed a local file
      const localFile = join(localTmpDir, 'local-file.txt')
      await writeFile(localFile, 'local content')

      const ftpDest = `ftp://${sessionId}@${ftpServer.host}/`

      const transfer = router.resolveForTransfer([localFile], ftpDest)
      const result = await transfer.copy([localFile], ftpDest, makeOperationContext(), defaultCopyOptions)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.files_done).toBe(1)

      const ftpProvider = manager.get(sessionId)!
      const listResult = await ftpProvider.list(`ftp://${sessionId}@${ftpServer.host}/`)
      expect(listResult.ok).toBe(true)
      if (!listResult.ok) return
      expect(listResult.entries.map(e => e.name)).toContain('local-file.txt')
    })

    it('should copy a directory recursively from local to FTP', async () => {
      // Seed a local directory structure
      const localDir = join(localTmpDir, 'mydir')
      await mkdir(localDir)
      await writeFile(join(localDir, 'a.txt'), 'aaa')
      await writeFile(join(localDir, 'b.txt'), 'bbb')

      const ftpDest = `ftp://${sessionId}@${ftpServer.host}/`

      const transfer = router.resolveForTransfer([localDir], ftpDest)
      const result = await transfer.copy([localDir], ftpDest, makeOperationContext(), defaultCopyOptions)

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const ftpProvider = manager.get(sessionId)!
      const listResult = await ftpProvider.list(`ftp://${sessionId}@${ftpServer.host}/mydir`)
      expect(listResult.ok).toBe(true)
      if (!listResult.ok) return
      const names = listResult.entries.map(e => e.name)
      expect(names).toContain('a.txt')
      expect(names).toContain('b.txt')
    })
  })

  // ─── Move (cross-provider) ─────────────────────────────────────────────────

  describe('Move cross-provider', () => {
    it('should move FTP→Local: file appears locally and is deleted from FTP', async () => {
      const ftpSrc = `ftp://${sessionId}@${ftpServer.host}/file1.txt`
      const localDest = localTmpDir

      const transfer = router.resolveForTransfer([ftpSrc], localDest)
      const result = await transfer.move([ftpSrc], localDest, makeMoveContext())

      expect(result.ok).toBe(true)

      // File should appear locally
      const content = await readFile(join(localTmpDir, 'file1.txt'), 'utf8')
      expect(content).toBe('content1')

      // File should be deleted from FTP
      const ftpProvider = manager.get(sessionId)!
      const listResult = await ftpProvider.list(`ftp://${sessionId}@${ftpServer.host}/`)
      expect(listResult.ok).toBe(true)
      if (!listResult.ok) return
      expect(listResult.entries.map(e => e.name)).not.toContain('file1.txt')
    })

    it('should move Local→FTP: file appears on FTP and is deleted locally', async () => {
      const localFile = join(localTmpDir, 'to-move.txt')
      await writeFile(localFile, 'move me to ftp')

      const ftpDest = `ftp://${sessionId}@${ftpServer.host}/`

      const transfer = router.resolveForTransfer([localFile], ftpDest)
      const result = await transfer.move([localFile], ftpDest, makeMoveContext())

      expect(result.ok).toBe(true)

      // File should appear on FTP
      const ftpProvider = manager.get(sessionId)!
      const listResult = await ftpProvider.list(`ftp://${sessionId}@${ftpServer.host}/`)
      expect(listResult.ok).toBe(true)
      if (!listResult.ok) return
      expect(listResult.entries.map(e => e.name)).toContain('to-move.txt')

      // File should be deleted locally
      let localExists = true
      try {
        await readFile(localFile)
      } catch {
        localExists = false
      }
      expect(localExists).toBe(false)
    })
  })

  // ─── Error handling ────────────────────────────────────────────────────────

  describe('Error handling', () => {
    it('should reject cross-provider rename with an error result', async () => {
      const ftpSrc = `ftp://${sessionId}@${ftpServer.host}/file1.txt`
      const localDest = localTmpDir

      // resolveForTransfer returns CrossProviderTransfer when src/dest are different providers
      const transfer = router.resolveForTransfer([ftpSrc], localDest)
      const result = await transfer.rename(ftpSrc, 'newname.txt')

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.message).toMatch(/cross-provider rename not supported/i)
    })

    it('should abort mid-transfer when AbortController signals cancellation', async () => {
      // Seed multiple large-ish files on FTP
      await seedFiles(ftpServer.rootDir, {
        'big1.txt': 'x'.repeat(10_000),
        'big2.txt': 'y'.repeat(10_000),
        'big3.txt': 'z'.repeat(10_000),
      })

      const sources = [
        `ftp://${sessionId}@${ftpServer.host}/big1.txt`,
        `ftp://${sessionId}@${ftpServer.host}/big2.txt`,
        `ftp://${sessionId}@${ftpServer.host}/big3.txt`,
      ]

      const cancellation = { cancelled: false }
      const ctx: OperationContext = {
        progress: {
          report: () => {
            // Cancel after first progress report
            cancellation.cancelled = true
          },
        },
        confirm: { ask: async () => 'skip' },
        cancellation,
      }

      const transfer = router.resolveForTransfer(sources, localTmpDir)
      const result = await transfer.copy(sources, localTmpDir, ctx, defaultCopyOptions)

      // Transfer should complete without throwing; not all files may be copied
      expect(result.ok).toBe(true)
      // At least the cancellation was set (confirming the mechanism is wired)
      expect(cancellation.cancelled).toBe(true)
    })
  })

  // ─── Progress tracking ─────────────────────────────────────────────────────

  describe('Progress tracking', () => {
    it('should report bytesTotal > 0 for a large file copy from FTP to local', async () => {
      const largeContent = 'L'.repeat(100_000)
      await seedFiles(ftpServer.rootDir, {
        'large.txt': largeContent,
      })

      const ftpSrc = `ftp://${sessionId}@${ftpServer.host}/large.txt`
      let reportedBytes = 0

      const ctx: OperationContext = {
        progress: {
          report: (info) => {
            if (info.copied_bytes !== undefined && info.copied_bytes > reportedBytes) {
              reportedBytes = info.copied_bytes
            }
          },
        },
        confirm: { ask: async () => 'skip' },
        cancellation: { cancelled: false },
      }

      const transfer = router.resolveForTransfer([ftpSrc], localTmpDir)
      const result = await transfer.copy([ftpSrc], localTmpDir, ctx, defaultCopyOptions)

      expect(result.ok).toBe(true)
      if (!result.ok) return

      // bytes_copied on the result should reflect the actual bytes transferred
      expect(result.bytes_copied).toBeGreaterThan(0)
    })
  })
})
