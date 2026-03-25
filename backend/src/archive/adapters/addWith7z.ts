import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import {createReadStream, createWriteStream} from 'node:fs'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'
import type {ExtractOptions} from '../ArchiveAdapter.js'
import {run7z} from './7z-utils.js'
import {collectFiles, copyDir} from './7z-fs-utils.js'

export async function addWith7z(
    archivePath: string,
    innerDestPath: string,
    sourcePaths: string[],
    options: ExtractOptions,
): Promise<{filesDone: number; bytesWritten: number}> {
    const tmpDir = path.dirname(archivePath) + '/.tacom-add-' + crypto.randomUUID()

    try {
        // Collect all files for progress tracking
        const allFiles: {relativePath: string; size: number}[] = []
        for (const src of sourcePaths) {
            const files = await collectFiles(src)
            // Prefix with innerDestPath if we're adding to a subdirectory
            for (const f of files) {
                const innerPath = innerDestPath
                    ? innerDestPath + '/' + f.relativePath
                    : f.relativePath
                allFiles.push({relativePath: innerPath, size: f.size})
            }
        }

        // Build staging directory mirroring the inner archive structure
        for (const src of sourcePaths) {
            const baseName = path.basename(src)
            const stageDest = innerDestPath
                ? path.join(tmpDir, innerDestPath, baseName)
                : path.join(tmpDir, baseName)

            const stat = await fsp.stat(src)
            if (stat.isDirectory()) {
                await copyDir(src, stageDest)
            } else {
                await fsp.mkdir(path.dirname(stageDest), {recursive: true})
                await pipeline(createReadStream(src), createWriteStream(stageDest))
            }
        }

        if (options.cancelled()) {
            return {filesDone: 0, bytesWritten: 0}
        }

        // Build list of relative paths to add
        const relPaths = sourcePaths.map(src => {
            const baseName = path.basename(src)
            return innerDestPath ? innerDestPath + '/' + baseName : baseName
        })

        // Add to archive from staging directory
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

        return {filesDone: allFiles.length, bytesWritten}
    } finally {
        await fsp.rm(tmpDir, {recursive: true, force: true}).catch(() => {})
    }
}
