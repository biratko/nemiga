import type {FSEntry} from '../protocol/fs-types.js'

/**
 * Add implicit parent directory entries for paths like "dir/file.txt"
 * where no explicit "dir/" entry exists in the archive listing.
 */
export function addImplicitDirs(
    name: string,
    modified: string,
    seenDirs: Set<string>,
    entries: FSEntry[],
): void {
    if (!name.includes('/')) return

    const parts = name.split('/')
    for (let i = 1; i < parts.length; i++) {
        const dirPath = parts.slice(0, i).join('/')
        if (!seenDirs.has(dirPath)) {
            seenDirs.add(dirPath)
            entries.push({
                name: dirPath,
                type: 'directory',
                size: 0,
                modified,
                permissions: 'drwxr-xr-x',
                extension: null,
                hidden: parts[i - 1].startsWith('.'),
                symlink_target: null,
            })
        }
    }
}
