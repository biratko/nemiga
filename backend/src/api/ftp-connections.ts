import {Router} from 'express'
import type {FtpConnectionsService, CreateConnectionInput} from '../ftp/FtpConnectionsService.js'
import type {SavedFtpConnection, SavedFtpConnectionDto} from '../protocol/ftp-connection-types.js'
import {ErrorCode} from '../protocol/errors.js'

function toDto(conn: SavedFtpConnection): SavedFtpConnectionDto {
    return {
        id: conn.id,
        name: conn.name,
        protocol: conn.protocol,
        host: conn.host,
        port: conn.port,
        username: conn.username,
        hasPassword: conn.password !== undefined && conn.password !== '',
        rejectUnauthorized: conn.rejectUnauthorized,
        remotePath: conn.remotePath,
    }
}

export function ftpConnectionsRouter(service: FtpConnectionsService): Router {
    const router = Router()

    router.get('/ftp-connections', async (_req, res) => {
        const connections = await service.list()
        res.json({ok: true, connections: connections.map(toDto)})
    })

    router.post('/ftp-connections', async (req, res) => {
        const input = req.body as CreateConnectionInput
        try {
            const conn = await service.create(input)
            res.json({ok: true, connection: toDto(conn)})
        } catch (err: any) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: err.message}})
        }
    })

    router.put('/ftp-connections/:id', async (req, res) => {
        const input = req.body as CreateConnectionInput
        try {
            const conn = await service.update(req.params.id, input)
            if (!conn) {
                res.json({ok: false, error: {code: ErrorCode.NOT_FOUND, message: 'Connection not found'}})
                return
            }
            res.json({ok: true, connection: toDto(conn)})
        } catch (err: any) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: err.message}})
        }
    })

    router.delete('/ftp-connections/:id', async (req, res) => {
        const deleted = await service.delete(req.params.id)
        if (!deleted) {
            res.json({ok: false, error: {code: ErrorCode.NOT_FOUND, message: 'Connection not found'}})
            return
        }
        res.json({ok: true})
    })

    router.get('/ftp-connections/:id/connect-params', async (req, res) => {
        const conn = await service.getById(req.params.id)
        if (!conn) {
            res.json({ok: false, error: {code: ErrorCode.NOT_FOUND, message: 'Connection not found'}})
            return
        }
        res.json({
            ok: true,
            params: {
                protocol: conn.protocol,
                host: conn.host,
                port: conn.port,
                username: conn.username,
                password: conn.password,
                rejectUnauthorized: conn.rejectUnauthorized,
                remotePath: conn.remotePath,
            },
        })
    })

    return router
}
