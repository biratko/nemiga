import {randomUUID} from 'node:crypto'
import type {SshConnectionParams} from '../protocol/ssh-types.js'
import {SshProvider} from './SshProvider.js'
import type {SshProviderOptions} from './SshProvider.js'
import type {NotifyServer} from '../ws/NotifyServer.js'

const CONNECT_TIMEOUT_MS = 10_000
const DEFAULT_SESSION_TIMEOUT_MS = 15 * 60 * 1000
const DEFAULT_REAPER_INTERVAL_MS = 5 * 60 * 1000

export type SshProviderFactory = (
    sessionId: string,
    params: SshConnectionParams,
    options?: SshProviderOptions,
) => SshProvider

export interface SshSessionManagerOptions {
    sessionTimeoutMs?: number
    reaperIntervalMs?: number
    providerOptions?: SshProviderOptions
    /** Override how SshProvider instances are constructed (test seam). */
    providerFactory?: SshProviderFactory
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
    private providerFactory: SshProviderFactory

    constructor(options?: SshSessionManagerOptions) {
        this.sessionTimeoutMs = options?.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS
        this.reaperIntervalMs = options?.reaperIntervalMs ?? DEFAULT_REAPER_INTERVAL_MS
        this.providerOptions = options?.providerOptions
        this.providerFactory = options?.providerFactory ??
            ((id, params, opts) => new SshProvider(id, params, opts))
        this.reaperTimer = setInterval(() => {
            this.reapStaleSessions().catch(() => {})
        }, this.reaperIntervalMs)
    }

    setNotifyServer(notify: NotifyServer): void {
        this.notifyServer = notify
    }

    async connect(params: SshConnectionParams): Promise<string> {
        const sessionId = randomUUID()
        const provider = this.providerFactory(sessionId, params, this.providerOptions)

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

    /**
     * Rotate the SSH session: stand up a new provider with the same credentials,
     * swap it into the registry, disconnect the old one, and broadcast the
     * change so the frontend can rewrite open tabs that referenced the old id.
     * Mirrors FtpSessionManager's renewal broadcast (REM-0012-02).
     */
    async renewSession(oldSessionId: string): Promise<string | null> {
        const entry = this.sessions.get(oldSessionId)
        if (!entry) return null

        const newSessionId = randomUUID()
        const newProvider = this.providerFactory(newSessionId, entry.credentials, this.providerOptions)
        await newProvider.connect(entry.credentials)

        this.sessions.set(newSessionId, {provider: newProvider, credentials: entry.credentials})
        this.sessions.delete(oldSessionId)
        await entry.provider.disconnect().catch(() => {})

        this.notifyServer?.broadcast('ssh-session-renewed', {
            oldSessionId,
            newSessionId,
        })
        return newSessionId
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
