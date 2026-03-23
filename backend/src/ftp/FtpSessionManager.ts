import {randomUUID} from 'node:crypto'
import type {FtpConnectionParams} from '../protocol/ftp-types.js'
import {FtpProvider} from './FtpProvider.js'

const SESSION_TIMEOUT_MS = 15 * 60 * 1000
const REAPER_INTERVAL_MS = 5 * 60 * 1000
const CONNECT_TIMEOUT_MS = 10_000

export class FtpSessionManager {
    private sessions = new Map<string, FtpProvider>()
    private reaperTimer: ReturnType<typeof setInterval> | null = null

    constructor() {
        this.reaperTimer = setInterval(() => this.reapStaleSessions(), REAPER_INTERVAL_MS)
    }

    async connect(params: FtpConnectionParams): Promise<string> {
        const sessionId = randomUUID()
        const provider = new FtpProvider(sessionId, params)

        let timer: ReturnType<typeof setTimeout>
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Connection timed out')), CONNECT_TIMEOUT_MS)
        })

        await Promise.race([provider.connect(params), timeout]).finally(() => clearTimeout(timer!))

        this.sessions.set(sessionId, provider)
        return sessionId
    }

    async disconnect(sessionId: string): Promise<void> {
        const provider = this.sessions.get(sessionId)
        if (!provider) return
        this.sessions.delete(sessionId)
        await provider.disconnect().catch(() => {})
    }

    get(sessionId: string): FtpProvider | undefined {
        return this.sessions.get(sessionId)
    }

    has(sessionId: string): boolean {
        return this.sessions.has(sessionId)
    }

    async disconnectAll(): Promise<void> {
        const promises: Promise<void>[] = []
        for (const [id] of this.sessions) {
            promises.push(this.disconnect(id))
        }
        await Promise.all(promises)
    }

    async cleanup(): Promise<void> {
        if (this.reaperTimer) {
            clearInterval(this.reaperTimer)
            this.reaperTimer = null
        }
        await this.disconnectAll()
    }

    private reapStaleSessions(): void {
        const now = Date.now()
        for (const [id, provider] of this.sessions) {
            if (!provider.isConnected() || now - provider.getLastAccess() > SESSION_TIMEOUT_MS) {
                this.disconnect(id).catch(() => {})
            }
        }
    }
}
