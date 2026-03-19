// backend/src/archive/adapters/createWith7z.ts
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import {createReadStream, createWriteStream} from 'node:fs'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'
import type {PackOptions} from '../CreatableAdapter.js'
import {run7z} from './7z-utils.js'

async function collectFiles(srcPath: string): Promise<{relativePath: string; size: number}[]> {
    const stat = await fsp.stat(srcPath)
    const baseName = path.basename(srcPath)

    if (!stat.isDirectory()) {
        return [{relativePath: baseName, size: stat.size}]
    }

    const results: {relativePath: string; size: number}[] = []

    async function walk(dir: string, prefix: string) {
        const entries = await fsp.readdir(dir, {withFileTypes: true})
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            const relPath = prefix ? prefix + '/' + entry.name : entry.name
            if (entry.isDirectory()) {
                await walk(fullPath, relPath)
            } else {
                const st = await fsp.stat(fullPath)
                results.push({relativePath: relPath, size: st.size})
            }
        }
    }

    await walk(srcPath, baseName)
    return results
}

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

async function copyDir(src: string, dest: string): Promise<void> {
    await fsp.mkdir(dest, {recursive: true})
    const entries = await fsp.readdir(src, {withFileTypes: true})
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)
        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath)
        } else {
            await pipeline(createReadStream(srcPath), createWriteStream(destPath))
        }
    }
}
