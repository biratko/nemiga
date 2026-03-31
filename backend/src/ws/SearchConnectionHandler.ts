import {opendir, stat, readFile} from 'node:fs/promises'
import path from 'node:path'
import type {WebSocket} from 'ws'
import picomatch from 'picomatch'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import type {WsSearchStartCommand, WsSearchClientCommand} from '../protocol/ws-types.js'
import {ErrorCode} from '../protocol/errors.js'
import {PathGuardError} from '../providers/pathGuard.js'
import {BaseConnectionHandler} from './BaseConnectionHandler.js'
import {fromPosix} from '../utils/platformPath.js'

export class SearchConnectionHandler extends BaseConnectionHandler {
    private cancelled = false
    private started = false

    constructor(
        ws: WebSocket,
        private router: ProviderRouter,
    ) {
        super(ws)
    }

    handleMessage(msg: unknown): void {
        if (!isValidCommand(msg)) return

        if (msg.command === 'start') {
            this.handleStart(msg)
        } else if (msg.command === 'cancel') {
            this.cancel()
        }
    }

    cancel(): void {
        this.cancelled = true
    }

    private async handleStart(cmd: WsSearchStartCommand): Promise<void> {
        if (this.started) return
        this.started = true

        const directory = fromPosix(cmd.directory)

        try {
            this.router.resolve(directory)
        } catch (err) {
            if (err instanceof PathGuardError) { this.sendPathGuardError(err); return }
            throw err
        }

        const patterns = cmd.fileMask.split(',').map(p => p.trim()).filter(Boolean)
        const matchers = patterns.map(p => picomatch(p, {nocase: true}))
        const matchName = (name: string) => matchers.some(m => m(name))

        let contentMatcher: ((text: string) => boolean) | null = null
        if (cmd.contentSearch) {
            if (cmd.regex) {
                const flags = cmd.caseSensitive ? '' : 'i'
                const re = new RegExp(cmd.contentSearch, flags)
                contentMatcher = (text) => re.test(text)
            } else {
                if (cmd.caseSensitive) {
                    const needle = cmd.contentSearch
                    contentMatcher = (text) => text.includes(needle)
                } else {
                    const needle = cmd.contentSearch.toLowerCase()
                    contentMatcher = (text) => text.toLowerCase().includes(needle)
                }
            }
        }

        let found = 0
        let scanned = 0
        let lastProgressTime = 0
        let batch: Array<{name: string; path: string; size: number}> = []
        let lastFlushTime = Date.now()

        const flushBatch = () => {
            if (batch.length > 0) {
                this.send({event: 'found', files: batch})
                batch = []
            }
            lastFlushTime = Date.now()
        }

        const sendProgress = (current: string) => {
            const now = Date.now()
            if (now - lastProgressTime >= 200) {
                lastProgressTime = now
                this.send({event: 'progress', current, found, scanned})
            }
        }

        const maybeFlush = () => {
            if (batch.length >= 20 || Date.now() - lastFlushTime >= 100) {
                flushBatch()
            }
        }

        const searchDir = async (dirPath: string, depth: number): Promise<void> => {
            if (this.cancelled) return

            sendProgress(dirPath)

            let dir
            try {
                dir = await opendir(dirPath)
            } catch {
                return
            }

            try {
                for await (const entry of dir) {
                    if (this.cancelled) break

                    scanned++
                    const fullPath = path.join(dirPath, entry.name)

                    if (entry.isDirectory()) {
                        if (cmd.maxDepth === -1 || depth < cmd.maxDepth) {
                            await searchDir(fullPath, depth + 1)
                        }
                    } else if (entry.isFile()) {
                        if (!matchName(entry.name)) continue

                        if (contentMatcher) {
                            try {
                                const text = await readFile(fullPath, 'utf-8')
                                if (!contentMatcher(text)) continue
                            } catch {
                                continue
                            }
                        }

                        let fileSize = 0
                        try {
                            const st = await stat(fullPath)
                            fileSize = st.size
                        } catch {
                            // ignore stat errors
                        }

                        const relativePath = path.relative(directory, path.dirname(fullPath))
                        batch.push({name: entry.name, path: relativePath || '.', size: fileSize})
                        found++
                        maybeFlush()
                    }
                }
            } finally {
                dir.close().catch(() => {})
            }
        }

        try {
            await searchDir(directory, 0)
            flushBatch()
            this.send({event: 'complete', found, scanned})
        } catch (err: unknown) {
            this.send({
                event: 'error',
                error: {
                    code: ErrorCode.INTERNAL,
                    message: err instanceof Error ? err.message : String(err),
                },
            })
        }
        this.closeWs()
    }
}

function isValidCommand(msg: unknown): msg is WsSearchClientCommand {
    if (!msg || typeof msg !== 'object') return false
    const m = msg as Record<string, unknown>

    if (m.command === 'start') {
        return typeof m.directory === 'string'
            && typeof m.fileMask === 'string'
            && typeof m.caseSensitive === 'boolean'
            && typeof m.regex === 'boolean'
            && typeof m.maxDepth === 'number'
    }
    if (m.command === 'cancel') {
        return true
    }
    return false
}
