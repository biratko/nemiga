import fs from 'node:fs/promises'
import type {FileSystemProvider, OperationContext, MoveContext, DeleteContext, CopyOptions} from '../providers/FileSystemProvider.js'
import type {ListResult, CopyResult, MoveResult, DeleteResult, MkdirResult, RenameResult, FSEntry} from '../protocol/fs-types.js'
import {ErrorCode} from '../protocol'
import type {ArchiveAdapter} from './ArchiveAdapter.js'
import {TempArchiveCache} from './TempArchiveCache.js'
import {stripSlashes} from './pathUtils.js'

export const ARCHIVE_SEPARATOR = '::'

export interface ParsedArchivePath {
    archivePath: string
    innerPath: string
}

export function parseArchivePath(virtualPath: string): ParsedArchivePath {
    const idx = virtualPath.indexOf(ARCHIVE_SEPARATOR)
    if (idx === -1) {
        return {archivePath: virtualPath, innerPath: '/'}
    }
    const archivePath = virtualPath.slice(0, idx)
    const innerPath = virtualPath.slice(idx + ARCHIVE_SEPARATOR.length) || '/'
    return {archivePath, innerPath}
}

export function isArchivePath(p: string): boolean {
    return p.includes(ARCHIVE_SEPARATOR)
}

export function archiveRealPath(p: string): string {
    return parseArchivePath(p).archivePath
}

export class ArchiveProvider implements FileSystemProvider {
    private adapters: ArchiveAdapter[] = []
    private tempCache = new TempArchiveCache()

    registerAdapter(adapter: ArchiveAdapter): void {
        this.adapters.push(adapter)
    }

    getArchiveExtensions(): string[] {
        return this.adapters.flatMap(a => a.extensions)
    }

    cleanup(): Promise<void> {
        return this.tempCache.cleanup()
    }

    findAdapter(filePath: string): ArchiveAdapter | undefined {
        const lower = filePath.toLowerCase()
        return this.adapters.find(a => a.extensions.some(ext => lower.endsWith(ext)))
    }

    /**
     * Resolves a virtual path with potentially nested :: separators
     * to a real archive file path + simple inner path.
     *
     * Example: /a.zip::/dir/b.tar.gz::/folder/c.txt
     *   1. Parse first :: → archivePath=/a.zip, innerPath=/dir/b.tar.gz::/folder/c.txt
     *   2. innerPath contains :: → split at :: → innerArchive=/dir/b.tar.gz, rest=/folder/c.txt
     *   3. Extract b.tar.gz from a.zip → temp file
     *   4. Recurse: temp_b.tar.gz::/folder/c.txt → simple case
     */
    private async resolveChain(virtualPath: string): Promise<ParsedArchivePath> {
        const {archivePath, innerPath} = parseArchivePath(virtualPath)

        if (!innerPath.includes(ARCHIVE_SEPARATOR)) {
            return {archivePath, innerPath}
        }

        // innerPath has nested :: — extract intermediate archive
        const nestedIdx = innerPath.indexOf(ARCHIVE_SEPARATOR)
        const innerArchiveRelPath = innerPath.slice(0, nestedIdx)
        const restPath = innerPath.slice(nestedIdx + ARCHIVE_SEPARATOR.length)

        const adapter = this.findAdapter(archivePath)
        if (!adapter) {
            throw new Error(`No adapter for archive: ${archivePath}`)
        }

        const tempPath = await this.tempCache.getOrExtract(archivePath, innerArchiveRelPath, adapter)
        const newVirtualPath = tempPath + ARCHIVE_SEPARATOR + restPath
        return this.resolveChain(newVirtualPath)
    }

    async list(dirPath: string): Promise<ListResult> {
        let archivePath: string
        let innerPath: string
        try {
            ({archivePath, innerPath} = await this.resolveChain(dirPath))
        } catch (err: any) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }

        // Verify archive file exists
        try {
            const stat = await fs.stat(archivePath)
            if (!stat.isFile()) {
                return {ok: false, error: {code: ErrorCode.NOT_A_DIRECTORY, message: `Not an archive: ${archivePath}`}}
            }
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                return {ok: false, error: {code: ErrorCode.NOT_FOUND, message: `Archive not found: ${archivePath}`}}
            }
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }

        const adapter = this.findAdapter(archivePath)
        if (!adapter) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: `No adapter for archive: ${archivePath}`}}
        }

        let allEntries: FSEntry[]
        try {
            allEntries = await adapter.listEntries(archivePath)
        } catch (err: any) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: `Failed to read archive: ${err.message}`}}
        }

        // Normalize innerPath: remove leading/trailing slashes
        const normalizedInner = stripSlashes(innerPath)

        // Filter entries that are direct children of innerPath
        const result: FSEntry[] = []
        const prefix = normalizedInner ? normalizedInner + '/' : ''

        for (const entry of allEntries) {
            const entryPath = entry.name

            if (!prefix && !entryPath.includes('/')) {
                // Root level, entry has no slashes = direct child
                result.push(entry)
            } else if (prefix && entryPath.startsWith(prefix)) {
                const relative = entryPath.slice(prefix.length)
                if (relative && !relative.includes('/')) {
                    // Direct child of innerPath
                    result.push({...entry, name: relative})
                }
            }
        }

        // Check if innerPath itself is a valid directory
        if (normalizedInner) {
            const innerExists = allEntries.some(e =>
                e.name === normalizedInner ||
                e.name.startsWith(normalizedInner + '/')
            )
            if (!innerExists) {
                return {ok: false, error: {code: ErrorCode.NOT_FOUND, message: `Path not found in archive: ${innerPath}`}}
            }
        }

        // Normalize display path: keep original chain but clean trailing slashes
        const lastSep = dirPath.lastIndexOf(ARCHIVE_SEPARATOR)
        const displayBase = dirPath.slice(0, lastSep + ARCHIVE_SEPARATOR.length)
        const displayInner = normalizedInner ? '/' + normalizedInner : ''
        return {ok: true, path: displayBase + displayInner, entries: result}
    }

    async copy(sources: string[], destination: string, ctx: OperationContext): Promise<CopyResult> {
        const destIsArchive = isArchivePath(destination)
        const srcIsArchive = isArchivePath(sources[0])

        if (srcIsArchive && !destIsArchive) {
            return this.extractFromArchive(sources, destination, ctx)
        }
        if (!srcIsArchive && destIsArchive) {
            return this.addToArchive(sources, destination, ctx)
        }
        return {ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'Archive-to-archive copy not yet supported'}}
    }

    private async extractFromArchive(sources: string[], destination: string, ctx: OperationContext): Promise<CopyResult> {
        // Resolve nested chains for all sources
        let resolved: ParsedArchivePath[]
        try {
            resolved = await Promise.all(sources.map(s => this.resolveChain(s)))
        } catch (err: any) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }

        const archivePath = resolved[0].archivePath
        if (resolved.some(p => p.archivePath !== archivePath)) {
            return {ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'All sources must be from the same archive'}}
        }

        const adapter = this.findAdapter(archivePath)
        if (!adapter) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: `No adapter for archive: ${archivePath}`}}
        }

        const innerPaths = resolved.map(p => stripSlashes(p.innerPath))

        try {
            const result = await adapter.extract(archivePath, innerPaths, destination, {
                onProgress: (info) => {
                    ctx.progress.report({
                        copied_bytes: info.bytesWritten,
                        current_file: info.currentFile,
                        files_done: info.filesDone,
                    })
                },
                cancelled: () => ctx.cancellation.cancelled,
            })
            return {ok: true, files_done: result.filesDone, bytes_copied: result.bytesWritten, errors: []}
        } catch (err: any) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: `Extract failed: ${err.message}`}}
        }
    }

    private async addToArchive(sources: string[], destination: string, ctx: OperationContext): Promise<CopyResult> {
        let archivePath: string
        let innerPath: string
        try {
            ({archivePath, innerPath} = await this.resolveChain(destination))
        } catch (err: any) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }
        const innerDest = stripSlashes(innerPath)

        const adapter = this.findAdapter(archivePath)
        if (!adapter) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: `No adapter for archive: ${archivePath}`}}
        }

        try {
            const result = await adapter.add(archivePath, innerDest, sources, {
                onProgress: (info) => {
                    ctx.progress.report({
                        copied_bytes: info.bytesWritten,
                        current_file: info.currentFile,
                        files_done: info.filesDone,
                    })
                },
                cancelled: () => ctx.cancellation.cancelled,
            })
            return {ok: true, files_done: result.filesDone, bytes_copied: result.bytesWritten, errors: []}
        } catch (err: any) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: `Add to archive failed: ${err.message}`}}
        }
    }

    async move(sources: string[], destination: string, ctx: MoveContext): Promise<MoveResult> {
        const destIsArchive = isArchivePath(destination)
        const srcIsArchive = isArchivePath(sources[0])

        if (srcIsArchive && !destIsArchive) {
            return this.moveFromArchive(sources, destination, ctx)
        }
        if (!srcIsArchive && destIsArchive) {
            return this.moveToArchive(sources, destination, ctx)
        }
        return {ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'Archive-to-archive move not yet supported'}}
    }

    private async moveFromArchive(sources: string[], destination: string, ctx: MoveContext): Promise<MoveResult> {
        // Extract from archive
        const copyResult = await this.extractFromArchive(sources, destination, {
            progress: {report: (info) => ctx.progress.report({current_file: info.current_file ?? '', files_done: info.files_done ?? 0})},
            confirm: ctx.confirm,
            cancellation: ctx.cancellation,
        })
        if (!copyResult.ok) return {ok: false, error: copyResult.error}

        // Delete from archive
        const deleteResult = await this.delete(sources, {
            progress: {report: () => {}},
            cancellation: ctx.cancellation,
        })
        if (!deleteResult.ok) return {ok: false, error: deleteResult.error}

        return {ok: true, files_done: copyResult.files_done, errors: copyResult.errors}
    }

    private async moveToArchive(sources: string[], destination: string, ctx: MoveContext): Promise<MoveResult> {
        // Add to archive
        const copyResult = await this.addToArchive(sources, destination, {
            progress: {report: (info) => ctx.progress.report({current_file: info.current_file ?? '', files_done: info.files_done ?? 0})},
            confirm: ctx.confirm,
            cancellation: ctx.cancellation,
        })
        if (!copyResult.ok) return {ok: false, error: copyResult.error}

        // Delete originals from filesystem
        const fsp = await import('node:fs/promises')
        for (const src of sources) {
            await fsp.rm(src, {recursive: true, force: true})
        }

        return {ok: true, files_done: copyResult.files_done, errors: copyResult.errors}
    }

    async delete(paths: string[], ctx: DeleteContext): Promise<DeleteResult> {
        let resolved: ParsedArchivePath[]
        try {
            resolved = await Promise.all(paths.map(p => this.resolveChain(p)))
        } catch (err: any) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }

        const archivePath = resolved[0].archivePath
        if (resolved.some(p => p.archivePath !== archivePath)) {
            return {ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'All paths must be from the same archive'}}
        }

        const adapter = this.findAdapter(archivePath)
        if (!adapter) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: `No adapter for archive: ${archivePath}`}}
        }

        const innerPaths = resolved.map(p => stripSlashes(p.innerPath))

        try {
            const result = await adapter.deleteEntries(archivePath, innerPaths)
            return {ok: true, deleted: result.deleted}
        } catch (err: any) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: `Delete in archive failed: ${err.message}`}}
        }
    }

    async mkdir(dirPath: string): Promise<MkdirResult> {
        let archivePath: string
        let innerPath: string
        try {
            ({archivePath, innerPath} = await this.resolveChain(dirPath))
        } catch (err: any) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }

        const adapter = this.findAdapter(archivePath)
        if (!adapter) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: `No adapter for archive: ${archivePath}`}}
        }

        try {
            await adapter.mkdirEntry(archivePath, innerPath)
            return {ok: true, path: dirPath}
        } catch (err: any) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: `Mkdir in archive failed: ${err.message}`}}
        }
    }

    async rename(_filePath: string, _newName: string): Promise<RenameResult> {
        return {ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'Rename inside archives is not supported'}}
    }
}