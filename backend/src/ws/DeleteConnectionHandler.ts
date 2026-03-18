import type {WebSocket} from 'ws'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import type {DeleteResult} from '../protocol/fs-types.js'
import type {WsDeleteClientCommand} from '../protocol/ws-types.js'
import {ErrorCode} from '../protocol/errors.js'
import {PathGuardError} from '../providers/pathGuard.js'
import {BaseConnectionHandler} from './BaseConnectionHandler.js'

export class DeleteConnectionHandler extends BaseConnectionHandler {
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
            this.handleStart(msg.paths)
        } else if (msg.command === 'cancel') {
            this.cancel()
        }
    }

    cancel(): void {
        this.cancelled = true
    }

    private handleStart(paths: string[]): void {
        if (this.started) return
        this.started = true

        const handler = this
        let lastProgressTime = 0

        let provider
        try {
            provider = this.router.resolve(paths[0])
        } catch (err) {
            if (err instanceof PathGuardError) { this.sendPathGuardError(err); return }
            throw err
        }
        provider
            .delete(paths, {
                progress: {
                    report: (info) => {
                        const now = Date.now()
                        if (now - lastProgressTime >= 100) {
                            lastProgressTime = now
                            handler.send({event: 'progress', ...info})
                        }
                    },
                },
                cancellation: {
                    get cancelled() {
                        return handler.cancelled
                    },
                },
            })
            .then((result: DeleteResult) => {
                if (result.ok) {
                    handler.send({event: 'complete', deleted: result.deleted})
                } else {
                    handler.send({event: 'error', error: result.error})
                }
                handler.closeWs()
            })
            .catch((err: unknown) => {
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

function isValidCommand(msg: unknown): msg is WsDeleteClientCommand {
    if (!msg || typeof msg !== 'object') return false
    const m = msg as Record<string, unknown>

    if (m.command === 'start') {
        return Array.isArray(m.paths) && m.paths.length > 0
            && m.paths.every((s: unknown) => typeof s === 'string')
    }
    if (m.command === 'cancel') {
        return true
    }
    return false
}
