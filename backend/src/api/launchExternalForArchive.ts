import {spawn} from 'node:child_process'
import which from 'which'
import type {ArchiveProvider} from '../archive/ArchiveProvider.js'
import type {SettingsService} from '../settings/SettingsService.js'
import type {FtpArchiveCache} from '../ftp/FtpArchiveCache.js'
import {ErrorCode} from '../protocol'
import {isFtpArchivePath} from '../providers/ProviderRouter.js'
import {splitFtpArchivePath} from '../ftp/FtpArchiveProvider.js'

export interface LaunchArchiveDeps {
    archiveProvider: ArchiveProvider
    settingsService: SettingsService
    ftpArchiveCache?: FtpArchiveCache
    /** Override the delegation grace window (ms). Used by tests; production default is 2000. */
    graceMs?: number
}

export type LaunchArchiveResult =
    | {ok: true}
    | {ok: false; error: {code: ErrorCode; message: string}}

// Per-archive sequencing for write-backs: two near-simultaneous saves to the same archive
// must not interleave inside replaceEntry. Pending writes form a promise chain keyed by archivePath.
const archiveLocks = new Map<string, Promise<void>>()
function withArchiveLock<T>(archivePath: string, fn: () => Promise<T>): Promise<T> {
    const prev = archiveLocks.get(archivePath) ?? Promise.resolve()
    const next = prev.catch(() => {}).then(fn)
    archiveLocks.set(archivePath, next.then(() => {}, () => {}))
    return next
}

const DEFAULT_GRACE_MS = 2000

export async function launchExternalForArchive(
    virtualPath: string,
    mode: 'view' | 'edit',
    deps: LaunchArchiveDeps,
): Promise<LaunchArchiveResult> {
    const {archiveProvider, settingsService, ftpArchiveCache} = deps
    const graceMs = deps.graceMs ?? DEFAULT_GRACE_MS

    let localVirtual = virtualPath
    let ftpPartForDirty: string | null = null
    if (isFtpArchivePath(virtualPath)) {
        if (!ftpArchiveCache) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: 'FTP archive cache not available'}}
        }
        const {ftpPart, innerPart} = splitFtpArchivePath(virtualPath)
        const localArchive = await ftpArchiveCache.getLocalPath(ftpPart)
        localVirtual = localArchive + '::' + innerPart
        ftpPartForDirty = ftpPart
    }

    const settings = await settingsService.load()
    const settingKey = mode === 'edit' ? 'editor' : 'viewer'
    const command = settings[settingKey]?.trim()
    if (!command) {
        return {ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: `${settingKey} is not configured`}}
    }
    const parts = command.split(/\s+/)
    const cmd = parts[0]
    try { which.sync(cmd) }
    catch { return {ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: `${settingKey} command not found: ${cmd}`}} }

    let tempPath: string
    let dispose: (() => Promise<void>) | null = null
    if (mode === 'view') {
        try {
            tempPath = await archiveProvider.extractFileForView(localVirtual)
        } catch (err: any) {
            return {ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}}
        }
    } else {
        try {
            const session = await archiveProvider.extractFileForEdit(
                localVirtual,
                (writtenPath, adapter, archivePath, innerPath) =>
                    withArchiveLock(archivePath, async () => {
                        await adapter.replaceEntry(archivePath, innerPath, writtenPath)
                        if (ftpPartForDirty) ftpArchiveCache!.markDirty(ftpPartForDirty)
                    }),
            )
            tempPath = session.tempPath
            dispose = session.dispose
            const sessions = (archiveProvider as any).__editSessions ?? []
            sessions.push({tempPath, virtualPath, dispose})
            ;(archiveProvider as any).__editSessions = sessions
        } catch (err: any) {
            return {ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: err.message}}
        }
    }

    const args = [...parts.slice(1), tempPath]
    const startTime = Date.now()
    const child = spawn(cmd, args, {detached: process.platform !== 'win32', stdio: 'ignore'})
    child.unref()

    if (mode === 'edit' && dispose) {
        child.on('exit', () => {
            const delegated = Date.now() - startTime < graceMs
            if (delegated) return
            void dispose!()
            const sessions = (archiveProvider as any).__editSessions as Array<{tempPath: string}> | undefined
            if (sessions) {
                const idx = sessions.findIndex(s => s.tempPath === tempPath)
                if (idx >= 0) sessions.splice(idx, 1)
            }
        })
    }

    return {ok: true}
}
