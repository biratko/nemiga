import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startFtpServer, startFtpsServer, seedFiles, cleanDir, type FtpTestServer } from './helpers/ftp-server.js'
import { FtpSessionManager } from '../ftp/FtpSessionManager.js'

describe('FTP Connection & Session Lifecycle', () => {
  let ftpServer: FtpTestServer
  let ftpsServer: FtpTestServer
  let manager: FtpSessionManager

  beforeAll(async () => {
    ftpServer = await startFtpServer()
    ftpsServer = await startFtpsServer()
  })

  afterAll(async () => {
    await manager?.cleanup()
    await ftpServer?.stop()
    await ftpsServer?.stop()
  })

  beforeEach(async () => {
    await cleanDir(ftpServer.rootDir)
    await seedFiles(ftpServer.rootDir, { 'hello.txt': 'world' })
    manager = new FtpSessionManager({
      sessionTimeoutMs: 60_000,
      reaperIntervalMs: 60_000,
    })
  })

  describe('connect/disconnect', () => {
    it('should connect via FTP and return sessionId', async () => {
      const sessionId = await manager.connect({
        protocol: 'ftp',
        host: ftpServer.host,
        port: ftpServer.port,
        username: 'test',
        password: 'test',
      })
      expect(sessionId).toBeTruthy()
      expect(manager.get(sessionId)).toBeDefined()
    })

    it('should reject invalid credentials', async () => {
      await expect(manager.connect({
        protocol: 'ftp',
        host: ftpServer.host,
        port: ftpServer.port,
        username: 'wrong',
        password: 'wrong',
      })).rejects.toThrow()
    })

    it('should connect via FTPS (TLS)', async () => {
      const sessionId = await manager.connect({
        protocol: 'ftps',
        host: ftpsServer.host,
        port: ftpsServer.port,
        username: 'test',
        password: 'test',
      })
      expect(sessionId).toBeTruthy()
      expect(manager.get(sessionId)).toBeDefined()
    })

    it('should reject invalid host', async () => {
      await expect(manager.connect({
        protocol: 'ftp',
        host: '192.0.2.1',
        port: 21,
        username: 'test',
        password: 'test',
      })).rejects.toThrow()
    }, 15_000)

    it('should remove session on disconnect', async () => {
      const sessionId = await manager.connect({
        protocol: 'ftp',
        host: ftpServer.host,
        port: ftpServer.port,
        username: 'test',
        password: 'test',
      })
      await manager.disconnect(sessionId)
      expect(manager.get(sessionId)).toBeUndefined()
    })
  })

  describe('keepalive', () => {
    it('should keep session alive past sessionTimeout when keepalive is active', async () => {
      await manager.cleanup()
      manager = new FtpSessionManager({
        sessionTimeoutMs: 2_000,
        reaperIntervalMs: 500,
        providerOptions: { keepaliveIntervalMs: 300 },
      })

      const sessionId = await manager.connect({
        protocol: 'ftp',
        host: ftpServer.host,
        port: ftpServer.port,
        username: 'test',
        password: 'test',
      })

      await new Promise(resolve => setTimeout(resolve, 3_000))

      expect(manager.get(sessionId)).toBeDefined()
    }, 10_000)
  })

  describe('session reaper', () => {
    it('should evict idle session after sessionTimeout', async () => {
      await manager.cleanup()
      manager = new FtpSessionManager({
        sessionTimeoutMs: 1_000,
        reaperIntervalMs: 500,
        providerOptions: { keepaliveIntervalMs: 600_000 },
      })

      const sessionId = await manager.connect({
        protocol: 'ftp',
        host: ftpServer.host,
        port: ftpServer.port,
        username: 'test',
        password: 'test',
      })

      await new Promise(resolve => setTimeout(resolve, 2_000))

      expect(manager.get(sessionId)).toBeUndefined()
    }, 10_000)
  })
})
