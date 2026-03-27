import {execFile} from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import type {Request, Response} from 'express'

export interface MimeDefault {
    mime: string
    program: string
}

const GLOBS2_PATH = '/usr/share/mime/globs2'
const APPS_DIRS = [
    path.join(process.env.HOME ?? '', '.local/share/applications'),
    '/usr/share/applications',
    '/usr/local/share/applications',
]

/** Parse /usr/share/mime/globs2 → Map<ext, mimetype> (highest weight wins) */
async function parseGlobs2(): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    let content: string
    try {
        content = await fs.readFile(GLOBS2_PATH, 'utf-8')
    } catch {
        return map
    }
    for (const line of content.split('\n')) {
        if (line.startsWith('#') || !line.trim()) continue
        // Format: weight:mimetype:glob
        const parts = line.split(':')
        if (parts.length < 3) continue
        const mime = parts[1]
        const glob = parts[2]
        // Only care about simple *.ext globs
        if (!glob.startsWith('*.') || glob.includes('/')) continue
        const ext = glob.slice(2).toLowerCase()
        if (!ext || ext.includes('*') || ext.includes('[')) continue
        // globs2 is sorted by weight desc, so first match wins
        if (!map.has(ext)) {
            map.set(ext, mime)
        }
    }
    return map
}

/** Run xdg-mime query default <mimetype> → desktop file name */
function queryDefaultApp(mimeType: string): Promise<string> {
    return new Promise(resolve => {
        execFile('xdg-mime', ['query', 'default', mimeType], {timeout: 2000}, (err, stdout) => {
            resolve(err ? '' : stdout.trim())
        })
    })
}

/** Find and parse Name= from a .desktop file */
async function resolveDesktopName(desktopFile: string): Promise<string> {
    for (const dir of APPS_DIRS) {
        const filePath = path.join(dir, desktopFile)
        try {
            const content = await fs.readFile(filePath, 'utf-8')
            for (const line of content.split('\n')) {
                if (line.startsWith('Name=')) {
                    return line.slice(5).trim()
                }
            }
        } catch {
            continue
        }
    }
    // Fallback: strip .desktop extension
    return desktopFile.replace(/\.desktop$/, '')
}

let cachedDefaults: Record<string, MimeDefault> | null = null

export async function resolveMimeDefaults(extensions: string[]): Promise<Record<string, MimeDefault>> {
    if (cachedDefaults) return cachedDefaults

    const globs = await parseGlobs2()
    const result: Record<string, MimeDefault> = {}

    // Batch resolve: collect unique MIME types first
    const extToMime = new Map<string, string>()
    for (const ext of extensions) {
        const mime = globs.get(ext)
        if (mime) extToMime.set(ext, mime)
    }

    // Resolve desktop files for unique MIME types
    const uniqueMimes = [...new Set(extToMime.values())]
    const mimeToDesktop = new Map<string, string>()
    await Promise.all(uniqueMimes.map(async mime => {
        const desktop = await queryDefaultApp(mime)
        if (desktop) mimeToDesktop.set(mime, desktop)
    }))

    // Resolve program names for unique desktop files
    const uniqueDesktops = [...new Set(mimeToDesktop.values())]
    const desktopToName = new Map<string, string>()
    await Promise.all(uniqueDesktops.map(async desktop => {
        const name = await resolveDesktopName(desktop)
        desktopToName.set(desktop, name)
    }))

    // Assemble results
    for (const [ext, mime] of extToMime) {
        const desktop = mimeToDesktop.get(mime)
        const program = desktop ? (desktopToName.get(desktop) ?? '') : ''
        if (mime) result[ext] = {mime, program}
    }

    cachedDefaults = result
    return result
}

export function makeMimeDefaultsHandler() {
    return async (_req: Request, res: Response): Promise<void> => {
        // Known extensions from the frontend icon map
        const extensions = [
            'ts', 'js', 'vue', 'json', 'md', 'html', 'css', 'scss', 'less',
            'png', 'jpg', 'jpeg', 'gif', 'svg', 'yml', 'yaml', 'sh', 'bash', 'zsh',
            'py', 'go', 'rs', 'txt', 'lock', 'toml', 'xml', 'tsx', 'jsx',
            'sql', 'graphql', 'gql', 'proto', 'java', 'rb', 'php',
            'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'swift', 'kt', 'kts',
            'lua', 'zig', 'pdf', 'mp3', 'wav', 'flac', 'ogg',
            'mp4', 'avi', 'mkv', 'mov', 'env',
        ]

        const defaults = await resolveMimeDefaults(extensions)
        res.json({ok: true, defaults})
    }
}
