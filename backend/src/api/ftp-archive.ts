import {Router} from 'express'
import fsSync from 'node:fs'
import {pipeline} from 'node:stream/promises'
import path from 'node:path'
import type {FtpArchiveCache} from '../ftp/FtpArchiveCache.js'
import type {FtpSessionManager} from '../ftp/FtpSessionManager.js'
import {extractFtpSessionId} from '../providers/ProviderRouter.js'
import {ErrorCode} from '../protocol/errors.js'

export function ftpArchiveRouter(
    ftpArchiveCache: FtpArchiveCache,
    ftpSessionManager: FtpSessionManager,
): Router {
    const router = Router()

    router.post('/ftp/archive/commit', async (req, res) => {
        const {ftpPath} = req.body
        if (!ftpPath) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'ftpPath is required'}})
            return
        }
        if (!ftpArchiveCache.isDirty(ftpPath)) {
            res.json({ok: true})
            return
        }
        try {
            const localPath = await ftpArchiveCache.getLocalPath(ftpPath)
            const sessionId = extractFtpSessionId(ftpPath)
            const provider = ftpSessionManager.get(sessionId)
            if (!provider) throw new Error(`FTP session not found: ${sessionId}`)
            await provider.atomicUpload(ftpPath, localPath)
            ftpArchiveCache.markClean(ftpPath)
            res.json({ok: true})
        } catch (err: any) {
            res.json({ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}})
        }
    })

    router.post('/ftp/archive/discard', async (req, res) => {
        const {ftpPath} = req.body
        if (!ftpPath) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'ftpPath is required'}})
            return
        }
        await ftpArchiveCache.evict(ftpPath)
        res.json({ok: true})
    })

    router.get('/ftp/archive/download', async (req, res) => {
        const ftpPath = req.query.ftpPath as string
        if (!ftpPath) {
            res.status(400).json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'ftpPath is required'}})
            return
        }
        try {
            const localPath = await ftpArchiveCache.getLocalPath(ftpPath)
            const filename = path.posix.basename(ftpPath).replace(/"/g, '')
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
            res.setHeader('Content-Type', 'application/octet-stream')
            await pipeline(fsSync.createReadStream(localPath), res)
        } catch (err: any) {
            res.status(500).json({ok: false, error: {code: ErrorCode.INTERNAL, message: err.message}})
        }
    })

    return router
}
