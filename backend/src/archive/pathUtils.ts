import crypto from 'node:crypto'

/** Remove leading and trailing slashes from a path segment. */
export function stripSlashes(p: string): string {
    return p.replace(/^\/+|\/+$/g, '')
}

/** Strip trailing slashes from an archive entry name. */
export function stripTrailingSlashes(name: string): string {
    return name.replace(/\/+$/, '')
}

/** Extract the last path segment (basename) from an archive entry name. */
export function entryBaseName(name: string): string {
    return name.substring(name.lastIndexOf('/') + 1)
}

/** Extract file extension from a basename, or null if none. */
export function entryExtension(baseName: string): string | null {
    return baseName.includes('.') ? baseName.substring(baseName.lastIndexOf('.') + 1) : null
}

/** Check if an entry name represents a hidden file (starts with dot). */
export function isHiddenEntry(name: string): boolean {
    return entryBaseName(name).startsWith('.')
}

/** Generate a temporary file path for archive rewrite operations. */
export function makeTmpPath(archivePath: string): string {
    return archivePath + '.nemiga-tmp-' + crypto.randomUUID()
}

export interface ExtractItem {
    archiveName: string
    relativeName: string
    type: string
    size: number
}

/**
 * Given a list of archive entries and a list of paths to extract,
 * build the extraction plan. Outer loop is entries (single pass),
 * inner loop is innerPaths (small — user selections).
 * Each entry appears at most once in the result.
 */
export function buildExtractPlan(
    allEntries: Array<{name: string; type: string; size: number}>,
    innerPaths: string[],
): ExtractItem[] {
    const result: ExtractItem[] = []

    for (const entry of allEntries) {
        for (const innerPath of innerPaths) {
            if (entry.name === innerPath) {
                result.push({archiveName: entry.name, relativeName: entryBaseName(innerPath), type: entry.type, size: entry.size})
                break
            }
            if (entry.name.startsWith(innerPath + '/')) {
                const relative = entryBaseName(innerPath) + entry.name.slice(innerPath.length)
                result.push({archiveName: entry.name, relativeName: relative, type: entry.type, size: entry.size})
                break
            }
        }
    }

    return result
}
