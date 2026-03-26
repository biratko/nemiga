import {WebSocketServer, WebSocket} from 'ws'
import type {IncomingMessage} from 'node:http'
import type {Duplex} from 'node:stream'
import type {Server} from 'node:http'

export class NotifyServer {
    private wss: WebSocketServer
    private clients = new Set<WebSocket>()

    constructor() {
        this.wss = new WebSocketServer({noServer: true})
        this.wss.on('connection', (ws) => {
            this.clients.add(ws)
            ws.on('close', () => this.clients.delete(ws))
        })
    }

    attach(server: Server): void {
        server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
            const {pathname} = new URL(req.url!, `http://${req.headers.host}`)
            if (pathname !== '/ws/notify') return
            this.wss.handleUpgrade(req, socket, head, (ws) => {
                this.wss.emit('connection', ws, req)
            })
        })
    }

    broadcast(event: string, data: unknown): void {
        const msg = JSON.stringify({event, data})
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg)
            }
        }
    }

    close(): void {
        this.clients.clear()
        this.wss.close()
    }
}
