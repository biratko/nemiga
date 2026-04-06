import {Router} from 'express'
import {spawn} from 'node:child_process'
import type {SshSessionManager} from '../ssh/SshSessionManager.js'
import {ErrorCode} from '../protocol/errors.js'

export function sshRouter(sshSessionManager: SshSessionManager): Router {
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
        await sshSessionManager.disconnect(sessionId)
        res.json({ok: true})
    })

    router.post('/ssh/open-terminal', (req, res) => {
        const {host, port, username, password} = req.body
        if (!host || !port || !username) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'Missing required fields'}})
            return
        }
        const target = `${username}@${host}`
        const portStr = String(port)
        const display = process.env.DISPLAY ?? ':0'

        let child
        if (password) {
            child = spawn(
                'sshpass',
                ['-e', 'ssh', '-o', 'StrictHostKeyChecking=accept-new', '-p', portStr, target],
                {
                    env: {...process.env, SSHPASS: password, DISPLAY: display},
                    detached: true,
                    stdio: 'ignore',
                },
            )
        } else {
            child = spawn(
                'x-terminal-emulator',
                ['-e', 'ssh', '-o', 'StrictHostKeyChecking=accept-new', '-p', portStr, target],
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

    return router
}
