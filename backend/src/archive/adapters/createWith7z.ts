// backend/src/archive/adapters/createWith7z.ts
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import {createReadStream, createWriteStream} from 'node:fs'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'
import type {PackOptions} from '../CreatableAdapter.js'
import {run7z} from './7z-utils.js'
import {collectFiles, copyDir} from './7z-fs-utils.js'

export async function createWith7z(
    archivePath: string,
    sourcePaths: string[],
    options: PackOptions,
): Promise<{filesDone: number; bytesWritten: number; skipped: number}> {
    const tmpDir = path.dirname(archivePath) + '/.tacom-pack-' + crypto.randomUUID()

    try {
        // Collect all files for progress tracking
        const allFiles: {relativePath: string; size: number}[] = []
        for (const src of sourcePaths) {
            const files = await collectFiles(src)
            allFiles.push(...files)
        }

        if (options.cancelled()) return {filesDone: 0, bytesWritten: 0, skipped: 0}

        // Stage files into temp directory
        for (const src of sourcePaths) {
            const baseName = path.basename(src)
            const stageDest = path.join(tmpDir, baseName)

            const stat = await fsp.stat(src)
            if (stat.isDirectory()) {
                await copyDir(src, stageDest)
            } else {
                await fsp.mkdir(path.dirname(stageDest), {recursive: true})
                await pipeline(createReadStream(src), createWriteStream(stageDest))
            }
        }

        if (options.cancelled()) return {filesDone: 0, bytesWritten: 0, skipped: 0}

        // Build list of top-level items to add
        const relPaths = sourcePaths.map(src => path.basename(src))

        // Create archive
        await run7z(['a', '-y', archivePath, ...relPaths], tmpDir)

        // Report final progress
        let bytesWritten = 0
        for (const f of allFiles) {
            bytesWritten += f.size
        }
        options.onProgress({
            currentFile: allFiles[allFiles.length - 1]?.relativePath ?? '',
            bytesWritten,
            filesDone: allFiles.length,
        })

        return {filesDone: allFiles.length, bytesWritten, skipped: 0}
    } finally {
        await fsp.rm(tmpDir, {recursive: true, force: true}).catch(() => {})
        // If cancelled, also remove partial archive
        if (options.cancelled()) {
            await fsp.rm(archivePath, {force: true}).catch(() => {})
        }
    }
}
