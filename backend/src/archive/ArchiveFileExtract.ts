import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import chokidar, {type FSWatcher} from 'chokidar'
import type {ArchiveAdapter} from './ArchiveAdapter.js'
import {parseArchivePath} from './ArchiveProvider.js'
import {stripSlashes} from './pathUtils.js'

export interface ArchiveFileExtractOptions {
    ttlMs?: number
    debounceMs?: number
}

interface ViewEntry {
    kind: 'view'
    tempPath: string
    timer: ReturnType<typeof setTimeout>
}

interface EditEntry {
    kind: 'edit'
    tempPath: string
    watcher: FSWatcher
    debounce: ReturnType<typeof setTimeout> | null
    onChange: (tempPath: string) => Promise<void>
    disposed: boolean
}

const DEFAULT_TTL = 5 * 60 * 1000
const DEFAULT_DEBOUNCE = 300

export class ArchiveFileExtract {
    private cache = new Map<string, ViewEntry | EditEntry>()
    private tmpBase = path.join(os.tmpdir(), 'nemiga-archive-file')
    private ttlMs: number
    private debounceMs: number

    constructor(opts: ArchiveFileExtractOptions = {}) {
        this.ttlMs = opts.ttlMs ?? DEFAULT_TTL
        this.debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE
    }

    async extractForView(virtualPath: string, adapter: ArchiveAdapter): Promise<string> {
        const key = 'view:' + virtualPath
        const existing = this.cache.get(key)
        if (existing && existing.kind === 'view') {
            try {
                await fs.access(existing.tempPath)
                clearTimeout(existing.timer)
                existing.timer = setTimeout(() => void this.evictView(key), this.ttlMs)
                return existing.tempPath
            } catch {
                this.cache.delete(key)
            }
        }

        const tempPath = await this.extractRaw(virtualPath, adapter, 'view-')
        const timer = setTimeout(() => void this.evictView(key), this.ttlMs)
        this.cache.set(key, {kind: 'view', tempPath, timer})
        return tempPath
    }

    async extractForEdit(
        virtualPath: string,
        adapter: ArchiveAdapter,
        onChange: (tempPath: string) => Promise<void>,
    ): Promise<{tempPath: string; dispose: () => Promise<void>}> {
        const tempPath = await this.extractRaw(virtualPath, adapter, 'edit-')
        const watcher = chokidar.watch(tempPath, {
            awaitWriteFinish: {stabilityThreshold: this.debounceMs, pollInterval: 50},
            ignoreInitial: true,
        })
        const entry: EditEntry = {
            kind: 'edit',
            tempPath,
            watcher,
            debounce: null,
            onChange,
            disposed: false,
        }
        const key = 'edit:' + virtualPath + ':' + Date.now() + ':' + Math.random()
        this.cache.set(key, entry)

        watcher.on('change', () => this.fire(entry))
        watcher.on('add', () => this.fire(entry))

        return {
            tempPath,
            dispose: async () => { await this.disposeEdit(key, entry) },
        }
    }

    async cleanup(): Promise<void> {
        const keys = [...this.cache.keys()]
        for (const k of keys) {
            const e = this.cache.get(k)
            if (!e) continue
            if (e.kind === 'edit') await this.disposeEdit(k, e)
            else await this.evictView(k)
        }
    }

    private fire(entry: EditEntry): void {
        if (entry.disposed) return
        if (entry.debounce) clearTimeout(entry.debounce)
        entry.debounce = setTimeout(() => {
            entry.debounce = null
            entry.onChange(entry.tempPath).catch(err => {
                console.error('[ArchiveFileExtract] onChange failed:', err)
            })
        }, this.debounceMs)
    }

    private async disposeEdit(key: string, entry: EditEntry): Promise<void> {
        if (entry.disposed) return
        entry.disposed = true
        if (entry.debounce) {
            clearTimeout(entry.debounce)
            entry.debounce = null
        }
        await entry.watcher.close().catch(() => {})
        this.cache.delete(key)
        const dir = path.dirname(entry.tempPath)
        await fs.rm(dir, {recursive: true, force: true}).catch(() => {})
    }

    private async evictView(key: string): Promise<void> {
        const e = this.cache.get(key)
        if (!e || e.kind !== 'view') return
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
