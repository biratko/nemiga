import { exec } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Request, Response } from 'express'
import type { DriveEntry } from '../protocol/index.js'
import type { PathGuard } from '../providers/pathGuard.js'
import { toPosix } from '../utils/platformPath.js'

const execAsync = promisify(exec)

export function makeFsRootsHandler(pathGuard: PathGuard) {
    return async (_req: Request, res: Response): Promise<void> => {
        let roots = await detectRoots()
        if (pathGuard.enabled) {
            roots = filterByPathGuard(roots, pathGuard)
        }
        res.json({ ok: true, roots })
    }
}

async function detectRoots(): Promise<DriveEntry[]> {
    switch (process.platform) {
        case 'win32':
            return detectWindowsDrives()
        case 'darwin':
            return detectMacVolumes()
        default:
            return detectLinuxMounts()
    }
}

async function detectWindowsDrives(): Promise<DriveEntry[]> {
    const { stdout } = await execAsync(
        'powershell -NoProfile -Command "[System.IO.DriveInfo]::GetDrives() | ConvertTo-Json"',
    )
    const parsed = JSON.parse(stdout)
    // PowerShell outputs a plain object (not array) when only one drive exists
    const drives: Array<{ Name: string; VolumeLabel: string; IsReady: boolean; DriveType: number }> = Array.isArray(
        parsed,
    )
        ? parsed
        : [parsed]

    return drives
        .filter((d) => d.IsReady)
        .map((d) => {
            const letter = d.Name.replace(/\\$/, '')
            const label = d.VolumeLabel ? `${letter} (${d.VolumeLabel})` : letter
            return { name: label, path: toPosix(d.Name) }
        })
}

const REAL_FS_TYPES = new Set([
    'ext2', 'ext3', 'ext4', 'xfs', 'btrfs', 'ntfs', 'vfat', 'fat32',
    'fuseblk', 'nfs', 'nfs4', 'cifs', 'smb', '9p', 'drvfs', 'fuse',
    'zfs', 'reiserfs', 'jfs', 'f2fs', 'exfat', 'hfsplus', 'apfs',
])

const EXCLUDED_MOUNT_PREFIXES = ['/snap', '/var/lib/docker', '/sys']

async function detectLinuxMounts(): Promise<DriveEntry[]> {
    const content = await fs.readFile('/proc/mounts', 'utf-8')
    const entries: DriveEntry[] = []
    const seen = new Set<string>()

    for (const line of content.split('\n')) {
        if (!line.trim()) continue
        const parts = line.split(/\s+/)
        const mountPoint = parts[1]
        const fsType = parts[2]

        // Skip non-real filesystem types, but allow overlay mounts outside excluded prefixes
        if (!REAL_FS_TYPES.has(fsType)) {
            if (fsType !== 'overlay') continue
            if (EXCLUDED_MOUNT_PREFIXES.some((p) => mountPoint.startsWith(p))) continue
        }

        if (seen.has(mountPoint)) continue
        seen.add(mountPoint)

        entries.push({ name: mountPoint, path: mountPoint })
    }

    return entries
}

async function detectMacVolumes(): Promise<DriveEntry[]> {
    const entries = await fs.readdir('/Volumes')
    return entries.map((name) => ({
        name,
        path: `/Volumes/${name}`,
    }))
}

function filterByPathGuard(roots: DriveEntry[], pathGuard: PathGuard): DriveEntry[] {
    const allowed = pathGuard.allowedRoots
    if (!allowed) return roots

    return roots.filter((root) => {
        const resolved = path.resolve(root.path)
        return allowed.some(
            (allowedRoot) =>
                resolved === allowedRoot ||
                allowedRoot.startsWith(resolved === '/' ? '/' : resolved + path.sep) ||
                resolved.startsWith(allowedRoot + path.sep),
        )
    })
}
