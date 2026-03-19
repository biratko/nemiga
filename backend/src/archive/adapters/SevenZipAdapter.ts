import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type {FSEntry} from '../../protocol/fs-types.js'
import type {ArchiveAdapter, ExtractOptions} from '../ArchiveAdapter.js'
import type {CreatableAdapter, PackOptions} from '../CreatableAdapter.js'
import {createWith7z} from './createWith7z.js'
import {addImplicitDirs} from '../implicitDirs.js'
import {run7z, run7zCapture} from './7z-utils.js'
import {addWith7z} from './addWith7z.js'
import {deleteWith7z, mkdirWith7z} from './deleteWith7z.js'
import {buildExtractPlan} from '../pathUtils.js'

interface ParsedEntry {
    name: string
    isDir: boolean
    size: number
    modified: string
    permissions: string
}

function parse7zList(output: string): ParsedEntry[] {
    const entries: ParsedEntry[] = []
    const lines = output.split('\n')

    // Find the separator line that starts the file listing
    let inListing = false
    for (const line of lines) {
        if (line.startsWith('---')) {
            inListing = !inListing
            continue
        }
        if (!inListing) continue

        // Format: "Date      Time    Attr         Size   Compressed  Name"
        // Example: "2026-03-09 14:43:44 ....A            6            6  test.txt"
        // Example: "2026-03-09 14:43:44 D....            0            0  subdir"
        const match = line.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([A-Za-z.]{5})\s+(\d+)\s+\d+\s+(.+)$/)
        if (!match) continue

        const [, date, time, attr, sizeStr, name] = match
        const isDir = attr.includes('D')
        const cleanName = name.replace(/\\/g, '/').replace(/\/+$/, '')
        if (!cleanName) continue

        entries.push({
            name: cleanName,
            isDir,
            size: parseInt(sizeStr, 10),
            modified: new Date(`${date}T${time}`).toISOString(),
            permissions: isDir ? 'drwxr-xr-x' : '-rw-r--r--',
        })
    }

    return entries
}


export class SevenZipAdapter implements CreatableAdapter {
    readonly extensions = ['.7z', '.rar']

    async listEntries(archivePath: string): Promise<FSEntry[]> {
        const {stdout} = await run7zCapture(['l', '-slt', archivePath])

        // -slt gives technical listing with "Path = ..." etc.
        const entries: FSEntry[] = []
        const seenDirs = new Set<string>()
        const blocks = stdout.split(/\n\n+/)

        for (const block of blocks) {
            const fields = new Map<string, string>()
            for (const line of block.split('\n')) {
                const eq = line.indexOf(' = ')
                if (eq >= 0) {
                    fields.set(line.slice(0, eq).trim(), line.slice(eq + 3).trim())
                }
            }

            const name = fields.get('Path')
            if (!name || name === archivePath) continue

            const cleanName = name.replace(/\\/g, '/').replace(/\/+$/, '')
            if (!cleanName) continue

            const attr = fields.get('Attributes') ?? ''
            const isDir = attr.startsWith('D') || attr.includes('D')
            const size = parseInt(fields.get('Size') ?? '0', 10) || 0
            const modStr = fields.get('Modified') ?? ''
            const modified = modStr ? new Date(modStr.replace(' ', 'T')).toISOString() : new Date(0).toISOString()

            if (isDir) {
                if (!seenDirs.has(cleanName)) {
                    seenDirs.add(cleanName)
                    entries.push({
                        name: cleanName,
                        type: 'directory',
                        size: 0,
                        modified,
                        permissions: 'drwxr-xr-x',
                        extension: null,
                        hidden: cleanName.split('/').pop()!.startsWith('.'),
                        symlink_target: null,
                    })
                }
            } else {
                const baseName = cleanName.split('/').pop()!
                const ext = baseName.includes('.') ? baseName.split('.').pop()! : null
                entries.push({
                    name: cleanName,
                    type: 'file',
                    size,
                    modified,
                    permissions: '-rw-r--r--',
                    extension: ext,
                    hidden: baseName.startsWith('.'),
                    symlink_target: null,
                })
            }

            // Add implicit parent directories
            addImplicitDirs(cleanName, modified, seenDirs, entries)
        }

        return entries
    }

    async extract(archivePath: string, innerPaths: string[], destDir: string, options: ExtractOptions): Promise<{filesDone: number; bytesWritten: number}> {
        // Build list of entries to extract (expand directories)
        const allEntries = await this.listEntries(archivePath)
        const toExtract = buildExtractPlan(allEntries, innerPaths)

        if (toExtract.length === 0 || options.cancelled()) {
            return {filesDone: 0, bytesWritten: 0}
        }

        // Use 7z to extract specific files to a temp directory, then move them
        // We extract to a temp dir first to handle the renaming (basename extraction)
        const tmpDir = destDir + '/.tacom-extract-' + crypto.randomUUID()
        try {
            const archiveNames = toExtract.map(e => e.archiveName)
            await run7z(['x', '-y', `-o${tmpDir}`, archivePath, ...archiveNames])

            // Move extracted files to final destination with correct relative names
            let filesDone = 0
            let bytesWritten = 0

            for (const item of toExtract) {
                if (options.cancelled()) break
                const srcPath = path.join(tmpDir, item.archiveName)
                const destPath = path.join(destDir, item.relativeName)

                if (item.type === 'directory') {
                    await fsp.mkdir(destPath, {recursive: true})
                } else {
                    await fsp.mkdir(path.dirname(destPath), {recursive: true})
                    try {
                        await fsp.rename(srcPath, destPath)
                    } catch {
                        // Cross-device: copy + delete
                        await fsp.copyFile(srcPath, destPath)
                        await fsp.unlink(srcPath)
                    }
                    bytesWritten += item.size
                    filesDone++
                    options.onProgress({currentFile: item.relativeName, bytesWritten, filesDone})
                }
            }

            return {filesDone, bytesWritten}
        } finally {
            // Cleanup temp directory
            await fsp.rm(tmpDir, {recursive: true, force: true}).catch(() => {})
        }
    }

    async add(archivePath: string, innerDestPath: string, sourcePaths: string[], options: ExtractOptions): Promise<{filesDone: number; bytesWritten: number}> {
        return addWith7z(archivePath, innerDestPath, sourcePaths, options)
    }

    async create(archivePath: string, sourcePaths: string[], options: PackOptions): Promise<{filesDone: number; bytesWritten: number; skipped: number}> {
        if (archivePath.toLowerCase().endsWith('.rar')) {
            throw new Error('Creating .rar archives is not supported')
        }
        return createWith7z(archivePath, sourcePaths, options)
    }

    async deleteEntries(archivePath: string, innerPaths: string[]): Promise<{deleted: number}> {
        return deleteWith7z(archivePath, innerPaths)
    }

    async mkdirEntry(archivePath: string, innerPath: string): Promise<void> {
        return mkdirWith7z(archivePath, innerPath)
    }
}
