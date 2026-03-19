import path from 'node:path'

/** Convert native path to POSIX (for sending to frontend) */
export function toPosix(nativePath: string): string {
    if (path.sep === '/') return nativePath
    return nativePath.replace(/\\/g, '/')
}

/** Convert POSIX path from frontend to native OS path */
export function fromPosix(posixPath: string): string {
    if (path.sep === '/') return posixPath
    return posixPath.replace(/\//g, '\\')
}

/**
 * Normalize known path fields in an outgoing WS/API payload.
 * Applied to progress and confirm events before sending to the client.
 */
const PATH_FIELDS = new Set(['current_file', 'source', 'destination', 'current', 'path'])

export function normalizeSendPayload<T extends Record<string, unknown>>(payload: T): T {
    if (path.sep === '/') return payload
    const result = {...payload}
    for (const key of PATH_FIELDS) {
        if (typeof result[key] === 'string') {
            (result as Record<string, unknown>)[key] = toPosix(result[key] as string)
        }
    }
    if (Array.isArray(result['errors'])) {
        (result as Record<string, unknown>)['errors'] = (result['errors'] as Array<Record<string, unknown>>).map((e) => {
            if (typeof e?.file === 'string') return {...e, file: toPosix(e.file)}
            return e
        })
    }
    return result
}
