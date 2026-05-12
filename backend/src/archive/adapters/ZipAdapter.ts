import * as yauzl from 'yauzl-promise'
import yazl from 'yazl'
import fsp from 'node:fs/promises'
import {createWriteStream} from 'node:fs'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'
import type {FSEntry} from '../../protocol/fs-types.js'
import type {ArchiveAdapter, ExtractOptions} from '../ArchiveAdapter.js'
import type {CreatableAdapter, PackOptions} from '../CreatableAdapter.js'
import {addImplicitDirs} from '../implicitDirs.js'
import {entryBaseName, entryExtension, buildExtractPlan, stripSlashes, makeTmpPath} from '../pathUtils.js'
import {collectFiles} from './7z-fs-utils.js'

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
                        symlink_target_type: null,
                    })
                } else {
                    const baseName = entryBaseName(fileName)
                    entries.push({
                        name: fileName,
                        type: 'file',
                        size: entry.uncompressedSize,
                        modified: decodeDosDateTime(entry.lastModDate, (entry as any).lastModTime).toISOString(),
                        permissions: '-rw-r--r--',
                        extension: entryExtension(baseName),
                        hidden: baseName.startsWith('.'),
                        symlink_target: null,
                        symlink_target_type: null,
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
        const newZip = new yazl.ZipFile()

        // Copy existing entries
        await copyZipEntries(archivePath, newZip)

        // Add new files
        let filesDone = 0
        let bytesWritten = 0
        const prefix = innerDestPath ? innerDestPath + '/' : ''

        for (const src of sourcePaths) {
            if (options.cancelled()) break
            const baseName = path.basename(src)
            const stat = await fsp.stat(src)

            if (stat.isDirectory()) {
                const files = await collectFiles(src)
                for (const f of files) {
                    if (options.cancelled()) break
                    const entryName = prefix + f.relativePath.replace(/\\/g, '/')
                    const absPath = path.join(path.dirname(src), f.relativePath)
                    newZip.addFile(absPath, entryName)
                    filesDone++
                    bytesWritten += f.size
                    options.onProgress({currentFile: entryName, filesDone, bytesWritten})
                }
            } else {
                const entryName = prefix + baseName
                newZip.addFile(src, entryName)
                filesDone++
                bytesWritten += stat.size
                options.onProgress({currentFile: entryName, filesDone, bytesWritten})
            }
        }

        newZip.end()
        const tmpPath = makeTmpPath(archivePath)
        await pipeline(newZip.outputStream, createWriteStream(tmpPath))
        await fsp.rename(tmpPath, archivePath)

        return {filesDone, bytesWritten}
    }

    async create(archivePath: string, sourcePaths: string[], options: PackOptions): Promise<{filesDone: number; bytesWritten: number; skipped: number}> {
        // Collect all files for progress tracking
        const allFiles: {absolutePath: string; archiveName: string; size: number}[] = []
        for (const src of sourcePaths) {
            const files = await collectFiles(src)
            for (const f of files) {
                allFiles.push({
                    absolutePath: path.join(path.dirname(src), f.relativePath),
                    archiveName: f.relativePath,
                    size: f.size,
                })
            }
        }

        if (options.cancelled()) return {filesDone: 0, bytesWritten: 0, skipped: 0}

        const zipfile = new yazl.ZipFile()
        let filesDone = 0
        let bytesWritten = 0

        for (const file of allFiles) {
            if (options.cancelled()) break
            // Use forward slashes for zip entry names
            const entryName = file.archiveName.replace(/\\/g, '/')
            zipfile.addFile(file.absolutePath, entryName)
            filesDone++
            bytesWritten += file.size
            options.onProgress({currentFile: entryName, filesDone, bytesWritten})
        }

        zipfile.end()

        await pipeline(zipfile.outputStream, createWriteStream(archivePath))

        if (options.cancelled()) {
            await fsp.rm(archivePath, {force: true}).catch(() => {})
        }

        return {filesDone, bytesWritten, skipped: 0}
    }

    async deleteEntries(archivePath: string, innerPaths: string[]): Promise<{deleted: number}> {
        // Build set of paths to delete (including children of directories)
        const deleteSet = new Set<string>()
        for (const p of innerPaths) {
            deleteSet.add(p)
            deleteSet.add(p + '/') // directory entry variant
        }

        const newZip = new yazl.ZipFile()
        const zip = await yauzl.open(archivePath)
        let deleted = 0

        try {
            for await (const entry of zip) {
                const name: string = entry.filename
                const cleanName = name.endsWith('/') ? name.slice(0, -1) : name

                // Skip if this entry or any parent is in the delete set
                if (deleteSet.has(cleanName) || deleteSet.has(name) ||
                    innerPaths.some(p => cleanName.startsWith(p + '/'))) {
                    deleted++
                    continue
                }

                if (name.endsWith('/')) {
                    newZip.addEmptyDirectory(name)
                } else {
                    const buf = await readEntryBuffer(entry)
                    newZip.addBuffer(buf, name)
                }
            }
        } finally {
            await zip.close()
        }

        newZip.end()
        const tmpPath = makeTmpPath(archivePath)
        await pipeline(newZip.outputStream, createWriteStream(tmpPath))
        await fsp.rename(tmpPath, archivePath)

        return {deleted}
    }

    async mkdirEntry(archivePath: string, innerPath: string): Promise<void> {
        const dirEntry = stripSlashes(innerPath) + '/'

        const newZip = new yazl.ZipFile()
        await copyZipEntries(archivePath, newZip)
        newZip.addEmptyDirectory(dirEntry)
        newZip.end()

        const tmpPath = makeTmpPath(archivePath)
        await pipeline(newZip.outputStream, createWriteStream(tmpPath))
        await fsp.rename(tmpPath, archivePath)
    }

    isReadonly(_archivePath: string): boolean {
        return false
    }

    async renameEntry(archivePath: string, oldInnerPath: string, newInnerPath: string): Promise<void> {
        const oldStripped = stripSlashes(oldInnerPath)
        const newStripped = stripSlashes(newInnerPath)
        if (!oldStripped) throw new Error('renameEntry: empty source path')
        if (!newStripped) throw new Error('renameEntry: empty destination path')

        let sourceExists = false
        let destClash = false
        {
            const zip = await yauzl.open(archivePath)
            try {
                for await (const entry of zip) {
                    const n: string = entry.filename
                    const clean = n.endsWith('/') ? n.slice(0, -1) : n
                    if (clean === oldStripped || clean.startsWith(oldStripped + '/')) sourceExists = true
                    if (clean === newStripped || clean.startsWith(newStripped + '/')) destClash = true
                }
            } finally {
                await zip.close()
            }
        }
        if (!sourceExists) throw new Error(`renameEntry: source not found: ${oldStripped}`)
        if (destClash) throw new Error(`renameEntry: destination already exists: ${newStripped}`)

        const newZip = new yazl.ZipFile()
        const zip = await yauzl.open(archivePath)
        try {
            for await (const entry of zip) {
                const name: string = entry.filename
                const isDirEntry = name.endsWith('/')
                const clean = isDirEntry ? name.slice(0, -1) : name

                let outName = name
                if (clean === oldStripped) {
                    outName = isDirEntry ? newStripped + '/' : newStripped
                } else if (clean.startsWith(oldStripped + '/')) {
                    outName = newStripped + clean.slice(oldStripped.length) + (isDirEntry ? '/' : '')
                }

                if (isDirEntry) {
                    newZip.addEmptyDirectory(outName)
                } else {
                    const buf = await readEntryBuffer(entry)
                    newZip.addBuffer(buf, outName)
                }
            }
        } finally {
            await zip.close()
        }

        newZip.end()
        const tmpPath = makeTmpPath(archivePath)
        await pipeline(newZip.outputStream, createWriteStream(tmpPath))
        await fsp.rename(tmpPath, archivePath)
    }

    async replaceEntry(archivePath: string, innerPath: string, sourcePath: string): Promise<void> {
        const target = stripSlashes(innerPath)
        if (!target) throw new Error('replaceEntry: empty inner path')

        let targetIsFile = false
        let targetExists = false
        {
            const zip = await yauzl.open(archivePath)
            try {
                for await (const entry of zip) {
                    const n: string = entry.filename
                    const isDirEntry = n.endsWith('/')
                    const clean = isDirEntry ? n.slice(0, -1) : n
                    if (clean === target) {
                        targetExists = true
                        targetIsFile = !isDirEntry
                        break
                    }
                    if (clean.startsWith(target + '/')) {
                        targetExists = true
                        targetIsFile = false
                    }
                }
            } finally {
                await zip.close()
            }
        }
        if (!targetExists) throw new Error(`replaceEntry: entry not found: ${target}`)
        if (!targetIsFile) throw new Error(`replaceEntry: entry is a directory: ${target}`)

        const newContent = await fsp.readFile(sourcePath)

        const newZip = new yazl.ZipFile()
        const zip = await yauzl.open(archivePath)
        try {
            for await (const entry of zip) {
                const n: string = entry.filename
                const isDirEntry = n.endsWith('/')
                const clean = isDirEntry ? n.slice(0, -1) : n
                if (isDirEntry) {
                    newZip.addEmptyDirectory(n)
                } else if (clean === target) {
                    newZip.addBuffer(newContent, n)
                } else {
                    const buf = await readEntryBuffer(entry)
                    newZip.addBuffer(buf, n)
                }
            }
        } finally {
            await zip.close()
        }

        newZip.end()
        const tmpPath = makeTmpPath(archivePath)
        await pipeline(newZip.outputStream, createWriteStream(tmpPath))
        await fsp.rename(tmpPath, archivePath)
    }
}

/** Read a yauzl entry fully into a buffer. */
async function readEntryBuffer(entry: yauzl.Entry): Promise<Buffer> {
    const stream = await entry.openReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
        chunks.push(chunk as Buffer)
    }
    return Buffer.concat(chunks)
}

/** Copy all entries from an existing zip into a new yazl ZipFile. */
async function copyZipEntries(archivePath: string, newZip: yazl.ZipFile): Promise<void> {
    const zip = await yauzl.open(archivePath)
    try {
        for await (const entry of zip) {
            if (entry.filename.endsWith('/')) {
                newZip.addEmptyDirectory(entry.filename)
            } else {
                const buf = await readEntryBuffer(entry)
                newZip.addBuffer(buf, entry.filename)
            }
        }
    } finally {
        await zip.close()
    }
}