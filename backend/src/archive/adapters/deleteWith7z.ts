import crypto from 'node:crypto'
import {run7z} from './7z-utils.js'

export async function deleteWith7z(archivePath: string, innerPaths: string[]): Promise<{deleted: number}> {
    // 7z d archive.zip path1 path2 -r
    // -r ensures subdirectories of deleted dirs are also removed
    await run7z(['d', '-y', archivePath, ...innerPaths, '-r'])
    return {deleted: innerPaths.length}
}

export async function mkdirWith7z(archivePath: string, innerPath: string): Promise<void> {
    // 7z doesn't have a direct "create empty dir" command.
    // We add an entry with a trailing slash by creating a temp empty dir and adding it.
    const fsp = await import('node:fs/promises')
    const path = await import('node:path')
    const os = await import('node:os')

    const tmpBase = path.join(os.tmpdir(), 'nemiga-mkdir-' + crypto.randomUUID())
    const normalized = innerPath.replace(/^\/+|\/+$/g, '')
    const dirInStaging = path.join(tmpBase, normalized)

    try {
        await fsp.mkdir(dirInStaging, {recursive: true})
        // Add the directory to archive from staging root
        await run7z(['a', '-y', archivePath, normalized + '/'], tmpBase)
    } finally {
        await fsp.rm(tmpBase, {recursive: true, force: true}).catch(() => {})
    }
}
