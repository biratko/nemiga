import {spawn, execFileSync} from 'child_process'
import fs from 'fs/promises'
import type {Request, Response} from 'express'
import type {SettingsService} from '../settings/SettingsService.js'
import type {PathGuard} from '../providers/pathGuard.js'
import {ErrorCode} from '../protocol/errors.js'

function resolveCommand(cmd: string): string | null {
    try {
        return execFileSync('which', [cmd], {encoding: 'utf-8'}).trim()
    } catch {
        return null
    }
}

function makeLaunchHandler(settingsService: SettingsService, pathGuard: PathGuard, settingKey: 'editor' | 'viewer') {
    const label = settingKey === 'editor' ? 'editor' : 'viewer'

    return async (req: Request, res: Response): Promise<void> => {
        const path = (req.body as {path?: string})?.path

        if (!path || typeof path !== 'string') {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'path is required'}})
            return
        }

        pathGuard.assert(path)

        try {
            await fs.access(path)
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
            const args = [...parts.slice(1), path]
            const child = spawn(cmd, args, {detached: true, stdio: 'ignore'})
            child.unref()
            res.json({ok: true})
        } catch (err) {
            res.json({ok: false, error: {code: ErrorCode.INTERNAL, message: `failed to launch ${label}`}})
        }
    }
}

export function makeFsOpenHandler(settingsService: SettingsService, pathGuard: PathGuard) {
    return makeLaunchHandler(settingsService, pathGuard, 'editor')
}

export function makeFsViewHandler(settingsService: SettingsService, pathGuard: PathGuard) {
    return makeLaunchHandler(settingsService, pathGuard, 'viewer')
}
