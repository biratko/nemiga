import { describe, it, expect } from 'vitest'
import { FtpSessionManager } from '../ftp/FtpSessionManager.js'
import { FtpProvider } from '../ftp/FtpProvider.js'
import type { FtpProviderOptions } from '../ftp/FtpProvider.js'
import { FtpArchiveCache } from '../ftp/FtpArchiveCache.js'

describe('FtpSessionManager timer configuration', () => {
  it('should accept custom timer intervals', () => {
    const manager = new FtpSessionManager({
      sessionTimeoutMs: 1000,
      reaperIntervalMs: 500,
    })
    expect(manager).toBeDefined()
    manager.cleanup()
  })

  it('should use defaults when no options provided', () => {
    const manager = new FtpSessionManager()
    expect(manager).toBeDefined()
    manager.cleanup()
  })
})

describe('FtpProvider keepalive configuration', () => {
  it('should accept custom keepalive interval as third arg', () => {
    const provider = new FtpProvider('test-sid', {
      protocol: 'ftp', host: '127.0.0.1', port: 21, username: 'x', password: 'x',
    }, { keepaliveIntervalMs: 200 })
    expect(provider).toBeDefined()
  })

  it('should use default when no options provided', () => {
    const provider = new FtpProvider('test-sid', {
      protocol: 'ftp', host: '127.0.0.1', port: 21, username: 'x', password: 'x',
    })
    expect(provider).toBeDefined()
  })
})

describe('FtpArchiveCache TTL configuration', () => {
  it('should accept custom TTL', () => {
    const manager = new FtpSessionManager({ reaperIntervalMs: 60000, sessionTimeoutMs: 60000 })
    const cache = new FtpArchiveCache(manager, { ttlCleanMs: 500 })
    expect(cache).toBeDefined()
    cache.cleanup()
    manager.cleanup()
  })
})
