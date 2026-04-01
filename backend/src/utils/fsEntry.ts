import {lstat, readlink} from 'node:fs/promises'
import path from 'node:path'
import type {Dirent} from 'node:fs'
import type {FSEntry} from '../protocol/fs-types.js'

export async function toEntry(dir: string, de: Dirent): Promise<FSEntry> {
    const fullPath = path.join(dir, de.name)
    const info = await lstat(fullPath)

    let type: FSEntry['type'] = 'file'
    if (de.isDirectory()) type = 'directory'
    else if (de.isSymbolicLink()) type = 'symlink'

    let symlinkTarget: string | null = null
    if (de.isSymbolicLink()) {
        try {
            symlinkTarget = await readlink(fullPath)
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

export function formatPermissions(mode: number): string {
    const chars = 'rwx'
    let result = ''
    for (let i = 8; i >= 0; i--) {
        result += mode & (1 << i) ? chars[2 - (i % 3)] : '-'
    }
    return result
}
