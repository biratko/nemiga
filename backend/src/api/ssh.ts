import {Router} from 'express'
import {spawn} from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'
import which from 'which'
import type {SshSessionManager} from '../ssh/SshSessionManager.js'
import type {SettingsService} from '../settings/SettingsService.js'
import {ErrorCode} from '../protocol/errors.js'

interface EditSession {
    watcher: fs.FSWatcher
    cleanup: () => Promise<void>
}

const sshEditSessions = new Map<string, EditSession[]>()

export function sshRouter(sshSessionManager: SshSessionManager, settingsService: SettingsService): Router {
    const router = Router()

    router.post('/ssh/connect', async (req, res) => {
        const {host, port, username, password} = req.body
        if (!host || !port || !username) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'Missing required fields'}})
            return
        }
        try {
            const sessionId = await sshSessionManager.connect({
                host, port: Number(port), username, password: password ?? '',
            })
            res.json({ok: true, sessionId})
        } catch (err: any) {
            res.json({ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}})
        }
    })

    router.post('/ssh/disconnect', async (req, res) => {
        const {sessionId} = req.body
        if (!sessionId) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'sessionId is required'}})
            return
        }
        // Clean up any open edit sessions for this SSH connection
        const editSessions = sshEditSessions.get(sessionId)
        if (editSessions) {
            for (const es of editSessions) {
                es.watcher.close()
                await es.cleanup()
            }
            sshEditSessions.delete(sessionId)
        }
        await sshSessionManager.disconnect(sessionId)
        res.json({ok: true})
    })

    router.post('/ssh/open-terminal', (req, res) => {
        let {host, port, username, password, sessionId, cwd} = req.body

        // If sessionId is provided, resolve credentials from session
        if (sessionId && (!host || !username)) {
            const creds = sshSessionManager.getCredentials(sessionId)
            if (!creds) {
                res.json({ok: false, error: {code: ErrorCode.NOT_FOUND, message: 'SSH session not found'}})
                return
            }
            host = host || creds.host
            port = port || creds.port
            username = username || creds.username
            password = password ?? creds.password
        }

        if (!host || !port || !username) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'Missing required fields'}})
            return
        }
        const target = `${username}@${host}`
        const portStr = String(port)
        const display = process.env.DISPLAY ?? ':0'

        const cdCmd = cwd ? `cd ${cwd.replace(/'/g, "'\\''")} && exec $SHELL -l` : ''
        const sshArgs = ['-o', 'StrictHostKeyChecking=accept-new', '-p', portStr, target, ...(cdCmd ? ['-t', cdCmd] : [])]
        let child
        if (password) {
            child = spawn(
                'x-terminal-emulator',
                ['-e', 'sshpass', '-e', 'ssh', ...sshArgs],
                {
                    env: {...process.env, SSHPASS: password, DISPLAY: display},
                    detached: true,
                    stdio: 'ignore',
                },
            )
        } else {
            child = spawn(
                'x-terminal-emulator',
                ['-e', 'ssh', ...sshArgs],
                {
                    env: {...process.env, DISPLAY: display},
                    detached: true,
                    stdio: 'ignore',
                },
            )
        }
        child.unref()
        res.json({ok: true})
    })

    router.post('/ssh/open-file', async (req, res) => {
        const {sessionId, remotePath, mode} = req.body as {sessionId?: string; remotePath?: string; mode?: 'view' | 'edit'}

        if (!sessionId || !remotePath) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'sessionId and remotePath are required'}})
            return
        }

        const provider = sshSessionManager.get(sessionId)
        if (!provider) {
            res.json({ok: false, error: {code: ErrorCode.NOT_FOUND, message: 'SSH session not found'}})
            return
        }

        const settings = await settingsService.load()
        const settingKey = mode === 'edit' ? 'editor' : 'viewer'
        const command = settings[settingKey]?.trim()
        if (!command) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: `${settingKey} is not configured`}})
            return
        }

        const parts = command.split(/\s+/)
        const cmd = parts[0]
        try { which.sync(cmd) } catch {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: `${settingKey} command not found: ${cmd}`}})
            return
        }

        const fileName = path.basename(remotePath)
        const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nemiga-ssh-edit-'))
        const tmpFile = path.join(tmpDir, fileName)

        try {
            const fullPath = `${provider.pathPrefix}${remotePath}`
            const readStream = await provider.createReadStream(fullPath)
            await pipeline(readStream, fs.createWriteStream(tmpFile))
        } catch (err: any) {
            await fsp.rm(tmpDir, {recursive: true, force: true}).catch(() => {})
            res.json({ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}})
            return
        }

        const args = [...parts.slice(1), tmpFile]
        const startTime = Date.now()
        const child = spawn(cmd, args, {detached: process.platform !== 'win32', stdio: 'ignore'})
        child.unref()

        const cleanup = () => fsp.rm(tmpDir, {recursive: true, force: true}).catch(() => {})

        if (mode === 'edit') {
            let uploading = false
            const watcher = fs.watch(tmpFile, async (eventType) => {
                if (eventType !== 'change' || uploading) return
                uploading = true
                try {
                    const fullPath = `${provider.pathPrefix}${remotePath}`
                    const writeStream = await provider.createWriteStream(fullPath)
                    await pipeline(fs.createReadStream(tmpFile), writeStream)
                } catch {
                    // best-effort upload
                } finally {
                    uploading = false
                }
            })

            // Track this edit session for cleanup on SSH disconnect
            const editSession = {watcher, cleanup}
            const existing = sshEditSessions.get(sessionId!) ?? []
            existing.push(editSession)
            sshEditSessions.set(sessionId!, existing)

            child.on('exit', () => {
                const isClientServer = Date.now() - startTime < 2000
                if (isClientServer) return // editor delegated to running instance, keep watching
                watcher.close()
                const sessions = sshEditSessions.get(sessionId!)
                if (sessions) {
                    const idx = sessions.indexOf(editSession)
                    if (idx >= 0) sessions.splice(idx, 1)
                }
                cleanup()
            })
        } else {
            child.on('exit', () => {
                const isClientServer = Date.now() - startTime < 2000
                if (isClientServer) return // viewer delegated, temp file still needed
                cleanup()
            })
        }

        res.json({ok: true})
    })

    return router
}
