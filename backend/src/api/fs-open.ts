import {spawn} from 'node:child_process'
import fs from 'node:fs/promises'
import which from 'which'
import type {Request, Response} from 'express'
import type {SettingsService} from '../settings/SettingsService.js'
import type {PathGuard} from '../providers/pathGuard.js'
import type {ArchiveProvider} from '../archive/ArchiveProvider.js'
import type {FtpArchiveCache} from '../ftp/FtpArchiveCache.js'
import {ErrorCode} from '../protocol'
import {fromPosix} from '../utils/platformPath.js'
import {isArchivePath, archiveRealPath} from '../archive/ArchiveProvider.js'
import {isFtpArchivePath} from '../providers/ProviderRouter.js'
import {launchExternalForArchive} from './launchExternalForArchive.js'

export function makeFsOpenHandler(
    settingsService: SettingsService,
    pathGuard: PathGuard,
    archiveProvider: ArchiveProvider,
    ftpArchiveCache?: FtpArchiveCache,
) {
    return makeLaunchHandler(settingsService, pathGuard, archiveProvider, ftpArchiveCache, 'editor')
}

export function makeFsViewHandler(
    settingsService: SettingsService,
    pathGuard: PathGuard,
    archiveProvider: ArchiveProvider,
    ftpArchiveCache?: FtpArchiveCache,
) {
    return makeLaunchHandler(settingsService, pathGuard, archiveProvider, ftpArchiveCache, 'viewer')
}

function makeLaunchHandler(
    settingsService: SettingsService,
    pathGuard: PathGuard,
    archiveProvider: ArchiveProvider,
    ftpArchiveCache: FtpArchiveCache | undefined,
    settingKey: 'editor' | 'viewer',
) {
    const label = settingKey === 'editor' ? 'editor' : 'viewer'
    const mode: 'view' | 'edit' = settingKey === 'editor' ? 'edit' : 'view'

    return async (req: Request, res: Response): Promise<void> => {
        const rawPath = (req.body as {path?: string})?.path

        if (!rawPath || typeof rawPath !== 'string') {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'path is required'}})
            return
        }

        const filePath = fromPosix(rawPath)

        if (isArchivePath(filePath)) {
            if (!isFtpArchivePath(filePath)) {
                pathGuard.assert(archiveRealPath(filePath))
            }
            const result = await launchExternalForArchive(filePath, mode, {
                archiveProvider, settingsService, ftpArchiveCache,
            })
            res.json(result)
            return
        }

        pathGuard.assert(filePath)

        try {
            await fs.access(filePath)
        } catch {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'path does not exist'}})
            return
        }

        const settings = await settingsService.load()
        const command = settings[settingKey]?.trim()

        if (!command) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: `${label} is not configured`}})
            return
        }

        const parts = command.split(/\s+/)
        const cmd = parts[0]

        if (!resolveCommand(cmd)) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: `${label} command not found: ${cmd}`}})
            return
        }

        try {
            const args = [...parts.slice(1), filePath]
            const child = spawn(cmd, args, {detached: process.platform !== 'win32', stdio: 'ignore'})
            child.unref()
            res.json({ok: true})
        } catch {
            res.json({ok: false, error: {code: ErrorCode.INTERNAL, message: `failed to launch ${label}`}})
        }
    }
}

function resolveCommand(cmd: string): string | null {
    try {
        return which.sync(cmd)
    } catch {
        return null
    }
}
