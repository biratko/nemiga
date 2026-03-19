import path from 'node:path'
import fs from 'node:fs/promises'
import type {WebSocket} from 'ws'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import type {WsPackClientCommand} from '../protocol/ws-types.js'
import {ErrorCode} from '../protocol/errors.js'
import {PathGuardError} from '../providers/pathGuard.js'
import {isArchivePath} from '../archive/ArchiveProvider.js'
import {isCreatableAdapter} from '../archive/CreatableAdapter.js'
import {BaseConnectionHandler, PROGRESS_THROTTLE_MS} from './BaseConnectionHandler.js'
import {fromPosix} from '../utils/platformPath.js'

export class PackConnectionHandler extends BaseConnectionHandler {
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

    private handleStart(msg: WsPackClientCommand & {command: 'start'}): void {
        if (this.started) return
        this.started = true

        const handler = this
        let lastProgressTime = 0

        // Validate archiveName — must be simple filename
        const archiveName = msg.archiveName
        if (!archiveName || archiveName.includes('/') || archiveName.includes('\\') || archiveName.includes('..')) {
            handler.send({event: 'error', error: {code: ErrorCode.INVALID_REQUEST, message: 'Invalid archive name'}})
            handler.closeWs()
            return
        }

        const destination = fromPosix(msg.destination)
        const archivePath = path.join(destination, archiveName)

        // Reject archive-internal destination
        if (isArchivePath(destination)) {
            handler.send({event: 'error', error: {code: ErrorCode.INVALID_REQUEST, message: 'Cannot pack to archive path'}})
            handler.closeWs()
            return
        }

        // Validate destination
        try {
            this.router.resolve(destination)
        } catch (err) {
            if (err instanceof PathGuardError) { this.sendPathGuardError(err); return }
            throw err
        }

        // Validate full archive path
        try {
            this.router.resolve(archivePath)
        } catch (err) {
            if (err instanceof PathGuardError) { this.sendPathGuardError(err); return }
            throw err
        }

        // Validate source paths
        const sourcePaths: string[] = []
        for (const raw of msg.sourcePaths) {
            const p = fromPosix(raw)
            if (isArchivePath(p)) {
                handler.send({event: 'error', error: {code: ErrorCode.INVALID_REQUEST, message: 'Cannot pack from inside an archive'}})
                handler.closeWs()
                return
            }
            try {
                this.router.resolve(p)
            } catch (err) {
                if (err instanceof PathGuardError) { this.sendPathGuardError(err); return }
                throw err
            }
            sourcePaths.push(p)
        }

        // Find adapter
        const adapter = this.router.findAdapter(archivePath)
        if (!adapter || !isCreatableAdapter(adapter)) {
            handler.send({event: 'error', error: {code: ErrorCode.INTERNAL, message: 'No adapter supports creating this archive format'}})
            handler.closeWs()
            return
        }

        ;(async () => {
            // Check if archive already exists
            try {
                await fs.access(archivePath)
                // File exists
                if (!msg.overwrite) {
                    handler.send({event: 'error', error: {code: ErrorCode.ALREADY_EXISTS, message: `Archive "${archiveName}" already exists`}})
                    handler.closeWs()
                    return
                }
            } catch {
                // File does not exist — good
            }

            // Count total files recursively
            let totalFiles = 0
            for (const p of sourcePaths) {
                totalFiles += await countFiles(p)
            }

            const result = await adapter.create(archivePath, sourcePaths, {
                onProgress: (info) => {
                    const now = Date.now()
                    if (now - lastProgressTime >= PROGRESS_THROTTLE_MS) {
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

            // Get archive size
            const stat = await fs.stat(archivePath)

            handler.send({
                event: 'complete',
                files_done: result.filesDone,
                total_files: totalFiles,
                archive_size: stat.size,
                skipped: result.skipped,
            })
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

async function countFiles(p: string): Promise<number> {
    const stat = await fs.stat(p)
    if (!stat.isDirectory()) return 1
    let count = 0
    const entries = await fs.readdir(p, {withFileTypes: true})
    for (const entry of entries) {
        if (entry.isDirectory()) {
            count += await countFiles(path.join(p, entry.name))
        } else {
            count++
        }
    }
    return count
}

function isValidCommand(msg: unknown): msg is WsPackClientCommand {
    if (!msg || typeof msg !== 'object') return false
    const m = msg as Record<string, unknown>

    if (m.command === 'start') {
        return Array.isArray(m.sourcePaths)
            && m.sourcePaths.every((p: unknown) => typeof p === 'string')
            && typeof m.destination === 'string'
            && typeof m.archiveName === 'string'
            && typeof m.overwrite === 'boolean'
    }
    if (m.command === 'cancel') {
        return true
    }
    return false
}
