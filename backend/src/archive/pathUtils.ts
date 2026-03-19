/** Remove leading and trailing slashes from a path segment. */
export function stripSlashes(p: string): string {
    return p.replace(/^\/+|\/+$/g, '')
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
                const baseName = innerPath.includes('/')
                    ? innerPath.substring(innerPath.lastIndexOf('/') + 1)
                    : innerPath
                result.push({archiveName: entry.name, relativeName: baseName, type: entry.type, size: entry.size})
                break
            }
            if (entry.name.startsWith(innerPath + '/')) {
                const parentDir = innerPath.includes('/')
                    ? innerPath.substring(innerPath.lastIndexOf('/') + 1)
                    : innerPath
                const relative = parentDir + entry.name.slice(innerPath.length)
                result.push({archiveName: entry.name, relativeName: relative, type: entry.type, size: entry.size})
                break
            }
        }
    }

    return result
}
