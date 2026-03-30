import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { pipeline } from 'node:stream/promises'
import { createReadStream as fsCreateReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { startFtpServer, seedFiles, cleanDir, type FtpTestServer } from './helpers/ftp-server.js'
import { createZipBuffer, createTarBuffer } from './helpers/archive-fixtures.js'
import { FtpSessionManager } from '../ftp/FtpSessionManager.js'
import { FtpArchiveCache } from '../ftp/FtpArchiveCache.js'
import { FtpArchiveProvider } from '../ftp/FtpArchiveProvider.js'
import { ArchiveProvider } from '../archive/ArchiveProvider.js'
import { ZipAdapter } from '../archive/adapters/ZipAdapter.js'
import { TarAdapter } from '../archive/adapters/TarAdapter.js'
import type { OperationContext, DeleteContext } from '../providers/FileSystemProvider.js'
import type { FtpProvider } from '../ftp/FtpProvider.js'

function makeOperationContext(): OperationContext {
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

// ─── Shared setup ────────────────────────────────────────────────────────────

describe('FTP Archive Tests', () => {
  let ftpServer: FtpTestServer
  let manager: FtpSessionManager
  let archiveProvider: ArchiveProvider
  let archiveCache: FtpArchiveCache
  let ftpArchiveProvider: FtpArchiveProvider
  let sessionId: string
  let provider: FtpProvider

  beforeAll(async () => {
    ftpServer = await startFtpServer()
    manager = new FtpSessionManager({ sessionTimeoutMs: 60_000, reaperIntervalMs: 60_000 })
    archiveProvider = new ArchiveProvider()
    archiveProvider.registerAdapter(new ZipAdapter())
    archiveProvider.registerAdapter(new TarAdapter())
    archiveCache = new FtpArchiveCache(manager, { ttlCleanMs: 60_000 })
    ftpArchiveProvider = new FtpArchiveProvider(archiveCache, archiveProvider, manager)
    manager.setArchiveCache(archiveCache)
  })

  afterAll(async () => {
    await archiveCache.cleanup().catch(() => {})
    await archiveProvider.cleanup().catch(() => {})
    await manager.cleanup()
    await ftpServer.stop()
  })

  beforeEach(async () => {
    await cleanDir(ftpServer.rootDir)
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

  // ─── Browse archive on FTP (Zip) ──────────────────────────────────────────

  describe('Browse archive on FTP (Zip)', () => {
    it('should list root contents of zip archive on FTP', async () => {
      const zipBuf = await createZipBuffer({
        'readme.txt': 'hello',
        'subdir/file.txt': 'inside subdir',
      })
      await seedFiles(ftpServer.rootDir, { 'test.zip': zipBuf })

      const ftpArchivePath = `ftp://${sessionId}@${ftpServer.host}/test.zip`
      const result = await ftpArchiveProvider.list(`${ftpArchivePath}::/`)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const names = result.entries.map(e => e.name)
      expect(names).toContain('readme.txt')
      expect(names).toContain('subdir')
    })

    it('should navigate into a subdirectory of zip archive on FTP', async () => {
      const zipBuf = await createZipBuffer({
        'subdir/file.txt': 'inside subdir',
        'subdir/another.txt': 'another file',
      })
      await seedFiles(ftpServer.rootDir, { 'test.zip': zipBuf })

      const ftpArchivePath = `ftp://${sessionId}@${ftpServer.host}/test.zip`
      const result = await ftpArchiveProvider.list(`${ftpArchivePath}::/subdir`)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const names = result.entries.map(e => e.name)
      expect(names).toContain('file.txt')
      expect(names).toContain('another.txt')
    })

    it('should extract a file from zip archive on FTP to a local directory', async () => {
      const zipBuf = await createZipBuffer({
        'hello.txt': 'zip file content',
      })
      await seedFiles(ftpServer.rootDir, { 'test.zip': zipBuf })

      const tmpDir = await fs.mkdtemp(path.join(tmpdir(), 'nemiga-test-'))
      try {
        const ftpArchivePath = `ftp://${sessionId}@${ftpServer.host}/test.zip`
        const result = await ftpArchiveProvider.copy(
          [`${ftpArchivePath}::/hello.txt`],
          tmpDir,
          makeOperationContext(),
          { followSymlinks: false },
        )

        expect(result.ok).toBe(true)
        const content = await fs.readFile(path.join(tmpDir, 'hello.txt'), 'utf8')
        expect(content).toBe('zip file content')
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true })
      }
    })
  })

  // ─── Browse archive on FTP (Tar) ──────────────────────────────────────────

  describe('Browse archive on FTP (Tar)', () => {
    it('should list root contents of tar archive on FTP', async () => {
      const tarBuf = await createTarBuffer({
        'file1.txt': 'content1',
        'subdir/nested.txt': 'nested',
      })
      await seedFiles(ftpServer.rootDir, { 'test.tar': tarBuf })

      const ftpArchivePath = `ftp://${sessionId}@${ftpServer.host}/test.tar`
      const result = await ftpArchiveProvider.list(`${ftpArchivePath}::/`)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const names = result.entries.map(e => e.name)
      expect(names).toContain('file1.txt')
      expect(names).toContain('subdir')
    })

    it('should extract a file from tar archive on FTP to a local directory', async () => {
      const tarBuf = await createTarBuffer({
        'greet.txt': 'tar file content',
      })
      await seedFiles(ftpServer.rootDir, { 'test.tar': tarBuf })

      const tmpDir = await fs.mkdtemp(path.join(tmpdir(), 'nemiga-test-'))
      try {
        const ftpArchivePath = `ftp://${sessionId}@${ftpServer.host}/test.tar`
        const result = await ftpArchiveProvider.copy(
          [`${ftpArchivePath}::/greet.txt`],
          tmpDir,
          makeOperationContext(),
          { followSymlinks: false },
        )

        expect(result.ok).toBe(true)
        const content = await fs.readFile(path.join(tmpDir, 'greet.txt'), 'utf8')
        expect(content).toBe('tar file content')
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true })
      }
    })
  })

  // ─── Modify archive on FTP ────────────────────────────────────────────────

  describe('Modify archive on FTP', () => {
    it('should copy a local file into an FTP zip archive', async () => {
      const zipBuf = await createZipBuffer({ 'existing.txt': 'existing' })
      await seedFiles(ftpServer.rootDir, { 'test.zip': zipBuf })

      // Create a local temp file to copy into the archive
      const tmpDir = await fs.mkdtemp(path.join(tmpdir(), 'nemiga-test-'))
      const localFile = path.join(tmpDir, 'newfile.txt')
      await fs.writeFile(localFile, 'new content')

      const ftpArchivePath = `ftp://${sessionId}@${ftpServer.host}/test.zip`
      const result = await ftpArchiveProvider.copy(
        [localFile],
        `${ftpArchivePath}::/`,
        makeOperationContext(),
        { followSymlinks: false },
      )

      await fs.rm(tmpDir, { recursive: true, force: true })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      // Verify the new file is now visible in the archive
      const listResult = await ftpArchiveProvider.list(`${ftpArchivePath}::/`)
      expect(listResult.ok).toBe(true)
      if (!listResult.ok) return
      expect(listResult.entries.map(e => e.name)).toContain('newfile.txt')
    })

    it('should delete a file from an FTP zip archive', async () => {
      const zipBuf = await createZipBuffer({
        'keep.txt': 'keep this',
        'remove.txt': 'delete this',
      })
      await seedFiles(ftpServer.rootDir, { 'test.zip': zipBuf })

      const ftpArchivePath = `ftp://${sessionId}@${ftpServer.host}/test.zip`
      const result = await ftpArchiveProvider.delete(
        [`${ftpArchivePath}::/remove.txt`],
        makeDeleteContext(),
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return

      const listResult = await ftpArchiveProvider.list(`${ftpArchivePath}::/`)
      expect(listResult.ok).toBe(true)
      if (!listResult.ok) return
      const names = listResult.entries.map(e => e.name)
      expect(names).not.toContain('remove.txt')
      expect(names).toContain('keep.txt')
    })

    it('should create a directory inside an FTP zip archive', async () => {
      const zipBuf = await createZipBuffer({ 'existing.txt': 'existing' })
      await seedFiles(ftpServer.rootDir, { 'test.zip': zipBuf })

      const ftpArchivePath = `ftp://${sessionId}@${ftpServer.host}/test.zip`
      const result = await ftpArchiveProvider.mkdir(`${ftpArchivePath}::/newdir`)

      expect(result.ok).toBe(true)

      const listResult = await ftpArchiveProvider.list(`${ftpArchivePath}::/`)
      expect(listResult.ok).toBe(true)
      if (!listResult.ok) return
      expect(listResult.entries.map(e => e.name)).toContain('newdir')
    })
  })

  // ─── FtpArchiveCache dirty lifecycle ─────────────────────────────────────

  describe('FtpArchiveCache dirty lifecycle', () => {
    it('should mark cache entry dirty after modification', async () => {
      const zipBuf = await createZipBuffer({ 'file.txt': 'content' })
      await seedFiles(ftpServer.rootDir, { 'dirty.zip': zipBuf })

      const ftpPath = `ftp://${sessionId}@${ftpServer.host}/dirty.zip`

      // Trigger a download so cache has the entry
      await archiveCache.getLocalPath(ftpPath)
      expect(archiveCache.isDirty(ftpPath)).toBe(false)

      // Modify the archive (delete a file triggers markDirty)
      await ftpArchiveProvider.delete([`${ftpPath}::/file.txt`], makeDeleteContext())

      expect(archiveCache.isDirty(ftpPath)).toBe(true)
    })

    it('should reset dirty flag after markClean is called', async () => {
      const zipBuf = await createZipBuffer({ 'file.txt': 'content' })
      await seedFiles(ftpServer.rootDir, { 'clean.zip': zipBuf })

      const ftpPath = `ftp://${sessionId}@${ftpServer.host}/clean.zip`

      // Load and modify
      await archiveCache.getLocalPath(ftpPath)
      await ftpArchiveProvider.delete([`${ftpPath}::/file.txt`], makeDeleteContext())
      expect(archiveCache.isDirty(ftpPath)).toBe(true)

      // Simulate commit: upload modified archive back to FTP, then markClean
      const localPath = await archiveCache.getLocalPath(ftpPath)
      const readStream = fsCreateReadStream(localPath)
      const writeStream = await provider.createWriteStream!(`ftp://${sessionId}@${ftpServer.host}/clean.zip`)
      await pipeline(readStream, writeStream)
      archiveCache.markClean(ftpPath)

      expect(archiveCache.isDirty(ftpPath)).toBe(false)
    })

    it('should allow re-download of fresh copy after discard (evict)', async () => {
      const zipBuf = await createZipBuffer({ 'original.txt': 'original content' })
      await seedFiles(ftpServer.rootDir, { 'discard.zip': zipBuf })

      const ftpPath = `ftp://${sessionId}@${ftpServer.host}/discard.zip`

      // Load and modify (dirty)
      const localPath1 = await archiveCache.getLocalPath(ftpPath)
      await ftpArchiveProvider.delete([`${ftpPath}::/original.txt`], makeDeleteContext())
      expect(archiveCache.isDirty(ftpPath)).toBe(true)

      // Discard: evict the dirty entry
      await archiveCache.evict(ftpPath)
      expect(archiveCache.isDirty(ftpPath)).toBe(false)

      // Re-download should get fresh copy
      const localPath2 = await archiveCache.getLocalPath(ftpPath)
      expect(localPath2).not.toBe(localPath1)

      // The fresh copy should still have the original file
      const listResult = await ftpArchiveProvider.list(`${ftpPath}::/`)
      expect(listResult.ok).toBe(true)
      if (!listResult.ok) return
      expect(listResult.entries.map(e => e.name)).toContain('original.txt')
    })
  })

  // ─── FtpArchiveCache inflight deduplication ───────────────────────────────

  describe('FtpArchiveCache inflight deduplication', () => {
    it('should return the same local path for concurrent getLocalPath calls', async () => {
      const zipBuf = await createZipBuffer({ 'dedup.txt': 'content' })
      await seedFiles(ftpServer.rootDir, { 'dedup.zip': zipBuf })

      const ftpPath = `ftp://${sessionId}@${ftpServer.host}/dedup.zip`

      // Evict any cached entry to ensure a fresh download
      await archiveCache.evict(ftpPath)

      // Fire two concurrent requests
      const [path1, path2] = await Promise.all([
        archiveCache.getLocalPath(ftpPath),
        archiveCache.getLocalPath(ftpPath),
      ])

      expect(path1).toBe(path2)
    })
  })

  // ─── FtpArchiveCache TTL eviction ────────────────────────────────────────

  describe('FtpArchiveCache TTL eviction', () => {
    it('should evict clean cache entry after TTL expires', async () => {
      // Use a short TTL so we can observe eviction in real time
      const shortTtlMs = 200
      const shortTtlCache = new FtpArchiveCache(manager, { ttlCleanMs: shortTtlMs })

      const zipBuf = await createZipBuffer({ 'ttl.txt': 'content' })
      await seedFiles(ftpServer.rootDir, { 'ttl.zip': zipBuf })

      const ftpPath = `ftp://${sessionId}@${ftpServer.host}/ttl.zip`

      try {
        // Load the archive — entry gets created
        const localPath1 = await shortTtlCache.getLocalPath(ftpPath)
        expect(localPath1).toBeTruthy()
        // Entry should be in the cache (not dirty)
        expect(shortTtlCache.isDirty(ftpPath)).toBe(false)

        // Wait for TTL + a little buffer to allow eviction to run
        await new Promise(resolve => setTimeout(resolve, shortTtlMs + 100))

        // The entry has been evicted; a fresh download should succeed
        const localPath2 = await shortTtlCache.getLocalPath(ftpPath)
        expect(localPath2).toBeTruthy()
        // After re-download, paths differ because the evicted dir was cleaned up
        expect(localPath2).not.toBe(localPath1)
      } finally {
        await shortTtlCache.cleanup()
      }
    }, 10_000)
  })

  // ─── Commit: persist zip modifications to FTP ─────────────────────────────

  describe('Commit', () => {
    it('should persist zip archive modifications to FTP after commit', async () => {
      const zipBuf = await createZipBuffer({
        'keep.txt': 'keep this',
        'remove.txt': 'to be removed',
      })
      await seedFiles(ftpServer.rootDir, { 'commit.zip': zipBuf })

      const ftpPath = `ftp://${sessionId}@${ftpServer.host}/commit.zip`

      // Modify: delete a file from the local archive copy
      await ftpArchiveProvider.delete([`${ftpPath}::/remove.txt`], makeDeleteContext())
      expect(archiveCache.isDirty(ftpPath)).toBe(true)

      // Commit: upload modified archive back to FTP
      const localPath = await archiveCache.getLocalPath(ftpPath)
      const readStream = fsCreateReadStream(localPath)
      const writeStream = await provider.createWriteStream!(`ftp://${sessionId}@${ftpServer.host}/commit.zip`)
      await pipeline(readStream, writeStream)
      archiveCache.markClean(ftpPath)

      expect(archiveCache.isDirty(ftpPath)).toBe(false)

      // Evict cache so next read downloads from FTP
      await archiveCache.evict(ftpPath)

      // Verify FTP now has the modified archive (remove.txt should be gone)
      const listResult = await ftpArchiveProvider.list(`${ftpPath}::/`)
      expect(listResult.ok).toBe(true)
      if (!listResult.ok) return
      const names = listResult.entries.map(e => e.name)
      expect(names).toContain('keep.txt')
      expect(names).not.toContain('remove.txt')
    })

    it('should persist tar archive modifications to FTP after commit', async () => {
      const tarBuf = await createTarBuffer({
        'keep.txt': 'keep this',
        'remove.txt': 'to be removed',
      })
      await seedFiles(ftpServer.rootDir, { 'commit.tar': tarBuf })

      const ftpPath = `ftp://${sessionId}@${ftpServer.host}/commit.tar`

      // Modify: delete a file from the local archive copy
      await ftpArchiveProvider.delete([`${ftpPath}::/remove.txt`], makeDeleteContext())
      expect(archiveCache.isDirty(ftpPath)).toBe(true)

      // Commit: upload modified archive back to FTP
      const localPath = await archiveCache.getLocalPath(ftpPath)
      const readStream = fsCreateReadStream(localPath)
      const writeStream = await provider.createWriteStream!(`ftp://${sessionId}@${ftpServer.host}/commit.tar`)
      await pipeline(readStream, writeStream)
      archiveCache.markClean(ftpPath)

      expect(archiveCache.isDirty(ftpPath)).toBe(false)

      // Evict cache so next read downloads from FTP
      await archiveCache.evict(ftpPath)

      // Verify FTP now has the modified archive
      const listResult = await ftpArchiveProvider.list(`${ftpPath}::/`)
      expect(listResult.ok).toBe(true)
      if (!listResult.ok) return
      const names = listResult.entries.map(e => e.name)
      expect(names).toContain('keep.txt')
      expect(names).not.toContain('remove.txt')
    })
  })

  // ─── Discard: revert to original ─────────────────────────────────────────

  describe('Discard', () => {
    it('should revert to original zip archive on FTP after discard', async () => {
      const zipBuf = await createZipBuffer({
        'original.txt': 'original content',
        'also-original.txt': 'also original',
      })
      await seedFiles(ftpServer.rootDir, { 'discard.zip': zipBuf })

      const ftpPath = `ftp://${sessionId}@${ftpServer.host}/discard.zip`

      // Load archive and modify
      await archiveCache.getLocalPath(ftpPath)
      await ftpArchiveProvider.delete([`${ftpPath}::/original.txt`], makeDeleteContext())
      expect(archiveCache.isDirty(ftpPath)).toBe(true)

      // Verify the modification is visible (original.txt removed from local copy)
      const dirtyList = await ftpArchiveProvider.list(`${ftpPath}::/`)
      expect(dirtyList.ok).toBe(true)
      if (!dirtyList.ok) return
      expect(dirtyList.entries.map(e => e.name)).not.toContain('original.txt')

      // Discard: evict dirty local copy — FTP remains unchanged
      await archiveCache.evict(ftpPath)

      // Re-download from FTP — should have original content
      const freshList = await ftpArchiveProvider.list(`${ftpPath}::/`)
      expect(freshList.ok).toBe(true)
      if (!freshList.ok) return
      const names = freshList.entries.map(e => e.name)
      expect(names).toContain('original.txt')
      expect(names).toContain('also-original.txt')
    })

    it('should revert to original tar archive on FTP after discard', async () => {
      const tarBuf = await createTarBuffer({
        'original.txt': 'original content',
      })
      await seedFiles(ftpServer.rootDir, { 'discard.tar': tarBuf })

      const ftpPath = `ftp://${sessionId}@${ftpServer.host}/discard.tar`

      // Load archive and modify
      await archiveCache.getLocalPath(ftpPath)
      await ftpArchiveProvider.delete([`${ftpPath}::/original.txt`], makeDeleteContext())
      expect(archiveCache.isDirty(ftpPath)).toBe(true)

      // Discard: evict dirty local copy — FTP remains unchanged
      await archiveCache.evict(ftpPath)

      // Re-download from FTP — should have original content
      const freshList = await ftpArchiveProvider.list(`${ftpPath}::/`)
      expect(freshList.ok).toBe(true)
      if (!freshList.ok) return
      expect(freshList.entries.map(e => e.name)).toContain('original.txt')
    })
  })
})
