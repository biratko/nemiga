import {randomUUID} from 'node:crypto'
import type {FtpConnectionParams} from '../protocol/ftp-types.js'
import {FtpProvider} from './FtpProvider.js'
import type {FtpProviderOptions} from './FtpProvider.js'
import type {FtpArchiveCache} from './FtpArchiveCache.js'
import type {NotifyServer} from '../ws/NotifyServer.js'

const CONNECT_TIMEOUT_MS = 10_000
const DEFAULT_SESSION_TIMEOUT_MS = 15 * 60 * 1000
const DEFAULT_REAPER_INTERVAL_MS = 5 * 60 * 1000

export interface SessionManagerOptions {
    sessionTimeoutMs?: number
    reaperIntervalMs?: number
    providerOptions?: FtpProviderOptions
}

interface SessionEntry {
    provider: FtpProvider
    credentials: FtpConnectionParams
    reconnecting: boolean
}

export class FtpSessionManager {
    private sessions = new Map<string, SessionEntry>()
    private reaperTimer: ReturnType<typeof setInterval> | null = null
    private isReaping = false
    private archiveCache?: FtpArchiveCache
    private notifyServer?: NotifyServer
    private sessionTimeoutMs: number
    private reaperIntervalMs: number
    private providerOptions?: FtpProviderOptions

    constructor(options?: SessionManagerOptions) {
        this.sessionTimeoutMs = options?.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS
        this.reaperIntervalMs = options?.reaperIntervalMs ?? DEFAULT_REAPER_INTERVAL_MS
        this.providerOptions = options?.providerOptions
        this.reaperTimer = setInterval(() => {
            this.reapStaleSessions().catch(() => {})
        }, this.reaperIntervalMs)
    }

    setArchiveCache(cache: FtpArchiveCache): void {
        this.archiveCache = cache
    }

    setNotifyServer(notify: NotifyServer): void {
        this.notifyServer = notify
    }

    async connect(params: FtpConnectionParams): Promise<string> {
        const sessionId = randomUUID()
        const provider = new FtpProvider(sessionId, params, this.providerOptions)

        let timer: ReturnType<typeof setTimeout>
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Connection timed out')), CONNECT_TIMEOUT_MS)
        })

        await Promise.race([provider.connect(params), timeout]).finally(() => clearTimeout(timer!))

        this.sessions.set(sessionId, {provider, credentials: params, reconnecting: false})
        return sessionId
    }

    async disconnect(sessionId: string): Promise<void> {
        const entry = this.sessions.get(sessionId)
        if (!entry) return
        if (entry.reconnecting) return  // Reaper is mid-reconnect — skip
        this.sessions.delete(sessionId)
        await entry.provider.disconnect().catch(() => {})
    }

    get(sessionId: string): FtpProvider | undefined {
        return this.sessions.get(sessionId)?.provider
    }

    has(sessionId: string): boolean {
        return this.sessions.has(sessionId)
    }

    async disconnectAll(): Promise<void> {
        const promises: Promise<void>[] = []
        for (const [id, entry] of this.sessions) {
            if (entry.reconnecting) continue
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
                if (entry.reconnecting) continue
                const isStale = !entry.provider.isConnected() ||
                    now - entry.provider.getLastAccess() > this.sessionTimeoutMs
                if (!isStale) continue

                const dirtyArchives = this.archiveCache?.getDirtyForSession(id) ?? []
                if (dirtyArchives.length === 0) {
                    await this.disconnect(id).catch(() => {})
                    continue
                }

                // Dirty archives exist — attempt auto-reconnect + commit
                entry.reconnecting = true
                try {
                    const newSessionId = randomUUID()
                    const newProvider = new FtpProvider(newSessionId, entry.credentials)
                    await newProvider.connect(entry.credentials)

                    // Rekey cache entries to new session
                    for (const oldPath of dirtyArchives) {
                        const newPath = oldPath.replace(
                            `ftp://${id}@`,
                            `ftp://${newSessionId}@`,
                        )
                        this.archiveCache!.rekey(oldPath, newPath)
                    }

                    // Commit dirty archives via new provider
                    const newPaths = dirtyArchives.map(p =>
                        p.replace(`ftp://${id}@`, `ftp://${newSessionId}@`)
                    )
                    await this.commitDirtyArchives(newPaths, newProvider)

                    // Register new session, remove old
                    this.sessions.set(newSessionId, {
                        provider: newProvider,
                        credentials: entry.credentials,
                        reconnecting: false,
                    })
                    this.sessions.delete(id)
                    await entry.provider.disconnect().catch(() => {})

                    this.notifyServer?.broadcast('ftp-session-renewed', {
                        oldSessionId: id,
                        newSessionId,
                    })
                } catch {
                    entry.reconnecting = false
                    this.notifyServer?.broadcast('ftp-archive-lost', {sessionId: id})
                    await this.disconnect(id).catch(() => {})
                }
            }
        } finally {
            this.isReaping = false
        }
    }

    private async commitDirtyArchives(ftpPaths: string[], provider: FtpProvider): Promise<void> {
        if (!this.archiveCache) return
        for (const ftpPath of ftpPaths) {
            if (!this.archiveCache.isDirty(ftpPath)) continue
            try {
                const localPath = await this.archiveCache.getLocalPath(ftpPath)
                await provider.atomicUpload(ftpPath, localPath)
                this.archiveCache.markClean(ftpPath)
            } catch {
                // Continue with other archives — failure is reported via ftp-archive-lost
            }
        }
    }
}
