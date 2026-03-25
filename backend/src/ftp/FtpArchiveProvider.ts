// backend/src/ftp/FtpArchiveProvider.ts
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import fsSync from 'node:fs'
import {pipeline} from 'node:stream/promises'
import type {Readable} from 'node:stream'
import type {FileSystemProvider, OperationContext, MoveContext, DeleteContext, CopyOptions} from '../providers/FileSystemProvider.js'
import type {ListResult, CopyResult, MoveResult, DeleteResult, MkdirResult, RenameResult} from '../protocol/fs-types.js'
import type {ArchiveProvider} from '../archive/ArchiveProvider.js'
import type {FtpArchiveCache} from './FtpArchiveCache.js'
import type {FtpSessionManager} from './FtpSessionManager.js'
import {isFtpPath, extractFtpSessionId} from '../providers/ProviderRouter.js'

export function splitFtpArchivePath(p: string): {ftpPart: string; innerPart: string} {
    const idx = p.indexOf('::')
    if (idx === -1) throw new Error(`Not an FTP archive path: ${p}`)
    return {
        ftpPart: p.slice(0, idx),
        innerPart: p.slice(idx + 2) || '/',
    }
}

export class FtpArchiveProvider implements FileSystemProvider {
    constructor(
        private cache: FtpArchiveCache,
        private archiveProvider: ArchiveProvider,
        private sessions: FtpSessionManager,
    ) {}

    private async localVirtualPath(ftpArchivePath: string): Promise<string> {
        const {ftpPart, innerPart} = splitFtpArchivePath(ftpArchivePath)
        const localArchive = await this.cache.getLocalPath(ftpPart)
        return localArchive + '::' + innerPart
    }

    async list(dirPath: string): Promise<ListResult> {
        const {ftpPart} = splitFtpArchivePath(dirPath)
        const localVirtual = await this.localVirtualPath(dirPath)
        const localArchive = localVirtual.slice(0, localVirtual.indexOf('::'))
        const result = await this.archiveProvider.list(localVirtual)
        if (result.ok && result.path) {
            result.path = result.path.replace(localArchive + '::', ftpPart + '::')
        }
        return result
    }

    private async toLocal(p: string, temps: string[]): Promise<string> {
        if (isFtpPath(p) && p.includes('::')) {
            const {ftpPart, innerPart} = splitFtpArchivePath(p)
            const localArchive = await this.cache.getLocalPath(ftpPart)
            return localArchive + '::' + innerPart
        }
        if (isFtpPath(p)) {
            const sessionId = extractFtpSessionId(p)
            const provider = this.sessions.get(sessionId)
            if (!provider) throw new Error(`FTP session not found: ${sessionId}`)
            const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tacom-xfer-'))
            const tmpFile = path.join(tmpDir, path.posix.basename(p))
            const readable = await provider.createReadStream(p)
            const writable = fsSync.createWriteStream(tmpFile)
            await pipeline(readable, writable)
            temps.push(tmpDir)
            return tmpFile
        }
        return p
    }

    async copy(sources: string[], destination: string, ctx: OperationContext, options: CopyOptions): Promise<CopyResult> {
        const temps: string[] = []
        try {
            const localDest = await this.toLocal(destination, temps)
            const localSources = await Promise.all(sources.map(s => this.toLocal(s, temps)))
            const result = await this.archiveProvider.copy(localSources, localDest, ctx)
            this.markDirtyIfFtpArchive(destination)
            return result
        } finally {
            for (const t of temps) {
                await fs.rm(t, {recursive: true, force: true}).catch(() => {})
            }
        }
    }

    async move(sources: string[], destination: string, ctx: MoveContext): Promise<MoveResult> {
        const temps: string[] = []
        try {
            const localDest = await this.toLocal(destination, temps)
            const localSources = await Promise.all(sources.map(s => this.toLocal(s, temps)))
            const result = await this.archiveProvider.move(localSources, localDest, ctx)
            this.markDirtyIfFtpArchive(destination)
            for (const src of sources) this.markDirtyIfFtpArchive(src)
            return result
        } finally {
            for (const t of temps) {
                await fs.rm(t, {recursive: true, force: true}).catch(() => {})
            }
        }
    }

    private markDirtyIfFtpArchive(p: string): void {
        if (isFtpPath(p) && p.includes('::')) {
            this.cache.markDirty(splitFtpArchivePath(p).ftpPart)
        }
    }

    async delete(paths: string[], ctx: DeleteContext): Promise<DeleteResult> {
        if (paths.length === 0) return {ok: true, deleted: 0}
        const {ftpPart} = splitFtpArchivePath(paths[0])
        const localArchive = await this.cache.getLocalPath(ftpPart)
        const localPaths = paths.map(p => {
            const {innerPart} = splitFtpArchivePath(p)
            return localArchive + '::' + innerPart
        })
        const result = await this.archiveProvider.delete(localPaths, ctx)
        this.cache.markDirty(ftpPart)
        return result
    }

    async mkdir(dirPath: string): Promise<MkdirResult> {
        const {ftpPart, innerPart} = splitFtpArchivePath(dirPath)
        const localArchive = await this.cache.getLocalPath(ftpPart)
        const result = await this.archiveProvider.mkdir(localArchive + '::' + innerPart)
        this.cache.markDirty(ftpPart)
        return result
    }

    async rename(filePath: string, newName: string): Promise<RenameResult> {
        const {ftpPart, innerPart} = splitFtpArchivePath(filePath)
        const localArchive = await this.cache.getLocalPath(ftpPart)
        const result = await this.archiveProvider.rename(localArchive + '::' + innerPart, newName)
        this.cache.markDirty(ftpPart)
        return result
    }

    async createReadStream(filePath: string): Promise<Readable> {
        const localVirtual = await this.localVirtualPath(filePath)
        if (!('createReadStream' in this.archiveProvider) || typeof (this.archiveProvider as any).createReadStream !== 'function') {
            throw new Error('ArchiveProvider does not support createReadStream')
        }
        return (this.archiveProvider as any).createReadStream(localVirtual)
    }
}
