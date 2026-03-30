// backend/src/ftp/FtpArchiveCache.ts
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'
import {extractFtpSessionId} from '../providers/ProviderRouter.js'
import type {FtpSessionManager} from './FtpSessionManager.js'

const DEFAULT_TTL_CLEAN = 5 * 60 * 1000

export interface ArchiveCacheOptions {
    ttlCleanMs?: number
}

interface CacheEntry {
    localPath: string
    dirty: boolean
    lastAccess: number
    timer: ReturnType<typeof setTimeout> | null
}

export class FtpArchiveCache {
    private cache = new Map<string, CacheEntry>()
    private inflight = new Map<string, Promise<string>>()
    private tmpBase = path.join(os.tmpdir(), 'nemiga-ftp-archive')
    private ttlCleanMs: number

    constructor(private sessions: FtpSessionManager, options?: ArchiveCacheOptions) {
        this.ttlCleanMs = options?.ttlCleanMs ?? DEFAULT_TTL_CLEAN
    }

    async getLocalPath(ftpPath: string): Promise<string> {
        const existing = this.cache.get(ftpPath)
        if (existing) {
            if (!existing.dirty) this.resetTimer(ftpPath, existing)
            try {
                await fs.access(existing.localPath)
                return existing.localPath
            } catch {
                this.cache.delete(ftpPath)
            }
        }

        const inflight = this.inflight.get(ftpPath)
        if (inflight) return inflight

        const promise = this.download(ftpPath)
        this.inflight.set(ftpPath, promise)
        try {
            return await promise
        } finally {
            this.inflight.delete(ftpPath)
        }
    }

    private async download(ftpPath: string): Promise<string> {
        const sessionId = extractFtpSessionId(ftpPath)
        const provider = this.sessions.get(sessionId)
        if (!provider) throw new Error(`FTP session not found: ${sessionId}`)

        await fs.mkdir(this.tmpBase, {recursive: true})
        const tmpDir = await fs.mkdtemp(path.join(this.tmpBase, 'dl-'))
        const filename = path.posix.basename(ftpPath.split('::')[0])
        const localPath = path.join(tmpDir, filename)

        const readable = await provider.createReadStream(ftpPath)
        const writable = fsSync.createWriteStream(localPath)
        await pipeline(readable, writable)

        const timer = this.scheduleEvict(ftpPath)
        this.cache.set(ftpPath, {localPath, dirty: false, lastAccess: Date.now(), timer})
        return localPath
    }

    markDirty(ftpPath: string): void {
        const entry = this.cache.get(ftpPath)
        if (!entry) return
        entry.dirty = true
        entry.lastAccess = Date.now()
        if (entry.timer) {
            clearTimeout(entry.timer)
            entry.timer = null
        }
    }

    markClean(ftpPath: string): void {
        const entry = this.cache.get(ftpPath)
        if (!entry) return
        entry.dirty = false
        entry.lastAccess = Date.now()
        if (entry.timer) clearTimeout(entry.timer)
        entry.timer = this.scheduleEvict(ftpPath)
    }

    isDirty(ftpPath: string): boolean {
        return this.cache.get(ftpPath)?.dirty ?? false
    }

    async evict(ftpPath: string): Promise<void> {
        const entry = this.cache.get(ftpPath)
        if (!entry) return
        this.cache.delete(ftpPath)
        if (entry.timer) clearTimeout(entry.timer)
        const dir = path.dirname(entry.localPath)
        await fs.rm(dir, {recursive: true, force: true}).catch(() => {})
    }

    getDirtyForSession(sessionId: string): string[] {
        const prefix = `ftp://${sessionId}@`
        const result: string[] = []
        for (const [ftpPath, entry] of this.cache) {
            if (entry.dirty && ftpPath.startsWith(prefix)) result.push(ftpPath)
        }
        return result
    }

    rekey(oldFtpPath: string, newFtpPath: string): void {
        const entry = this.cache.get(oldFtpPath)
        if (!entry) return
        this.cache.delete(oldFtpPath)
        this.cache.set(newFtpPath, entry)
    }

    async cleanup(): Promise<void> {
        for (const key of [...this.cache.keys()]) {
            await this.evict(key)
        }
    }

    private scheduleEvict(ftpPath: string): ReturnType<typeof setTimeout> {
        return setTimeout(() => this.evict(ftpPath), this.ttlCleanMs)
    }

    private resetTimer(ftpPath: string, entry: CacheEntry): void {
        if (entry.timer) clearTimeout(entry.timer)
        entry.timer = this.scheduleEvict(ftpPath)
        entry.lastAccess = Date.now()
    }
}
