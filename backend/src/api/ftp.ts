import {Router} from 'express'
import type {FtpSessionManager} from '../ftp/FtpSessionManager.js'
import {ErrorCode} from '../protocol/errors.js'

export function ftpRouter(ftpSessionManager: FtpSessionManager): Router {
    const router = Router()

    router.post('/ftp/connect', async (req, res) => {
        const {protocol, host, port, username, password, rejectUnauthorized} = req.body
        if (!protocol || !host || !port || !username) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'Missing required fields'}})
            return
        }
        if (!['ftp', 'ftps', 'sftp'].includes(protocol)) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'Invalid protocol'}})
            return
        }
        const sessionId = await ftpSessionManager.connect({
            protocol, host, port: Number(port), username, password: password ?? '',
            rejectUnauthorized: rejectUnauthorized ?? true,
        })
        res.json({ok: true, sessionId})
    })

    router.post('/ftp/disconnect', async (req, res) => {
        const {sessionId} = req.body
        if (!sessionId) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'sessionId is required'}})
            return
        }
        await ftpSessionManager.disconnect(sessionId)
        res.json({ok: true})
    })

    return router
}
