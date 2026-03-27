import {spawn} from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs/promises'
import which from 'which'
import type {Request, Response} from 'express'
import type {SettingsService} from '../settings/SettingsService.js'
import type {PathGuard} from '../providers/pathGuard.js'
import {ErrorCode} from '../protocol'
import {fromPosix} from '../utils/platformPath.js'

export function makeFsLaunchHandler(settingsService: SettingsService, pathGuard: PathGuard) {
    return async (req: Request, res: Response): Promise<void> => {
        const rawPath = (req.body as {path?: string})?.path

        if (!rawPath || typeof rawPath !== 'string') {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'path is required'}})
            return
        }

        const filePath = fromPosix(rawPath)
        pathGuard.assert(filePath)

        try {
            await fs.access(filePath)
        } catch {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'path does not exist'}})
            return
        }

        const settings = await settingsService.load()
        const ext = path.extname(filePath).slice(1).toLowerCase()
        const customProgram = ext ? settings.fileTypes?.[ext]?.program?.trim() : undefined

        let cmd: string
        let args: string[]

        if (customProgram) {
            const parts = customProgram.split(/\s+/)
            cmd = parts[0]
            args = [...parts.slice(1), filePath]
            if (!resolveCommand(cmd)) {
                res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: `program not found: ${cmd}`}})
                return
            }
        } else {
            // Platform default opener
            const platform = process.platform
            if (platform === 'darwin') {
                cmd = 'open'
                args = [filePath]
            } else if (platform === 'win32') {
                cmd = 'cmd'
                args = ['/c', 'start', '', filePath]
            } else {
                cmd = 'xdg-open'
                args = [filePath]
            }
        }

        try {
            const child = spawn(cmd, args, {detached: process.platform !== 'win32', stdio: 'ignore'})
            child.unref()
            res.json({ok: true})
        } catch {
            res.json({ok: false, error: {code: ErrorCode.INTERNAL, message: `failed to launch: ${cmd}`}})
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
