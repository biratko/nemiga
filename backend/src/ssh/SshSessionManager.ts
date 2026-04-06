import {randomUUID} from 'node:crypto'
import type {SshConnectionParams} from '../protocol/ssh-types.js'
import {SshProvider} from './SshProvider.js'
import type {SshProviderOptions} from './SshProvider.js'
import type {NotifyServer} from '../ws/NotifyServer.js'

const CONNECT_TIMEOUT_MS = 10_000
const DEFAULT_SESSION_TIMEOUT_MS = 15 * 60 * 1000
const DEFAULT_REAPER_INTERVAL_MS = 5 * 60 * 1000

export interface SshSessionManagerOptions {
    sessionTimeoutMs?: number
    reaperIntervalMs?: number
    providerOptions?: SshProviderOptions
}

interface SessionEntry {
    provider: SshProvider
    credentials: SshConnectionParams
}

export class SshSessionManager {
    private sessions = new Map<string, SessionEntry>()
    private reaperTimer: ReturnType<typeof setInterval> | null = null
    private isReaping = false
    private notifyServer?: NotifyServer
    private sessionTimeoutMs: number
    private reaperIntervalMs: number
    private providerOptions?: SshProviderOptions

    constructor(options?: SshSessionManagerOptions) {
        this.sessionTimeoutMs = options?.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS
        this.reaperIntervalMs = options?.reaperIntervalMs ?? DEFAULT_REAPER_INTERVAL_MS
        this.providerOptions = options?.providerOptions
        this.reaperTimer = setInterval(() => {
            this.reapStaleSessions().catch(() => {})
        }, this.reaperIntervalMs)
    }

    setNotifyServer(notify: NotifyServer): void {
        this.notifyServer = notify
    }

    async connect(params: SshConnectionParams): Promise<string> {
        const sessionId = randomUUID()
        const provider = new SshProvider(sessionId, params, this.providerOptions)

        let timer: ReturnType<typeof setTimeout>
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Connection timed out')), CONNECT_TIMEOUT_MS)
        })

        await Promise.race([provider.connect(params), timeout]).finally(() => clearTimeout(timer!))

        this.sessions.set(sessionId, {provider, credentials: params})
        return sessionId
    }

    async disconnect(sessionId: string): Promise<void> {
        const entry = this.sessions.get(sessionId)
        if (!entry) return
        this.sessions.delete(sessionId)
        await entry.provider.disconnect().catch(() => {})
    }

    get(sessionId: string): SshProvider | undefined {
        return this.sessions.get(sessionId)?.provider
    }

    has(sessionId: string): boolean {
        return this.sessions.has(sessionId)
    }

    getCredentials(sessionId: string): SshConnectionParams | undefined {
        return this.sessions.get(sessionId)?.credentials
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

    private async reapStaleSessions(): Promise<void> {
        if (this.isReaping) return
        this.isReaping = true
        try {
            const now = Date.now()
            for (const [id, entry] of this.sessions) {
                const isStale = !entry.provider.isConnected() ||
                    now - entry.provider.getLastAccess() > this.sessionTimeoutMs
                if (!isStale) continue
                await this.disconnect(id).catch(() => {})
            }
        } finally {
            this.isReaping = false
        }
    }
}
