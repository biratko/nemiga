import {Router} from 'express'
import type {SshConnectionsService, CreateSshConnectionInput} from '../ssh/SshConnectionsService.js'
import type {SavedSshConnection, SavedSshConnectionDto} from '../protocol/ssh-connection-types.js'
import {ErrorCode} from '../protocol/errors.js'

function toDto(conn: SavedSshConnection): SavedSshConnectionDto {
    return {
        id: conn.id,
        name: conn.name,
        host: conn.host,
        port: conn.port,
        username: conn.username,
        hasPassword: conn.password !== undefined && conn.password !== '',
        remotePath: conn.remotePath,
    }
}

export function sshConnectionsRouter(service: SshConnectionsService): Router {
    const router = Router()

    router.get('/ssh-connections', async (_req, res) => {
        const connections = await service.list()
        res.json({ok: true, connections: connections.map(toDto)})
    })

    router.post('/ssh-connections', async (req, res) => {
        const input = req.body as CreateSshConnectionInput
        try {
            const conn = await service.create(input)
            res.json({ok: true, connection: toDto(conn)})
        } catch (err: any) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: err.message}})
        }
    })

    router.put('/ssh-connections/:id', async (req, res) => {
        const input = req.body as CreateSshConnectionInput
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

    router.delete('/ssh-connections/:id', async (req, res) => {
        const deleted = await service.delete(req.params.id)
        if (!deleted) {
            res.json({ok: false, error: {code: ErrorCode.NOT_FOUND, message: 'Connection not found'}})
            return
        }
        res.json({ok: true})
    })

    router.get('/ssh-connections/:id/connect-params', async (req, res) => {
        const conn = await service.getById(req.params.id)
        if (!conn) {
            res.json({ok: false, error: {code: ErrorCode.NOT_FOUND, message: 'Connection not found'}})
            return
        }
        res.json({
            ok: true,
            params: {
                host: conn.host,
                port: conn.port,
                username: conn.username,
                password: conn.password,
                remotePath: conn.remotePath,
            },
        })
    })

    return router
}
