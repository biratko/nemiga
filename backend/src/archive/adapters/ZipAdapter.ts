import * as yauzl from 'yauzl-promise'
import fsp from 'node:fs/promises'
import {createWriteStream} from 'node:fs'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'
import type {FSEntry} from '../../protocol/fs-types.js'
import type {ArchiveAdapter, ExtractOptions} from '../ArchiveAdapter.js'
import type {CreatableAdapter, PackOptions} from '../CreatableAdapter.js'
import {createWith7z} from './createWith7z.js'
import {addImplicitDirs} from '../implicitDirs.js'
import {addWith7z} from './addWith7z.js'
import {deleteWith7z, mkdirWith7z} from './deleteWith7z.js'
import {buildExtractPlan} from '../pathUtils.js'

function decodeDosDateTime(date: number, time: number): Date {
    const day = date & 0x1f
    const month = ((date >> 5) & 0xf) - 1
    const year = ((date >> 9) & 0x7f) + 1980
    const sec = (time & 0x1f) * 2
    const min = (time >> 5) & 0x3f
    const hour = (time >> 11) & 0x1f
    return new Date(year, month, day, hour, min, sec)
}

export class ZipAdapter implements CreatableAdapter {
    readonly extensions = ['.zip', '.jar', '.war']

    async listEntries(archivePath: string): Promise<FSEntry[]> {
        const zip = await yauzl.open(archivePath)
        const entries: FSEntry[] = []
        const seenDirs = new Set<string>()

        try {
            for await (const entry of zip) {
                const fileName: string = entry.filename
                if (fileName.endsWith('/')) {
                    const name = fileName.slice(0, -1)
                    seenDirs.add(name)
                    entries.push({
                        name,
                        type: 'directory',
                        size: 0,
                        modified: decodeDosDateTime(entry.lastModDate, (entry as any).lastModTime).toISOString(),
                        permissions: 'drwxr-xr-x',
                        extension: null,
                        hidden: name.startsWith('.'),
                        symlink_target: null,
                    })
                } else {
                    const ext = fileName.includes('.') ? fileName.split('.').pop()! : null
                    entries.push({
                        name: fileName,
                        type: 'file',
                        size: entry.uncompressedSize,
                        modified: decodeDosDateTime(entry.lastModDate, (entry as any).lastModTime).toISOString(),
                        permissions: '-rw-r--r--',
                        extension: ext,
                        hidden: fileName.split('/').pop()!.startsWith('.'),
                        symlink_target: null,
                    })
                }
            }
        } finally {
            await zip.close()
        }

        // Add implicit directories (entries like "dir/file.txt" without explicit "dir/" entry)
        for (const entry of [...entries]) {
            if (entry.type === 'file') {
                addImplicitDirs(entry.name, entry.modified, seenDirs, entries)
            }
        }

        return entries
    }

    async extract(archivePath: string, innerPaths: string[], destDir: string, options: ExtractOptions): Promise<{filesDone: number; bytesWritten: number}> {
        // Build a set of paths to extract and all their children
        // innerPaths may be directories — we need to extract everything under them
        const allEntries = await this.listEntries(archivePath)
        const toExtract = buildExtractPlan(allEntries, innerPaths)

        // Sort: directories first so we create them before extracting files into them
        toExtract.sort((a, b) => {
            if (a.type === 'directory' && b.type !== 'directory') return -1
            if (a.type !== 'directory' && b.type === 'directory') return 1
            return a.relativeName.localeCompare(b.relativeName)
        })

        // Create directories
        for (const item of toExtract) {
            if (options.cancelled()) break
            if (item.type === 'directory') {
                await fsp.mkdir(path.join(destDir, item.relativeName), {recursive: true})
            }
        }

        // Extract files
        let filesDone = 0
        let bytesWritten = 0
        const zip = await yauzl.open(archivePath)

        try {
            const filesToExtract = new Map<string, string>()
            for (const item of toExtract) {
                if (item.type !== 'directory') {
                    filesToExtract.set(item.archiveName, item.relativeName)
                }
            }

            for await (const entry of zip) {
                if (options.cancelled()) break
                const fileName: string = entry.filename
                // Skip directory entries
                if (fileName.endsWith('/')) continue

                const relativeName = filesToExtract.get(fileName)
                if (!relativeName) continue

                const destPath = path.join(destDir, relativeName)
                // Ensure parent directory exists
                await fsp.mkdir(path.dirname(destPath), {recursive: true})

                const readStream = await entry.openReadStream()
                const writeStream = createWriteStream(destPath)

                let entryBytes = 0
                readStream.on('data', (chunk: Buffer) => {
                    entryBytes += chunk.length
                    bytesWritten += chunk.length
                    options.onProgress({
                        currentFile: relativeName,
                        bytesWritten,
                        filesDone,
                    })
                })

                await pipeline(readStream, writeStream)
                filesDone++
                options.onProgress({currentFile: relativeName, bytesWritten, filesDone})
            }
        } finally {
            await zip.close()
        }

        return {filesDone, bytesWritten}
    }

    async add(archivePath: string, innerDestPath: string, sourcePaths: string[], options: ExtractOptions): Promise<{filesDone: number; bytesWritten: number}> {
        return addWith7z(archivePath, innerDestPath, sourcePaths, options)
    }

    async create(archivePath: string, sourcePaths: string[], options: PackOptions): Promise<{filesDone: number; bytesWritten: number; skipped: number}> {
        return createWith7z(archivePath, sourcePaths, options)
    }

    async deleteEntries(archivePath: string, innerPaths: string[]): Promise<{deleted: number}> {
        return deleteWith7z(archivePath, innerPaths)
    }

    async mkdirEntry(archivePath: string, innerPath: string): Promise<void> {
        return mkdirWith7z(archivePath, innerPath)
    }
}