import type {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import type {FileSystemProvider, OperationContext, MoveContext, DeleteContext, CopyOptions} from '../providers/FileSystemProvider.js'
import type {CopyResult, MoveResult, DeleteResult, MkdirResult, RenameResult, ListResult} from '../protocol/fs-types.js'
import {ErrorCode} from '../protocol/errors.js'
import path from 'node:path'

/**
 * Join a path segment to a base path without mangling URL schemes.
 * `path.posix.join` collapses `://` → `:/` so it must not be used on FTP URLs.
 */
function joinPath(base: string, segment: string): string {
    if (base.startsWith('ftp://') || base.startsWith('ftps://') || base.startsWith('sftp://') || base.startsWith('ssh://')) {
        const sep = base.endsWith('/') ? '' : '/'
        return `${base}${sep}${segment}`
    }
    return path.posix.join(base, segment)
}

export class CrossProviderTransfer implements FileSystemProvider {
    constructor(
        private sourceProvider: FileSystemProvider,
        private destProvider: FileSystemProvider,
    ) {}

    async list(dirPath: string): Promise<ListResult> {
        return this.sourceProvider.list(dirPath)
    }

    async copy(sources: string[], destination: string, ctx: OperationContext, options: CopyOptions): Promise<CopyResult> {
        let filesDone = 0
        let bytesCopied = 0
        const errors: Array<{file: string; reason: string}> = []

        for (const source of sources) {
            if (ctx.cancellation.cancelled) break
            const name = path.posix.basename(source)
            const destPath = joinPath(destination, name)
            try {
                const bytes = await this.copyEntryRecursive(source, destPath, ctx)
                bytesCopied += bytes
                filesDone++
                ctx.progress.report({copied_bytes: bytesCopied, current_file: name, files_done: filesDone})
            } catch (err: any) {
                if (err.message === 'aborted') break
                errors.push({file: source, reason: err.message})
            }
        }
        return {ok: true, files_done: filesDone, bytes_copied: bytesCopied, errors}
    }

    async move(sources: string[], destination: string, ctx: MoveContext): Promise<MoveResult> {
        const copyCtx: OperationContext = {
            progress: {report: (info) => ctx.progress.report({current_file: (info as any).current_file ?? '', files_done: (info as any).files_done ?? 0})},
            confirm: ctx.confirm,
            cancellation: ctx.cancellation,
        }
        const copyResult = await this.copy(sources, destination, copyCtx, {followSymlinks: true})
        if (!copyResult.ok) return copyResult

        if (!ctx.cancellation.cancelled) {
            await this.sourceProvider.delete(sources, {
                progress: {report: () => {}},
                cancellation: ctx.cancellation,
            })
        }

        return {ok: true, files_done: copyResult.files_done, errors: copyResult.errors}
    }

    async delete(paths: string[], ctx: DeleteContext): Promise<DeleteResult> {
        return this.sourceProvider.delete(paths, ctx)
    }

    async mkdir(dirPath: string): Promise<MkdirResult> {
        return this.destProvider.mkdir(dirPath)
    }

    async rename(filePath: string, newName: string): Promise<RenameResult> {
        return {ok: false, error: {code: ErrorCode.INTERNAL, message: 'Cross-provider rename not supported'}}
    }

    private async copyEntryRecursive(srcPath: string, destPath: string, ctx: OperationContext): Promise<number> {
        const listResult = await this.sourceProvider.list(srcPath)
        if (listResult.ok) {
            const realEntries = listResult.entries.filter(e => e.name !== '..' && e.name !== '.')
            // Detect "self-listing": some FTP servers return the file itself when LIST is
            // called on a file path. Treat it as a file in that case.
            const srcBasename = path.posix.basename(srcPath)
            const isSelfListing = realEntries.length === 1 &&
                realEntries[0].type === 'file' &&
                realEntries[0].name === srcBasename
            if (!isSelfListing && realEntries.length > 0) {
                await this.destProvider.mkdir(destPath)
                let bytes = 0
                for (const entry of realEntries) {
                    if (ctx.cancellation.cancelled) throw new Error('aborted')
                    const childSrc = joinPath(srcPath, entry.name)
                    const childDest = joinPath(destPath, entry.name)
                    bytes += await this.copyEntryRecursive(childSrc, childDest, ctx)
                }
                return bytes
            }
        }

        if (!this.sourceProvider.createReadStream || !this.destProvider.createWriteStream) {
            throw new Error('Stream methods not available on provider')
        }
        const readable = await this.sourceProvider.createReadStream(srcPath)
        const writable = await this.destProvider.createWriteStream(destPath)

        let bytes = 0
        readable.on('data', (chunk: Buffer) => {
            bytes += chunk.length
        })
        await pipeline(readable, writable)
        return bytes
    }
}
