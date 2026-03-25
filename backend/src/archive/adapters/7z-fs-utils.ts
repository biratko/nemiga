import fsp from 'node:fs/promises'
import {createReadStream, createWriteStream} from 'node:fs'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'

export async function collectFiles(srcPath: string): Promise<{relativePath: string; size: number}[]> {
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

export async function copyDir(src: string, dest: string): Promise<void> {
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
