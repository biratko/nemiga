import {spawn} from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import which from 'which'
import type {Request, Response} from 'express'
import type {SettingsService} from '../settings/SettingsService.js'
import type {PathGuard} from '../providers/pathGuard.js'
import {ErrorCode} from '../protocol'
import {fromPosix} from '../utils/platformPath.js'

const DEFAULT_TERMINAL: Record<string, string> = {
    win32: 'wt',
    linux: 'x-terminal-emulator',
    darwin: 'open -a Terminal',
}

export function makeFsTerminalHandler(settingsService: SettingsService, pathGuard: PathGuard) {
    return async (req: Request, res: Response): Promise<void> => {
        const rawPath = (req.body as {path?: string})?.path

        if (!rawPath || typeof rawPath !== 'string') {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'path is required'}})
            return
        }

        if (rawPath.startsWith('ftp://')) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'terminal is not supported for FTP paths'}})
            return
        }

        // For archive paths (containing ::), use the directory containing the archive
        let targetPath = rawPath
        const archiveSep = targetPath.indexOf('::')
        if (archiveSep !== -1) {
            targetPath = path.dirname(targetPath.slice(0, archiveSep))
        }

        const dirPath = fromPosix(targetPath)
        pathGuard.assert(dirPath)

        try {
            const stat = await fs.stat(dirPath)
            if (!stat.isDirectory()) {
                res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'path is not a directory'}})
                return
            }
        } catch {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'path does not exist'}})
            return
        }

        const settings = await settingsService.load()
        const command = settings.terminal?.trim() || DEFAULT_TERMINAL[process.platform] || ''

        if (!command) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'terminal is not configured'}})
            return
        }

        const parts = command.split(/\s+/)
        const cmd = parts[0]

        if (!resolveCommand(cmd)) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: `terminal command not found: ${cmd}`}})
            return
        }

        try {
            const args = parts.slice(1)
            const child = spawn(cmd, args, {cwd: dirPath, detached: process.platform !== 'win32', stdio: 'ignore'})
            child.unref()
            res.json({ok: true})
        } catch {
            res.json({ok: false, error: {code: ErrorCode.INTERNAL, message: 'failed to launch terminal'}})
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
