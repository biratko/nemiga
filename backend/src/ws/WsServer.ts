import {WebSocketServer, WebSocket} from 'ws'
import type {IncomingMessage} from 'node:http'
import type {Duplex} from 'node:stream'
import type {Server} from 'node:http'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import type {SettingsService} from '../settings/SettingsService.js'
import {BaseConnectionHandler} from './BaseConnectionHandler.js'
import {CopyConnectionHandler} from './CopyConnectionHandler.js'
import {MoveConnectionHandler} from './MoveConnectionHandler.js'
import {DeleteConnectionHandler} from './DeleteConnectionHandler.js'
import {MkdirConnectionHandler} from './MkdirConnectionHandler.js'
import {ExtractConnectionHandler} from './ExtractConnectionHandler.js'
import {PackConnectionHandler} from './PackConnectionHandler.js'

export class WsServer {
    private wss: WebSocketServer
    private handlers = new Set<BaseConnectionHandler>()

    constructor(private router: ProviderRouter, private settingsService: SettingsService) {
        this.wss = new WebSocketServer({noServer: true})
    }

    attach(server: Server): void {
        server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
            const {pathname} = new URL(req.url!, `http://${req.headers.host}`)

            let factory: ((ws: WebSocket) => Promise<BaseConnectionHandler>) | null = null

            if (pathname === '/ws/operations/copy') {
                factory = async (ws) => {
                    const settings = await this.settingsService.load()
                    return new CopyConnectionHandler(ws, this.router, settings.followSymlinks ?? true)
                }
            } else if (pathname === '/ws/operations/move') {
                factory = async (ws) => new MoveConnectionHandler(ws, this.router)
            } else if (pathname === '/ws/operations/delete') {
                factory = async (ws) => new DeleteConnectionHandler(ws, this.router)
            } else if (pathname === '/ws/operations/mkdir') {
                factory = async (ws) => new MkdirConnectionHandler(ws, this.router)
            } else if (pathname === '/ws/operations/extract') {
                factory = async (ws) => new ExtractConnectionHandler(ws, this.router)
            } else if (pathname === '/ws/operations/pack') {
                factory = async (ws) => new PackConnectionHandler(ws, this.router)
            }

            if (!factory) {
                return
            }

            const create = factory
            this.wss.handleUpgrade(req, socket, head, (ws) => {
                create(ws)
                    .then((handler) => {
                        this.handlers.add(handler)

                        ws.on('message', (data) => {
                            let msg
                            try { msg = JSON.parse(data.toString()) } catch { return }
                            try {
                                handler.handleMessage(msg)
                            } catch (err) {
                                if (ws.readyState === ws.OPEN) {
                                    ws.send(JSON.stringify({event: 'error', error: {code: 'INTERNAL', message: err instanceof Error ? err.message : String(err)}}))
                                    ws.close()
                                }
                            }
                        })

                        ws.on('close', () => {
                            handler.cancel()
                            this.handlers.delete(handler)
                        })

                        this.wss.emit('connection', ws, req)
                    })
                    .catch((err) => {
                        console.error('Failed to create handler:', err)
                        ws.close(1011, 'internal error')
                    })
            })
        })
    }

    close(): void {
        for (const handler of this.handlers) {
            handler.cancel()
        }
        this.handlers.clear()
        this.wss.close()
    }
}
