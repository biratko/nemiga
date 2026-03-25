import type {Readable, Writable} from 'node:stream'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import type {FileSystemProvider, OperationContext, MoveContext, DeleteContext, CopyOptions} from '../providers/FileSystemProvider.js'
import type {CopyResult, MoveResult, DeleteResult, MkdirResult, RenameResult, ListResult, FSEntry} from '../protocol/fs-types.js'
import type {FtpConnectionParams} from '../protocol/ftp-types.js'
import type {FtpAdapter} from './adapters/FtpAdapter.js'
import {BasicFtpAdapter} from './adapters/BasicFtpAdapter.js'
import {SftpAdapter} from './adapters/SftpAdapter.js'
import {ErrorCode} from '../protocol/errors.js'
import path from 'node:path'

export interface FtpProviderOptions {
    keepaliveIntervalMs?: number
}

const DEFAULT_KEEPALIVE_INTERVAL_MS = 30_000

export class FtpProvider implements FileSystemProvider {
    private adapter: FtpAdapter
    private sessionId: string
    private host: string
    private keepaliveTimer: ReturnType<typeof setInterval> | null = null
    private lastAccess = Date.now()
    private mutex = new Mutex()
    private keepaliveIntervalMs: number

    constructor(sessionId: string, params: FtpConnectionParams, options?: FtpProviderOptions) {
        this.sessionId = sessionId
        this.host = params.host
        this.keepaliveIntervalMs = options?.keepaliveIntervalMs ?? DEFAULT_KEEPALIVE_INTERVAL_MS
        if (params.protocol === 'sftp') {
            this.adapter = new SftpAdapter()
        } else {
            this.adapter = new BasicFtpAdapter()
        }
    }

    async connect(params: FtpConnectionParams): Promise<void> {
        const secure = params.protocol === 'ftps'
        await this.adapter.connect(params.host, params.port, params.username, params.password, {secure})
        this.startKeepalive()
    }

    async disconnect(): Promise<void> {
        this.stopKeepalive()
        await this.adapter.disconnect()
    }

    getSessionId(): string {
        return this.sessionId
    }

    getLastAccess(): number {
        return this.lastAccess
    }

    isConnected(): boolean {
        return this.adapter.isConnected()
    }

    /** Mutex-wrapped adapter call — serializes all FTP commands per-connection */
    private run<T>(fn: () => Promise<T>): Promise<T> {
        this.lastAccess = Date.now()
        return this.mutex.run(fn)
    }

    async list(dirPath: string): Promise<ListResult> {
        const remotePath = this.stripPrefix(dirPath)
        try {
            const entries = await this.run(() => this.adapter.list(remotePath))

            // Some FTP servers return the file itself when LIST is called on a file path.
            // Detect this "self-listing" pattern: a single non-directory entry whose name
            // matches either the last path segment or the full remote path.
            // Treat the path as a file, not a directory.
            if (entries.length === 1 && entries[0].type !== 'directory') {
                const basename = path.posix.basename(remotePath)
                const entryName = entries[0].name
                if (entryName === basename || entryName === remotePath) {
                    return {ok: false as const, error: {code: ErrorCode.NOT_A_DIRECTORY, message: `Not a directory: ${dirPath}`}}
                }
            }

            const resolvedPath = remotePath === '/' || remotePath === ''
                ? await this.run(() => this.adapter.pwd())
                : remotePath
            const fullPath = `${this.pathPrefix}${resolvedPath.startsWith('/') ? '' : '/'}${resolvedPath}`
            const result: FSEntry[] = []
            if (remotePath !== '/') {
                result.push({
                    name: '..', type: 'directory', size: 0,
                    modified: '', permissions: '', extension: null,
                    hidden: false, symlink_target: null,
                })
            }
            result.push(...entries)
            return {ok: true as const, path: fullPath, entries: result}
        } catch (err: any) {
            return {ok: false as const, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }
    }

    async copy(sources: string[], destination: string, ctx: OperationContext, options: CopyOptions): Promise<CopyResult> {
        const destRemote = this.stripPrefix(destination)
        let filesDone = 0
        let bytesCopied = 0
        const errors: Array<{file: string; reason: string}> = []

        for (const source of sources) {
            if (ctx.cancellation.cancelled) break
            const srcRemote = this.stripPrefix(source)
            const srcName = path.posix.basename(srcRemote)
            const targetPath = path.posix.join(destRemote, srcName)
            try {
                await this.copyRecursive(srcRemote, targetPath, ctx)
                filesDone++
                ctx.progress.report({copied_bytes: bytesCopied, current_file: srcName, files_done: filesDone})
            } catch (err: any) {
                if (err.message === 'aborted') break
                errors.push({file: srcRemote, reason: err.message})
            }
        }
        return {ok: true as const, files_done: filesDone, bytes_copied: bytesCopied, errors}
    }

    async move(sources: string[], destination: string, ctx: MoveContext): Promise<MoveResult> {
        const destRemote = this.stripPrefix(destination)
        let filesDone = 0
        const errors: Array<{file: string; reason: string}> = []

        for (const source of sources) {
            if (ctx.cancellation.cancelled) break
            const srcRemote = this.stripPrefix(source)
            const srcName = path.posix.basename(srcRemote)
            const targetPath = path.posix.join(destRemote, srcName)
            try {
                await this.run(() => this.adapter.rename(srcRemote, targetPath))
                filesDone++
                ctx.progress.report({current_file: srcName, files_done: filesDone})
            } catch (err: any) {
                errors.push({file: srcRemote, reason: err.message})
            }
        }
        return {ok: true as const, files_done: filesDone, errors}
    }

    async delete(paths: string[], ctx: DeleteContext): Promise<DeleteResult> {
        let deleted = 0
        for (const p of paths) {
            if (ctx.cancellation.cancelled) break
            const remotePath = this.stripPrefix(p)
            try {
                await this.deleteRecursive(remotePath, ctx)
                deleted++
            } catch {
                // continue
            }
        }
        return {ok: true as const, deleted}
    }

    async mkdir(dirPath: string): Promise<MkdirResult> {
        const remotePath = this.stripPrefix(dirPath)
        try {
            await this.run(() => this.adapter.mkdir(remotePath))
            return {ok: true as const, path: `${this.pathPrefix}${remotePath}`}
        } catch (err: any) {
            return {ok: false as const, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }
    }

    async rename(filePath: string, newName: string): Promise<RenameResult> {
        const remotePath = this.stripPrefix(filePath)
        const dir = path.posix.dirname(remotePath)
        const newPath = path.posix.join(dir, newName)
        try {
            await this.run(() => this.adapter.rename(remotePath, newPath))
            return {ok: true as const}
        } catch (err: any) {
            return {ok: false as const, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }
    }

    async createReadStream(filePath: string): Promise<Readable> {
        this.lastAccess = Date.now()
        const remotePath = this.stripPrefix(filePath)
        return this.run(() => this.adapter.createReadStream(remotePath))
    }

    async createWriteStream(filePath: string): Promise<Writable> {
        this.lastAccess = Date.now()
        const remotePath = this.stripPrefix(filePath)
        return this.run(() => this.adapter.createWriteStream(remotePath))
    }

    private get pathPrefix(): string {
        return `ftp://${this.sessionId}@${this.host}`
    }

    private stripPrefix(fullPath: string): string {
        if (fullPath.startsWith(this.pathPrefix)) {
            const rest = fullPath.slice(this.pathPrefix.length)
            return rest || '/'
        }
        // Legacy format without host
        const legacyPrefix = `ftp://${this.sessionId}`
        if (fullPath.startsWith(legacyPrefix)) {
            const rest = fullPath.slice(legacyPrefix.length)
            return rest || '/'
        }
        return fullPath
    }

    private async copyRecursive(src: string, dest: string, ctx: OperationContext): Promise<void> {
        let entries: FSEntry[]
        try {
            entries = await this.run(() => this.adapter.list(src))
        } catch {
            entries = []
        }

        // Some FTP servers return the file itself when LIST is called on a file path.
        // Detect this: if the listing has a single file entry matching the source basename,
        // treat src as a file rather than a directory.
        const srcBasename = path.posix.basename(src)
        const isSelfListing = entries.length === 1 &&
            entries[0].type === 'file' &&
            path.posix.basename(entries[0].name) === srcBasename

        if (entries.length === 0 || isSelfListing) {
            // It's a file — download to a local temp file, then upload.
            // This must use the atomic downloadToFile/uploadFromFile adapter methods so each
            // FTP transfer fully completes (including the control-channel 226 response) before
            // the next one starts, avoiding "task while another one is still running" errors.
            const tmpPath = path.join(os.tmpdir(), `tacom-ftp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
            try {
                await this.run(() => this.adapter.downloadToFile(src, tmpPath))
                await this.run(() => this.adapter.uploadFromFile(tmpPath, dest))
            } finally {
                await fsPromises.unlink(tmpPath).catch(() => {})
            }
            return
        }
        await this.run(() => this.adapter.mkdir(dest))
        for (const entry of entries) {
            if (ctx.cancellation.cancelled) throw new Error('aborted')
            if (entry.name === '.' || entry.name === '..') continue
            const childSrc = path.posix.join(src, entry.name)
            const childDest = path.posix.join(dest, entry.name)
            await this.copyRecursive(childSrc, childDest, ctx)
        }
    }

    private async deleteRecursive(remotePath: string, ctx: DeleteContext): Promise<void> {
        try {
            await this.run(() => this.adapter.delete(remotePath))
            ctx.progress.report({deleted: 1, current: remotePath})
        } catch {
            await this.run(() => this.adapter.deleteDir(remotePath))
            ctx.progress.report({deleted: 1, current: remotePath})
        }
    }

    private startKeepalive(): void {
        this.keepaliveTimer = setInterval(async () => {
            try {
                await this.run(() => this.adapter.sendNoop())
            } catch {
                // Connection lost — will be caught on next operation
            }
        }, this.keepaliveIntervalMs)
    }

    private stopKeepalive(): void {
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer)
            this.keepaliveTimer = null
        }
    }
}

class Mutex {
    private queue: Array<() => void> = []
    private locked = false

    async run<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire()
        try {
            return await fn()
        } finally {
            this.release()
        }
    }

    private acquire(): Promise<void> {
        if (!this.locked) {
            this.locked = true
            return Promise.resolve()
        }
        return new Promise<void>((resolve) => {
            this.queue.push(resolve)
        })
    }

    private release(): void {
        const next = this.queue.shift()
        if (next) {
            next()
        } else {
            this.locked = false
        }
    }
}
