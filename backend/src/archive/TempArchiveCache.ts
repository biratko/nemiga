import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {ArchiveAdapter} from './ArchiveAdapter.js'

interface CacheEntry {
    tempPath: string
    lastAccess: number
    timer: ReturnType<typeof setTimeout>
}

const TTL = 5 * 60 * 1000

export class TempArchiveCache {
    private cache = new Map<string, CacheEntry>()
    private tmpBase = path.join(os.tmpdir(), 'tacom-archive-cache')

    async getOrExtract(
        archivePath: string,
        innerArchivePath: string,
        adapter: ArchiveAdapter,
    ): Promise<string> {
        const key = archivePath + '::' + innerArchivePath

        const existing = this.cache.get(key)
        if (existing) {
            clearTimeout(existing.timer)
            existing.lastAccess = Date.now()
            existing.timer = setTimeout(() => this.evict(key), TTL)

            try {
                await fs.access(existing.tempPath)
                return existing.tempPath
            } catch {
                this.cache.delete(key)
            }
        }

        await fs.mkdir(this.tmpBase, {recursive: true})
        const tempDir = await fs.mkdtemp(path.join(this.tmpBase, 'nested-'))
        const normalized = innerArchivePath.replace(/^\/+|\/+$/g, '')

        await adapter.extract(archivePath, [normalized], tempDir, {
            onProgress: () => {},
            cancelled: () => false,
        })

        const baseName = normalized.includes('/')
            ? normalized.split('/').pop()!
            : normalized
        const tempPath = path.join(tempDir, baseName)

        const timer = setTimeout(() => this.evict(key), TTL)
        this.cache.set(key, {tempPath, lastAccess: Date.now(), timer})

        return tempPath
    }

    private async evict(key: string) {
        const entry = this.cache.get(key)
        if (!entry) return
        this.cache.delete(key)
        clearTimeout(entry.timer)
        const dir = path.dirname(entry.tempPath)
        await fs.rm(dir, {recursive: true, force: true}).catch(() => {})
    }

    async cleanup() {
        const keys = [...this.cache.keys()]
        for (const key of keys) {
            await this.evict(key)
        }
    }
}
