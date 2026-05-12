import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {ArchiveAdapter} from './ArchiveAdapter.js'
import {parseArchivePath} from './ArchiveProvider.js'
import {stripSlashes} from './pathUtils.js'

export interface ArchiveFileExtractOptions {
    ttlMs?: number
}

interface Entry {
    tempPath: string
    timer: ReturnType<typeof setTimeout>
}

const DEFAULT_TTL = 5 * 60 * 1000

export class ArchiveFileExtract {
    private cache = new Map<string, Entry>()
    private tmpBase = path.join(os.tmpdir(), 'nemiga-archive-file')
    private ttlMs: number

    constructor(opts: ArchiveFileExtractOptions = {}) {
        this.ttlMs = opts.ttlMs ?? DEFAULT_TTL
    }

    async extractForView(virtualPath: string, adapter: ArchiveAdapter): Promise<string> {
        const key = 'view:' + virtualPath
        const existing = this.cache.get(key)
        if (existing) {
            try {
                await fs.access(existing.tempPath)
                clearTimeout(existing.timer)
                existing.timer = setTimeout(() => void this.evict(key), this.ttlMs)
                return existing.tempPath
            } catch {
                this.cache.delete(key)
            }
        }

        const tempPath = await this.extractRaw(virtualPath, adapter, 'view-')
        const timer = setTimeout(() => void this.evict(key), this.ttlMs)
        this.cache.set(key, {tempPath, timer})
        return tempPath
    }

    async cleanup(): Promise<void> {
        const keys = [...this.cache.keys()]
        for (const k of keys) {
            await this.evict(k)
        }
    }

    private async evict(key: string): Promise<void> {
        const e = this.cache.get(key)
        if (!e) return
        this.cache.delete(key)
        clearTimeout(e.timer)
        const dir = path.dirname(e.tempPath)
        await fs.rm(dir, {recursive: true, force: true}).catch(() => {})
    }

    private async extractRaw(virtualPath: string, adapter: ArchiveAdapter, prefix: string): Promise<string> {
        const {archivePath, innerPath} = parseArchivePath(virtualPath)
        const inner = stripSlashes(innerPath)
        if (!inner) throw new Error('extractRaw: empty inner path')
        await fs.mkdir(this.tmpBase, {recursive: true})
        const tempDir = await fs.mkdtemp(path.join(this.tmpBase, prefix))
        await adapter.extract(archivePath, [inner], tempDir, {
            onProgress: () => {},
            cancelled: () => false,
        })
        const baseName = inner.includes('/') ? inner.split('/').pop()! : inner
        return path.join(tempDir, baseName)
    }
}
