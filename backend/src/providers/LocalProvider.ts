import fs, {constants} from 'node:fs/promises'
import {type Dirent} from 'node:fs'
import path from 'node:path'
import type {FileSystemProvider, OperationContext, MoveContext, DeleteContext, CopyOptions} from './FileSystemProvider.js'
import type {CopyResult, MoveResult, DeleteResult, MkdirResult, RenameResult, ListResult, FSEntry, ConfirmAction} from '../protocol/fs-types.js'
import {ErrorCode} from '../protocol/errors.js'

class AbortError extends Error {
    constructor() {
        super('aborted')
    }
}

interface CopyContext {
    copiedBytes: number
    filesDone: number
    errors: Array<{file: string; reason: string}>
    ctx: OperationContext
    followSymlinks: boolean
}

export class LocalProvider implements FileSystemProvider {
    async list(dirPath: string): Promise<ListResult> {
        const cleanPath = path.resolve(dirPath)

        let stat
        try {
            stat = await fs.stat(cleanPath)
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                return {ok: false, error: {code: ErrorCode.NOT_FOUND, message: `Directory not found: ${dirPath}`}}
            }
            if (err.code === 'EACCES') {
                return {ok: false, error: {code: ErrorCode.PERMISSION_DENIED, message: `Permission denied: ${dirPath}`}}
            }
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }

        if (!stat.isDirectory()) {
            return {ok: false, error: {code: ErrorCode.NOT_A_DIRECTORY, message: `Not a directory: ${dirPath}`}}
        }

        let dirEntries
        try {
            dirEntries = await fs.readdir(cleanPath, {withFileTypes: true})
        } catch (err: any) {
            if (err.code === 'EACCES') {
                return {ok: false, error: {code: ErrorCode.PERMISSION_DENIED, message: `Permission denied: ${dirPath}`}}
            }
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }

        const entries: FSEntry[] = []
        for (const de of dirEntries) {
            try {
                entries.push(await toEntry(cleanPath, de))
            } catch {
                // skip unreadable entries
            }
        }

        return {ok: true, path: cleanPath, entries}
    }

    async copy(sources: string[], destination: string, ctx: OperationContext, options: CopyOptions): Promise<CopyResult> {
        const destPath = path.resolve(destination)

        // Validate destination
        try {
            const destStat = await fs.stat(destPath)
            if (!destStat.isDirectory()) {
                return {ok: false, error: {code: ErrorCode.NOT_A_DIRECTORY, message: `Destination is not a directory: ${destination}`}}
            }
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                return {ok: false, error: {code: ErrorCode.DESTINATION_NOT_FOUND, message: `Destination not found: ${destination}`}}
            }
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }

        // Validate sources
        for (const src of sources) {
            const srcPath = path.resolve(src)
            try {
                await fs.access(srcPath)
            } catch {
                return {ok: false, error: {code: ErrorCode.NOT_FOUND, message: `Source not found: ${src}`}}
            }
            const srcStat = await fs.stat(srcPath)
            if (srcStat.isDirectory()) {
                const srcWithSep = srcPath.endsWith(path.sep) ? srcPath : srcPath + path.sep
                if (destPath.startsWith(srcWithSep) || destPath === srcPath) {
                    return {ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: `Cannot copy directory into itself: ${src}`}}
                }
            }
        }

        const copyCtx: CopyContext = {
            copiedBytes: 0,
            filesDone: 0,
            errors: [],
            ctx,
            followSymlinks: options.followSymlinks,
        }

        try {
            for (const src of sources) {
                if (ctx.cancellation.cancelled) break
                const srcPath = path.resolve(src)
                const destItem = path.join(destPath, path.basename(srcPath))
                await copyItem(srcPath, destItem, path.basename(srcPath), copyCtx)
            }
        } catch (err) {
            if (!(err instanceof AbortError)) throw err
        }

        return {
            ok: true,
            files_done: copyCtx.filesDone,
            bytes_copied: copyCtx.copiedBytes,
            errors: copyCtx.errors,
        }
    }

    async move(sources: string[], destination: string, ctx: MoveContext): Promise<MoveResult> {
        const destPath = path.resolve(destination)

        // Validate destination
        try {
            const destStat = await fs.stat(destPath)
            if (!destStat.isDirectory()) {
                return {ok: false, error: {code: ErrorCode.NOT_A_DIRECTORY, message: `Destination is not a directory: ${destination}`}}
            }
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                return {ok: false, error: {code: ErrorCode.DESTINATION_NOT_FOUND, message: `Destination not found: ${destination}`}}
            }
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }

        // Validate sources
        for (const src of sources) {
            const srcPath = path.resolve(src)
            try {
                await fs.access(srcPath)
            } catch {
                return {ok: false, error: {code: ErrorCode.NOT_FOUND, message: `Source not found: ${src}`}}
            }
            const srcStat = await fs.stat(srcPath)
            if (srcStat.isDirectory()) {
                const srcWithSep = srcPath.endsWith(path.sep) ? srcPath : srcPath + path.sep
                if (destPath.startsWith(srcWithSep) || destPath === srcPath) {
                    return {ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: `Cannot move directory into itself: ${src}`}}
                }
            }
        }

        let filesDone = 0
        const errors: Array<{file: string; reason: string}> = []

        try {
            for (const src of sources) {
                if (ctx.cancellation.cancelled) break
                const srcPath = path.resolve(src)
                const baseName = path.basename(srcPath)
                const destItem = path.join(destPath, baseName)

                ctx.progress.report({current_file: baseName, files_done: filesDone})

                // Check if destination exists
                let destExists = false
                try {
                    await fs.lstat(destItem)
                    destExists = true
                } catch {
                    // doesn't exist
                }

                if (destExists) {
                    const action = await ctx.confirm.ask({
                        confirm_type: 'file_exists',
                        message: `File already exists: ${destItem}`,
                        source: srcPath,
                        destination: destItem,
                    })
                    if (action === 'abort') throw new AbortError()
                    if (action === 'skip') {
                        errors.push({file: baseName, reason: 'skipped_by_user'})
                        continue
                    }
                    // overwrite — remove destination first
                    await fs.rm(destItem, {recursive: true})
                }

                try {
                    await fs.rename(srcPath, destItem)
                    filesDone++
                } catch (err: any) {
                    if (err.code === 'EXDEV') {
                        // Cross-device: copy then delete source
                        const copyCtx: CopyContext = {
                            copiedBytes: 0,
                            filesDone: 0,
                            errors: [],
                            ctx: {
                                progress: {report: (info) => ctx.progress.report({current_file: info.current_file, files_done: filesDone})},
                                confirm: ctx.confirm,
                                cancellation: ctx.cancellation,
                            },
                            followSymlinks: false,
                        }
                        await copyItem(srcPath, destItem, baseName, copyCtx)
                        if (copyCtx.errors.length === 0) {
                            await fs.rm(srcPath, {recursive: true})
                            filesDone++
                        } else {
                            errors.push(...copyCtx.errors)
                        }
                    } else {
                        errors.push({file: baseName, reason: err.message})
                    }
                }
            }
        } catch (err) {
            if (!(err instanceof AbortError)) throw err
        }

        return {ok: true, files_done: filesDone, errors}
    }

    async mkdir(dirPath: string): Promise<MkdirResult> {
        const resolved = path.resolve(dirPath)
        try {
            await fs.mkdir(resolved)
            return {ok: true, path: resolved}
        } catch (err: any) {
            if (err.code === 'EEXIST') {
                return {ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: `Already exists: ${path.basename(dirPath)}`}}
            }
            if (err.code === 'ENOENT') {
                return {ok: false, error: {code: ErrorCode.DESTINATION_NOT_FOUND, message: `Parent directory not found: ${dirPath}`}}
            }
            if (err.code === 'EACCES' || err.code === 'EPERM') {
                return {ok: false, error: {code: ErrorCode.PERMISSION_DENIED, message: `Permission denied: ${dirPath}`}}
            }
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }
    }

    async delete(paths: string[], ctx: DeleteContext): Promise<DeleteResult> {
        let deleted = 0
        for (const p of paths) {
            if (ctx.cancellation.cancelled) break
            const resolved = path.resolve(p)
            ctx.progress.report({deleted, current: path.basename(resolved)})
            try {
                await fs.rm(resolved, {recursive: true, force: false})
                deleted++
            } catch (err: any) {
                return {ok: false, error: {code: mapNodeError(err.code), message: err.message}}
            }
        }
        return {ok: true, deleted}
    }

    async rename(filePath: string, newName: string): Promise<RenameResult> {
        if (!newName || newName === '.' || newName === '..') {
            return {ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'Invalid file name'}}
        }
        if (newName.includes('/') || newName.includes('\\') || newName.includes('\0')) {
            return {ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'File name contains invalid characters'}}
        }
        if (Buffer.byteLength(newName, 'utf8') > 255) {
            return {ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'File name is too long'}}
        }

        const resolved = path.resolve(filePath)
        const newPath = path.join(path.dirname(resolved), newName)

        try {
            await fs.stat(resolved)
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                return {ok: false, error: {code: ErrorCode.NOT_FOUND, message: `'${path.basename(resolved)}' not found`}}
            }
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }

        try {
            await fs.stat(newPath)
            return {ok: false, error: {code: ErrorCode.ALREADY_EXISTS, message: `'${newName}' already exists`}}
        } catch (err: any) {
            if (err.code !== 'ENOENT') {
                return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
            }
        }

        try {
            await fs.rename(resolved, newPath)
            return {ok: true}
        } catch (err: any) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }
    }
}

async function copyItem(src: string, dest: string, relPath: string, copyCtx: CopyContext): Promise<void> {
    if (copyCtx.ctx.cancellation.cancelled) return

    const srcStat = copyCtx.followSymlinks ? await fs.stat(src) : await fs.lstat(src)

    // When followSymlinks is true, fs.stat() follows symlinks so isSymbolicLink() is always false.
    // This branch only runs when followSymlinks is false (lstat preserves symlink info).
    if (srcStat.isSymbolicLink()) {
        const target = await fs.readlink(src)

        copyCtx.ctx.progress.report({
            copied_bytes: copyCtx.copiedBytes,
            current_file: relPath,
            files_done: copyCtx.filesDone,
        })

        let destExists = false
        try {
            await fs.lstat(dest)
            destExists = true
        } catch {
            // dest doesn't exist
        }

        if (destExists) {
            const action = await copyCtx.ctx.confirm.ask({
                confirm_type: 'file_exists',
                message: `File already exists: ${dest}`,
                source: src,
                destination: dest,
            })
            if (action === 'abort') throw new AbortError()
            if (action === 'skip') {
                copyCtx.errors.push({file: relPath, reason: 'skipped_by_user'})
                return
            }
            await fs.unlink(dest)
        }

        try {
            await fs.symlink(target, dest)
            copyCtx.filesDone++
        } catch (err: any) {
            copyCtx.errors.push({file: relPath, reason: err.message})
        }
        return
    }

    if (srcStat.isDirectory()) {
        await fs.mkdir(dest, {recursive: true})
        const children = await fs.readdir(src)
        for (const child of children) {
            if (copyCtx.ctx.cancellation.cancelled) return
            await copyItem(path.join(src, child), path.join(dest, child), relPath + '/' + child, copyCtx)
        }
        return
    }

    copyCtx.ctx.progress.report({
        copied_bytes: copyCtx.copiedBytes,
        current_file: relPath,
        files_done: copyCtx.filesDone,
    })

    // Try exclusive copy first to avoid TOCTOU race between stat check and copyFile.
    // If dest already exists, COPYFILE_EXCL causes EEXIST and we ask the user.
    try {
        await fs.copyFile(src, dest, constants.COPYFILE_EXCL)
        copyCtx.copiedBytes += srcStat.size
        copyCtx.filesDone++
    } catch (err: any) {
        if (err.code === 'EEXIST') {
            const action = await copyCtx.ctx.confirm.ask({
                confirm_type: 'file_exists',
                message: `File already exists: ${dest}`,
                source: src,
                destination: dest,
            })
            if (action === 'abort') throw new AbortError()
            if (action === 'skip') {
                copyCtx.errors.push({file: relPath, reason: 'skipped_by_user'})
                return
            }
            // overwrite: copy without EXCL flag
            try {
                await fs.copyFile(src, dest)
                copyCtx.copiedBytes += srcStat.size
                copyCtx.filesDone++
            } catch (overwriteErr: any) {
                copyCtx.errors.push({file: relPath, reason: overwriteErr.message})
            }
        } else if (err.code === 'EACCES') {
            const action = await copyCtx.ctx.confirm.ask({
                confirm_type: 'permission_denied',
                message: `Permission denied: ${dest}`,
                source: src,
                destination: dest,
            })
            if (action === 'abort') throw new AbortError()
            copyCtx.errors.push({file: relPath, reason: 'skipped_by_user'})
        } else {
            copyCtx.errors.push({file: relPath, reason: err.message})
        }
    }
}

async function toEntry(dir: string, de: Dirent): Promise<FSEntry> {
    const fullPath = path.join(dir, de.name)
    const info = await fs.lstat(fullPath)

    let type: FSEntry['type'] = 'file'
    if (de.isDirectory()) type = 'directory'
    else if (de.isSymbolicLink()) type = 'symlink'

    let symlinkTarget: string | null = null
    if (de.isSymbolicLink()) {
        try {
            symlinkTarget = await fs.readlink(fullPath)
        } catch {
            // ignore
        }
    }

    let extension: string | null = null
    if (type === 'file' || type === 'symlink') {
        const ext = path.extname(de.name).slice(1)
        if (ext) extension = ext
    }

    const size = type === 'directory' ? 0 : info.size
    const mode = info.mode & 0o777
    const permissions = formatPermissions(mode)

    return {
        name: de.name,
        type,
        size,
        modified: info.mtime.toISOString(),
        permissions,
        extension,
        hidden: de.name.startsWith('.'),
        symlink_target: symlinkTarget,
    }
}

function mapNodeError(code: string | undefined): ErrorCode {
    switch (code) {
        case 'ENOENT': return ErrorCode.NOT_FOUND
        case 'EACCES':
        case 'EPERM': return ErrorCode.PERMISSION_DENIED
        case 'ENOTDIR': return ErrorCode.NOT_A_DIRECTORY
        default: return ErrorCode.INTERNAL
    }
}

function formatPermissions(mode: number): string {
    const chars = 'rwx'
    let result = ''
    for (let i = 8; i >= 0; i--) {
        result += mode & (1 << i) ? chars[2 - (i % 3)] : '-'
    }
    return result
}
