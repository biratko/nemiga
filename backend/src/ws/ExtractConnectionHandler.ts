import path from 'node:path'
import fs from 'node:fs/promises'
import type {WebSocket} from 'ws'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import type {WsExtractClientCommand} from '../protocol/ws-types.js'
import {ErrorCode} from '../protocol/errors.js'
import {PathGuardError} from '../providers/pathGuard.js'
import {isArchivePath} from '../archive/ArchiveProvider.js'
import {BaseConnectionHandler} from './BaseConnectionHandler.js'
import {stripArchiveSuffix} from './stripArchiveSuffix.js'

export class ExtractConnectionHandler extends BaseConnectionHandler {
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

    private handleStart(msg: WsExtractClientCommand & {command: 'start'}): void {
        if (this.started) return
        this.started = true

        const handler = this
        let lastProgressTime = 0

        // Validate paths
        try {
            this.router.resolve(msg.archivePath) // triggers pathGuard
        } catch (err) {
            if (err instanceof PathGuardError) { this.sendPathGuardError(err); return }
            throw err
        }

        // Reject archive destination
        if (isArchivePath(msg.destination)) {
            handler.send({event: 'error', error: {code: ErrorCode.INVALID_REQUEST, message: 'Cannot extract to archive path'}})
            handler.closeWs()
            return
        }

        try {
            this.router.resolve(msg.destination) // triggers pathGuard
        } catch (err) {
            if (err instanceof PathGuardError) { this.sendPathGuardError(err); return }
            throw err
        }

        // Find adapter
        const adapter = this.router.findAdapter(msg.archivePath)
        if (!adapter) {
            handler.send({event: 'error', error: {code: ErrorCode.INTERNAL, message: 'No adapter for archive'}})
            handler.closeWs()
            return
        }

        // Run extraction asynchronously
        ;(async () => {
            // Get all entries to compute total and inner paths
            const allEntries = await adapter.listEntries(msg.archivePath)
            const totalFiles = allEntries.filter(e => e.type !== 'directory').length
            const innerPaths = allEntries
                .filter(e => !e.name.includes('/'))
                .map(e => e.name)

            // Compute destination
            let dest = msg.destination
            if (msg.toSubfolder) {
                const subfolder = stripArchiveSuffix(path.basename(msg.archivePath))
                dest = path.join(dest, subfolder)
            }
            await fs.mkdir(dest, {recursive: true})

            const result = await adapter.extract(msg.archivePath, innerPaths, dest, {
                onProgress: (info) => {
                    const now = Date.now()
                    if (now - lastProgressTime >= 100) {
                        lastProgressTime = now
                        handler.send({
                            event: 'progress',
                            current_file: info.currentFile,
                            files_done: info.filesDone,
                            total_files: totalFiles,
                        })
                    }
                },
                cancelled: () => handler.cancelled,
            })

            handler.send({event: 'complete', files_done: result.filesDone, total_files: totalFiles})
            handler.closeWs()
        })().catch((err: unknown) => {
            handler.send({
                event: 'error',
                error: {
                    code: ErrorCode.INTERNAL,
                    message: err instanceof Error ? err.message : String(err),
                },
            })
            handler.closeWs()
        })
    }
}

function isValidCommand(msg: unknown): msg is WsExtractClientCommand {
    if (!msg || typeof msg !== 'object') return false
    const m = msg as Record<string, unknown>

    if (m.command === 'start') {
        return typeof m.archivePath === 'string'
            && typeof m.destination === 'string'
            && typeof m.toSubfolder === 'boolean'
    }
    if (m.command === 'cancel') {
        return true
    }
    return false
}
