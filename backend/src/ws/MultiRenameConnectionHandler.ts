import type {WebSocket} from 'ws'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import type {WsMultiRenameClientCommand} from '../protocol/ws-types.js'
import {ErrorCode} from '../protocol/errors.js'
import {PathGuardError} from '../providers/pathGuard.js'
import {BaseConnectionHandler} from './BaseConnectionHandler.js'
import {fromPosix} from '../utils/platformPath.js'

export class MultiRenameConnectionHandler extends BaseConnectionHandler {
    private started = false
    private cancelled = false

    constructor(
        ws: WebSocket,
        private router: ProviderRouter,
    ) {
        super(ws)
    }

    handleMessage(msg: unknown): void {
        if (!isValidCommand(msg)) return

        if (msg.command === 'start') {
            this.handleStart(msg.renames)
        } else if (msg.command === 'cancel') {
            this.cancelled = true
        }
    }

    cancel(): void {
        this.cancelled = true
    }

    private async handleStart(renames: Array<{path: string; newName: string}>): Promise<void> {
        if (this.started) return
        this.started = true

        const total = renames.length
        let renamed = 0
        let errors = 0

        for (let i = 0; i < renames.length; i++) {
            if (this.cancelled) break

            const {path: rawPath, newName} = renames[i]
            const filePath = fromPosix(rawPath)

            try {
                const provider = this.router.resolve(filePath)
                const result = await provider.rename(filePath, newName)

                if (result.ok) {
                    renamed++
                } else {
                    errors++
                    this.send({
                        event: 'error_item',
                        index: i,
                        name: renames[i].newName,
                        message: result.error?.message ?? 'Unknown error',
                    })
                }
            } catch (err) {
                errors++
                if (err instanceof PathGuardError) {
                    this.send({
                        event: 'error_item',
                        index: i,
                        name: renames[i].newName,
                        message: err.message,
                    })
                } else {
                    this.send({
                        event: 'error_item',
                        index: i,
                        name: renames[i].newName,
                        message: err instanceof Error ? err.message : String(err),
                    })
                }
            }

            this.send({event: 'progress', current: i + 1, total, name: renames[i].newName})
        }

        this.send({event: 'complete', renamed, errors})
        this.closeWs()
    }
}

function isValidCommand(msg: unknown): msg is WsMultiRenameClientCommand {
    if (!msg || typeof msg !== 'object') return false
    const m = msg as Record<string, unknown>
    if (m.command === 'cancel') return true
    if (m.command === 'start' && Array.isArray(m.renames)) {
        return m.renames.every(
            (r: unknown) =>
                r && typeof r === 'object' &&
                typeof (r as Record<string, unknown>).path === 'string' &&
                typeof (r as Record<string, unknown>).newName === 'string',
        )
    }
    return false
}
