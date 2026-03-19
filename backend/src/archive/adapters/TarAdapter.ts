import crypto from 'node:crypto'
import {createReadStream} from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {createGunzip, createGzip} from 'node:zlib'
import {createBunzip2} from './bz2.js'
import {createBzip2} from './bz2.js'
import {pipeline} from 'node:stream/promises'
import {createWriteStream} from 'node:fs'
import * as tar from 'tar-stream'
import type {FSEntry} from '../../protocol/fs-types.js'
import type {ArchiveAdapter, ExtractOptions} from '../ArchiveAdapter.js'
import type {CreatableAdapter, PackOptions} from '../CreatableAdapter.js'
import {addImplicitDirs} from '../implicitDirs.js'
import {stripSlashes} from '../pathUtils.js'

type Compression = 'none' | 'gzip' | 'bzip2'

function detectCompression(archivePath: string): Compression {
    const lower = archivePath.toLowerCase()
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'gzip'
    if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2')) return 'bzip2'
    return 'none'
}

function createDecompressStream(compression: Compression) {
    if (compression === 'gzip') return createGunzip()
    if (compression === 'bzip2') return createBunzip2()
    return null
}

function createCompressStream(compression: Compression) {
    if (compression === 'gzip') return createGzip()
    if (compression === 'bzip2') return createBzip2()
    return null
}

export class TarAdapter implements CreatableAdapter {
    readonly extensions = ['.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2']

    async listEntries(archivePath: string): Promise<FSEntry[]> {
        const entries: FSEntry[] = []
        const seenDirs = new Set<string>()
        const extract = tar.extract()

        extract.on('entry', (header, stream, next) => {
            const name = header.name.replace(/\/+$/, '')
            if (!name) {
                stream.resume()
                next()
                return
            }

            const isDir = header.type === 'directory'
            const modified = header.mtime ? header.mtime.toISOString() : new Date(0).toISOString()
            const mode = header.mode ?? 0
            const permissions = isDir
                ? 'd' + formatMode(mode)
                : formatMode(mode)

            if (isDir) {
                if (!seenDirs.has(name)) {
                    seenDirs.add(name)
                    entries.push({
                        name,
                        type: 'directory',
                        size: 0,
                        modified,
                        permissions,
                        extension: null,
                        hidden: name.split('/').pop()!.startsWith('.'),
                        symlink_target: null,
                    })
                }
            } else {
                const baseName = name.split('/').pop()!
                const ext = baseName.includes('.') ? baseName.split('.').pop()! : null
                entries.push({
                    name,
                    type: header.type === 'symlink' ? 'symlink' : 'file',
                    size: header.size ?? 0,
                    modified,
                    permissions,
                    extension: ext,
                    hidden: baseName.startsWith('.'),
                    symlink_target: header.type === 'symlink' ? (header.linkname ?? null) : null,
                })
            }

            // Add implicit parent directories
            addImplicitDirs(name, modified, seenDirs, entries)

            stream.resume()
            next()
        })

        const compression = detectCompression(archivePath)
        const fileStream = createReadStream(archivePath)
        const decompressor = createDecompressStream(compression)

        if (decompressor) {
            await pipeline(fileStream, decompressor, extract)
        } else {
            await pipeline(fileStream, extract)
        }

        return entries
    }

    async extract(archivePath: string, innerPaths: string[], destDir: string, options: ExtractOptions): Promise<{filesDone: number; bytesWritten: number}> {
        // Build lookup: for each innerPath, collect entries to extract
        const allEntries = await this.listEntries(archivePath)
        const toExtract = new Map<string, string>() // zipName -> relativeName

        for (const innerPath of innerPaths) {
            for (const entry of allEntries) {
                if (entry.name === innerPath) {
                    const baseName = innerPath.includes('/') ? innerPath.split('/').pop()! : innerPath
                    toExtract.set(entry.name, baseName)
                } else if (entry.name.startsWith(innerPath + '/')) {
                    const parentDir = innerPath.includes('/') ? innerPath.split('/').pop()! : innerPath
                    const relative = parentDir + entry.name.slice(innerPath.length)
                    toExtract.set(entry.name, relative)
                }
            }
        }

        let filesDone = 0
        let bytesWritten = 0

        const ext = tar.extract()

        ext.on('entry', (header, stream, next) => {
            const name = header.name.replace(/\/+$/, '')

            if (options.cancelled() || !toExtract.has(name)) {
                stream.resume()
                next()
                return
            }

            const relativeName = toExtract.get(name)!
            const destPath = path.join(destDir, relativeName)

            if (header.type === 'directory') {
                fsp.mkdir(destPath, {recursive: true}).then(() => {
                    stream.resume()
                    next()
                }).catch(() => {
                    stream.resume()
                    next()
                })
                return
            }

            if (header.type !== 'file') {
                stream.resume()
                next()
                return
            }

            fsp.mkdir(path.dirname(destPath), {recursive: true}).then(() => {
                const writeStream = createWriteStream(destPath)
                stream.on('data', (chunk: Buffer) => {
                    bytesWritten += chunk.length
                    options.onProgress({currentFile: relativeName, bytesWritten, filesDone})
                })
                stream.pipe(writeStream)
                writeStream.on('finish', () => {
                    filesDone++
                    options.onProgress({currentFile: relativeName, bytesWritten, filesDone})
                    next()
                })
                writeStream.on('error', () => {
                    next()
                })
            }).catch(() => {
                stream.resume()
                next()
            })
        })

        const compression = detectCompression(archivePath)
        const fileStream = createReadStream(archivePath)
        const decompressor = createDecompressStream(compression)

        if (decompressor) {
            await pipeline(fileStream, decompressor, ext)
        } else {
            await pipeline(fileStream, ext)
        }

        return {filesDone, bytesWritten}
    }

    async add(archivePath: string, innerDestPath: string, sourcePaths: string[], options: ExtractOptions): Promise<{filesDone: number; bytesWritten: number}> {
        const compression = detectCompression(archivePath)
        const tmpPath = archivePath + '.tacom-tmp-' + crypto.randomUUID()
        let filesDone = 0
        let bytesWritten = 0

        try {
            const pack = tar.pack()

            // 1. Start consuming pack into temp file immediately (prevents backpressure hang)
            const writeStream = createWriteStream(tmpPath)
            const compressor = createCompressStream(compression)
            const pipelineDone = compressor
                ? pipeline(pack, compressor, writeStream)
                : pipeline(pack, writeStream)

            // 2. Copy all existing entries into the new pack
            await new Promise<void>((resolve, reject) => {
                const ext = tar.extract()
                ext.on('entry', (header, stream, next) => {
                    stream.pipe(pack.entry(header, next))
                })
                ext.on('finish', () => resolve())
                ext.on('error', reject)

                const fileStream = createReadStream(archivePath)
                const decompressor = createDecompressStream(compression)
                if (decompressor) {
                    fileStream.pipe(decompressor).pipe(ext)
                } else {
                    fileStream.pipe(ext)
                }
            })

            // 3. Add new files
            for (const srcPath of sourcePaths) {
                if (options.cancelled()) break
                await this.packPath(pack, srcPath, innerDestPath, options, (added) => {
                    filesDone += added.files
                    bytesWritten += added.bytes
                })
            }

            // 4. Finalize and wait for output to flush
            pack.finalize()
            await pipelineDone

            // 5. Replace original
            await fsp.rename(tmpPath, archivePath)

            return {filesDone, bytesWritten}
        } finally {
            await fsp.rm(tmpPath, {force: true}).catch(() => {})
        }
    }

    async create(archivePath: string, sourcePaths: string[], options: PackOptions): Promise<{filesDone: number; bytesWritten: number; skipped: number}> {
        const compression = detectCompression(archivePath)
        const tmpPath = archivePath + '.tacom-tmp-' + crypto.randomUUID()
        let filesDone = 0
        let bytesWritten = 0
        let skipped = 0

        try {
            const pack = tar.pack()
            const writeStream = createWriteStream(tmpPath)
            const compressor = createCompressStream(compression)
            const pipelineDone = compressor
                ? pipeline(pack, compressor, writeStream)
                : pipeline(pack, writeStream)

            for (const srcPath of sourcePaths) {
                if (options.cancelled()) break
                try {
                    await this.packPath(pack, srcPath, '', options as unknown as ExtractOptions, (added) => {
                        filesDone += added.files
                        bytesWritten += added.bytes
                    })
                } catch {
                    skipped++
                }
            }

            pack.finalize()
            await pipelineDone

            await fsp.rename(tmpPath, archivePath)
            return {filesDone, bytesWritten, skipped}
        } finally {
            await fsp.rm(tmpPath, {force: true}).catch(() => {})
            if (options.cancelled()) {
                await fsp.rm(archivePath, {force: true}).catch(() => {})
            }
        }
    }

    private async packPath(
        pack: tar.Pack,
        srcPath: string,
        innerDestPath: string,
        options: ExtractOptions,
        onDone: (added: {files: number; bytes: number}) => void,
    ): Promise<void> {
        const baseName = path.basename(srcPath)
        const stat = await fsp.stat(srcPath)
        const entryName = innerDestPath ? innerDestPath + '/' + baseName : baseName

        if (stat.isDirectory()) {
            await this.packDir(pack, srcPath, entryName, options, onDone)
        } else {
            await this.packFile(pack, srcPath, entryName, stat.size, options)
            onDone({files: 1, bytes: stat.size})
        }
    }

    private packFile(pack: tar.Pack, filePath: string, entryName: string, size: number, options: ExtractOptions): Promise<void> {
        return new Promise((resolve, reject) => {
            const entry = pack.entry({name: entryName, size, mtime: new Date()}, (err) => {
                if (err) reject(err)
                else resolve()
            })
            const rs = createReadStream(filePath)
            rs.on('data', (chunk) => {
                options.onProgress({currentFile: entryName, bytesWritten: chunk.length, filesDone: 0})
            })
            rs.on('error', reject)
            rs.pipe(entry)
        })
    }

    private async packDir(
        pack: tar.Pack,
        dirPath: string,
        entryName: string,
        options: ExtractOptions,
        onDone: (added: {files: number; bytes: number}) => void,
    ): Promise<void> {
        // Add directory entry
        await new Promise<void>((resolve, reject) => {
            pack.entry({name: entryName + '/', type: 'directory', mtime: new Date()}, (err) => {
                if (err) reject(err)
                else resolve()
            })
        })

        const items = await fsp.readdir(dirPath, {withFileTypes: true})
        for (const item of items) {
            if (options.cancelled()) break
            const fullPath = path.join(dirPath, item.name)
            const childName = entryName + '/' + item.name

            if (item.isDirectory()) {
                await this.packDir(pack, fullPath, childName, options, onDone)
            } else {
                const st = await fsp.stat(fullPath)
                await this.packFile(pack, fullPath, childName, st.size, options)
                onDone({files: 1, bytes: st.size})
            }
        }
    }

    async deleteEntries(archivePath: string, innerPaths: string[]): Promise<{deleted: number}> {
        const compression = detectCompression(archivePath)
        const tmpPath = archivePath + '.tacom-tmp-' + crypto.randomUUID()

        // Build set of paths to skip (including children of directories)
        const allEntries = await this.listEntries(archivePath)
        const toDelete = new Set<string>()
        for (const innerPath of innerPaths) {
            for (const entry of allEntries) {
                if (entry.name === innerPath || entry.name.startsWith(innerPath + '/')) {
                    toDelete.add(entry.name)
                }
            }
        }

        try {
            const pack = tar.pack()

            const writeStream = createWriteStream(tmpPath)
            const compressor = createCompressStream(compression)
            const pipelineDone = compressor
                ? pipeline(pack, compressor, writeStream)
                : pipeline(pack, writeStream)

            await new Promise<void>((resolve, reject) => {
                const ext = tar.extract()
                ext.on('entry', (header, stream, next) => {
                    const name = header.name.replace(/\/+$/, '')
                    if (toDelete.has(name)) {
                        stream.resume()
                        next()
                    } else {
                        stream.pipe(pack.entry(header, next))
                    }
                })
                ext.on('finish', () => resolve())
                ext.on('error', reject)

                const fileStream = createReadStream(archivePath)
                const decompressor = createDecompressStream(compression)
                if (decompressor) {
                    fileStream.pipe(decompressor).pipe(ext)
                } else {
                    fileStream.pipe(ext)
                }
            })

            pack.finalize()
            await pipelineDone
            await fsp.rename(tmpPath, archivePath)

            return {deleted: toDelete.size}
        } finally {
            await fsp.rm(tmpPath, {force: true}).catch(() => {})
        }
    }

    async mkdirEntry(archivePath: string, innerPath: string): Promise<void> {
        const compression = detectCompression(archivePath)
        const tmpPath = archivePath + '.tacom-tmp-' + crypto.randomUUID()
        const normalized = stripSlashes(innerPath)

        try {
            const pack = tar.pack()

            const writeStream = createWriteStream(tmpPath)
            const compressor = createCompressStream(compression)
            const pipelineDone = compressor
                ? pipeline(pack, compressor, writeStream)
                : pipeline(pack, writeStream)

            // Copy existing entries
            await new Promise<void>((resolve, reject) => {
                const ext = tar.extract()
                ext.on('entry', (header, stream, next) => {
                    stream.pipe(pack.entry(header, next))
                })
                ext.on('finish', () => resolve())
                ext.on('error', reject)

                const fileStream = createReadStream(archivePath)
                const decompressor = createDecompressStream(compression)
                if (decompressor) {
                    fileStream.pipe(decompressor).pipe(ext)
                } else {
                    fileStream.pipe(ext)
                }
            })

            // Add directory entry
            await new Promise<void>((resolve, reject) => {
                pack.entry({name: normalized + '/', type: 'directory', mtime: new Date()}, (err) => {
                    if (err) reject(err)
                    else resolve()
                })
            })

            pack.finalize()
            await pipelineDone
            await fsp.rename(tmpPath, archivePath)
        } finally {
            await fsp.rm(tmpPath, {force: true}).catch(() => {})
        }
    }
}

function formatMode(mode: number): string {
    const chars = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
    const owner = chars[(mode >> 6) & 7] ?? '---'
    const group = chars[(mode >> 3) & 7] ?? '---'
    const other = chars[mode & 7] ?? '---'
    return owner + group + other
}
