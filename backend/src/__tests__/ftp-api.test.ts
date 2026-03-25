import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { startFtpServer, seedFiles, cleanDir, type FtpTestServer } from './helpers/ftp-server.js'
import { createZipBuffer } from './helpers/archive-fixtures.js'
import { createApp, type AppInstance } from '../createApp.js'

describe('FTP REST API Endpoints', () => {
  let ftpServer: FtpTestServer
  let appInstance: AppInstance

  beforeAll(async () => {
    ftpServer = await startFtpServer()
    appInstance = createApp({
      ftpSessionManagerOptions: { sessionTimeoutMs: 60_000, reaperIntervalMs: 60_000 },
      ftpArchiveCacheOptions: { ttlCleanMs: 60_000 },
    })
    await new Promise<void>(resolve => appInstance.server.listen(0, resolve))
  })

  afterAll(async () => {
    await appInstance.cleanup()
    await ftpServer.stop()
  })

  beforeEach(async () => {
    await cleanDir(ftpServer.rootDir)
  })

  // ─── POST /api/ftp/connect ─────────────────────────────────────────────────

  describe('POST /api/ftp/connect', () => {
    it('should return ok:true and sessionId when credentials are valid', async () => {
      const res = await request(appInstance.server)
        .post('/api/ftp/connect')
        .send({
          protocol: 'ftp',
          host: ftpServer.host,
          port: ftpServer.port,
          username: 'test',
          password: 'test',
        })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(typeof res.body.sessionId).toBe('string')
      expect(res.body.sessionId).toBeTruthy()
    })

    it('should return ok:false and error when credentials are invalid', async () => {
      const res = await request(appInstance.server)
        .post('/api/ftp/connect')
        .send({
          protocol: 'ftp',
          host: ftpServer.host,
          port: ftpServer.port,
          username: 'wrong',
          password: 'wrong',
        })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(false)
      expect(res.body.error).toBeDefined()
    })

    it('should return ok:false when required fields are missing', async () => {
      const res = await request(appInstance.server)
        .post('/api/ftp/connect')
        .send({ host: ftpServer.host, port: ftpServer.port })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(false)
      expect(res.body.error).toBeDefined()
    })

    it('should return ok:false when protocol is invalid', async () => {
      const res = await request(appInstance.server)
        .post('/api/ftp/connect')
        .send({
          protocol: 'http',
          host: ftpServer.host,
          port: ftpServer.port,
          username: 'test',
          password: 'test',
        })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(false)
      expect(res.body.error).toBeDefined()
    })

    it('should return ok:false when host is unreachable', async () => {
      const res = await request(appInstance.server)
        .post('/api/ftp/connect')
        .send({
          protocol: 'ftp',
          host: '192.0.2.1',
          port: 21,
          username: 'test',
          password: 'test',
        })
        .timeout(15_000)

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(false)
      expect(res.body.error).toBeDefined()
    }, 15_000)
  })

  // ─── POST /api/ftp/disconnect ──────────────────────────────────────────────

  describe('POST /api/ftp/disconnect', () => {
    it('should return ok:true when disconnecting an existing session', async () => {
      const connectRes = await request(appInstance.server)
        .post('/api/ftp/connect')
        .send({
          protocol: 'ftp',
          host: ftpServer.host,
          port: ftpServer.port,
          username: 'test',
          password: 'test',
        })
      const { sessionId } = connectRes.body

      const disconnectRes = await request(appInstance.server)
        .post('/api/ftp/disconnect')
        .send({ sessionId })

      expect(disconnectRes.status).toBe(200)
      expect(disconnectRes.body.ok).toBe(true)
    })

    it('should return ok:true when disconnecting a nonexistent sessionId (idempotent)', async () => {
      const res = await request(appInstance.server)
        .post('/api/ftp/disconnect')
        .send({ sessionId: 'nonexistent-session-id' })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })

    it('should return ok:false when sessionId is missing from request body', async () => {
      const res = await request(appInstance.server)
        .post('/api/ftp/disconnect')
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(false)
      expect(res.body.error).toBeDefined()
    })
  })

  // ─── POST /api/ftp/archive/commit ─────────────────────────────────────────

  describe('POST /api/ftp/archive/commit', () => {
    it('should return ok:true when committing a non-dirty archive (no-op)', async () => {
      const connectRes = await request(appInstance.server)
        .post('/api/ftp/connect')
        .send({
          protocol: 'ftp',
          host: ftpServer.host,
          port: ftpServer.port,
          username: 'test',
          password: 'test',
        })
      const { sessionId } = connectRes.body
      const ftpPath = `ftp://${sessionId}@${ftpServer.host}/test.zip`

      const res = await request(appInstance.server)
        .post('/api/ftp/archive/commit')
        .send({ ftpPath })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })

    it('should return ok:false when ftpPath is missing', async () => {
      const res = await request(appInstance.server)
        .post('/api/ftp/archive/commit')
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(false)
      expect(res.body.error).toBeDefined()
    })
  })

  // ─── POST /api/ftp/archive/discard ────────────────────────────────────────

  describe('POST /api/ftp/archive/discard', () => {
    it('should return ok:true when discarding a cached archive', async () => {
      const zipBuffer = await createZipBuffer({ 'file.txt': 'hello' })
      await seedFiles(ftpServer.rootDir, { 'test.zip': zipBuffer })

      const connectRes = await request(appInstance.server)
        .post('/api/ftp/connect')
        .send({
          protocol: 'ftp',
          host: ftpServer.host,
          port: ftpServer.port,
          username: 'test',
          password: 'test',
        })
      const { sessionId } = connectRes.body
      const ftpPath = `ftp://${sessionId}@${ftpServer.host}/test.zip`

      // Warm the cache by downloading it first via the download endpoint
      await request(appInstance.server)
        .get('/api/ftp/archive/download')
        .query({ ftpPath })

      const res = await request(appInstance.server)
        .post('/api/ftp/archive/discard')
        .send({ ftpPath })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })

    it('should return ok:true for a nonexistent path (evict is a no-op)', async () => {
      const connectRes = await request(appInstance.server)
        .post('/api/ftp/connect')
        .send({
          protocol: 'ftp',
          host: ftpServer.host,
          port: ftpServer.port,
          username: 'test',
          password: 'test',
        })
      const { sessionId } = connectRes.body
      const ftpPath = `ftp://${sessionId}@${ftpServer.host}/nonexistent.zip`

      const res = await request(appInstance.server)
        .post('/api/ftp/archive/discard')
        .send({ ftpPath })

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })

    it('should return ok:false when ftpPath is missing', async () => {
      const res = await request(appInstance.server)
        .post('/api/ftp/archive/discard')
        .send({})

      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(false)
      expect(res.body.error).toBeDefined()
    })
  })

  // ─── GET /api/ftp/archive/download ────────────────────────────────────────

  describe('GET /api/ftp/archive/download', () => {
    it('should return the archive file with Content-Disposition header', async () => {
      const zipBuffer = await createZipBuffer({ 'readme.txt': 'hello world' })
      await seedFiles(ftpServer.rootDir, { 'download-test.zip': zipBuffer })

      const connectRes = await request(appInstance.server)
        .post('/api/ftp/connect')
        .send({
          protocol: 'ftp',
          host: ftpServer.host,
          port: ftpServer.port,
          username: 'test',
          password: 'test',
        })
      const { sessionId } = connectRes.body
      const ftpPath = `ftp://${sessionId}@${ftpServer.host}/download-test.zip`

      const res = await request(appInstance.server)
        .get('/api/ftp/archive/download')
        .query({ ftpPath })

      expect(res.status).toBe(200)
      expect(res.headers['content-disposition']).toMatch(/attachment/)
      expect(res.headers['content-disposition']).toMatch(/download-test\.zip/)
      expect(res.headers['content-type']).toMatch(/application\/octet-stream/)
      expect(res.body).toBeTruthy()
    })

    it('should return >= 400 when ftpPath query param is missing', async () => {
      const res = await request(appInstance.server)
        .get('/api/ftp/archive/download')

      expect(res.status).toBeGreaterThanOrEqual(400)
    })

    it('should return >= 400 when ftpPath refers to a nonexistent FTP session', async () => {
      const ftpPath = 'ftp://nonexistent-session-id@127.0.0.1/archive.zip'

      const res = await request(appInstance.server)
        .get('/api/ftp/archive/download')
        .query({ ftpPath })

      expect(res.status).toBeGreaterThanOrEqual(400)
    })
  })
})
