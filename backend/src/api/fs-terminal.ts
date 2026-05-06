import {spawn, execSync} from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import type {Request, Response} from 'express'
import type {SettingsService} from '../settings/SettingsService.js'
import type {PathGuard} from '../providers/pathGuard.js'
import {ErrorCode} from '../protocol'
import {fromPosix} from '../utils/platformPath.js'

const isWSL = process.platform === 'linux' && (() => {
    try { return execSync('cat /proc/sys/fs/binfmt_misc/WSLInterop 2>/dev/null', {stdio: ['ignore', 'pipe', 'ignore']}).length > 0 }
    catch { return false }
})()

export function defaultTerminalFor(platform: NodeJS.Platform, isWsl: boolean): string {
    if (isWsl) return 'wt.exe -d %P'
    if (platform === 'win32') return 'wt'
    if (platform === 'darwin') return 'open -a Terminal'
    return 'x-terminal-emulator'
}

function getDefaultTerminal(): string {
    return defaultTerminalFor(process.platform, isWSL)
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
        const command = settings.terminal?.trim() || getDefaultTerminal()

        if (!command) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'terminal is not configured'}})
            return
        }

        // Support %P placeholder for directory path; if absent, use cwd
        const hasPlaceholder = command.includes('%P')
        const expanded = hasPlaceholder ? command.replace(/%P/g, dirPath) : command
        const parts = expanded.split(/\s+/)
        const cmd = parts[0]
        const args = parts.slice(1)

        const spawnOpts: {cwd?: string; detached: boolean; stdio: 'ignore'} = {detached: process.platform !== 'win32', stdio: 'ignore'}
        if (!hasPlaceholder) spawnOpts.cwd = dirPath

        const child = spawn(cmd, args, spawnOpts)

        const launched = await new Promise<boolean>(resolve => {
            child.on('spawn', () => resolve(true))
            child.on('error', () => resolve(false))
        })
        child.unref()

        if (launched) {
            res.json({ok: true})
        } else {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: `failed to launch terminal: ${cmd}`}})
        }
    }
}
