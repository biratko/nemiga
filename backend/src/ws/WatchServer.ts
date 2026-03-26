import {WebSocketServer, WebSocket} from 'ws'
import type {IncomingMessage} from 'node:http'
import type {Duplex} from 'node:stream'
import type {Server} from 'node:http'
import type {DirectoryWatcher} from './watchers/DirectoryWatcher.js'
import {FsDirectoryWatcher} from './watchers/FsDirectoryWatcher.js'
import {PollingDirectoryWatcher} from './watchers/PollingDirectoryWatcher.js'
import {NullDirectoryWatcher} from './watchers/NullDirectoryWatcher.js'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import {isFtpPath} from '../providers/ProviderRouter.js'
import {isArchivePath} from '../archive/ArchiveProvider.js'

interface WatchEntry {
    watcher: DirectoryWatcher
    clients: Set<WebSocket>
}

export class WatchServer {
    private wss: WebSocketServer
    private watches = new Map<string, WatchEntry>()
    private clientPaths = new Map<WebSocket, Set<string>>()

    constructor(private router: ProviderRouter) {
        this.wss = new WebSocketServer({noServer: true})
        this.wss.on('connection', (ws) => {
            this.clientPaths.set(ws, new Set())

            ws.on('message', (raw) => {
                try {
                    const msg = JSON.parse(String(raw))
                    if (msg.command === 'watch' && typeof msg.path === 'string') {
                        this.addWatch(ws, msg.path)
                    } else if (msg.command === 'unwatch' && typeof msg.path === 'string') {
                        this.removeWatch(ws, msg.path)
                    }
                } catch {
                    // ignore malformed messages
                }
            })

            ws.on('close', () => {
                const paths = this.clientPaths.get(ws)
                if (paths) {
                    for (const p of paths) this.removeWatch(ws, p)
                }
                this.clientPaths.delete(ws)
            })
        })
    }

    attach(server: Server): void {
        server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
            const {pathname} = new URL(req.url!, `http://${req.headers.host}`)
            if (pathname !== '/ws/watch') return
            this.wss.handleUpgrade(req, socket, head, (ws) => {
                this.wss.emit('connection', ws, req)
            })
        })
    }

    close(): void {
        for (const [, entry] of this.watches) {
            entry.watcher.stop()
        }
        this.watches.clear()
        this.clientPaths.clear()
        this.wss.close()
    }

    private createWatcher(dirPath: string): DirectoryWatcher {
        if (isArchivePath(dirPath)) {
            return new NullDirectoryWatcher()
        }
        if (isFtpPath(dirPath)) {
            try {
                const provider = this.router.resolve(dirPath)
                return new PollingDirectoryWatcher(dirPath, provider)
            } catch {
                return new NullDirectoryWatcher()
            }
        }
        return new FsDirectoryWatcher(dirPath)
    }

    private addWatch(ws: WebSocket, dirPath: string): void {
        const paths = this.clientPaths.get(ws)
        if (!paths) return
        if (paths.has(dirPath)) return
        paths.add(dirPath)

        const existing = this.watches.get(dirPath)
        if (existing) {
            existing.clients.add(ws)
            return
        }

        const watcher = this.createWatcher(dirPath)
        const entry: WatchEntry = {watcher, clients: new Set([ws])}
        this.watches.set(dirPath, entry)

        watcher.start(() => {
            this.notifyClients(dirPath)
        })
    }

    private removeWatch(ws: WebSocket, dirPath: string): void {
        const paths = this.clientPaths.get(ws)
        if (paths) paths.delete(dirPath)

        const entry = this.watches.get(dirPath)
        if (!entry) return
        entry.clients.delete(ws)

        if (entry.clients.size === 0) {
            entry.watcher.stop()
            this.watches.delete(dirPath)
        }
    }

    private notifyClients(dirPath: string): void {
        const entry = this.watches.get(dirPath)
        if (!entry) return

        const msg = JSON.stringify({event: 'changed', path: dirPath})
        for (const ws of entry.clients) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(msg)
            }
        }
    }
}
