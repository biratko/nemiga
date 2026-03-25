import type {WebSocket} from 'ws'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import type {WsMkdirClientCommand} from '../protocol/ws-types.js'
import {ErrorCode} from '../protocol/errors.js'
import {PathGuardError} from '../providers/pathGuard.js'
import {BaseConnectionHandler} from './BaseConnectionHandler.js'
import {fromPosix, toPosix} from '../utils/platformPath.js'

export class MkdirConnectionHandler extends BaseConnectionHandler {
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
            this.handleStart(msg.path)
        }
    }

    cancel(): void {
        // nothing to cancel for a single mkdir
    }

    private handleStart(rawPath: string): void {
        if (this.started) return
        this.started = true
        const dirPath = fromPosix(rawPath)

        let provider
        try {
            provider = this.router.resolve(dirPath)
        } catch (err) {
            if (err instanceof PathGuardError) { this.sendPathGuardError(err); return }
            throw err
        }
        provider
            .mkdir(dirPath)
            .then((result) => {
                if (result.ok) {
                    this.send({event: 'complete', path: toPosix(result.path)})
                } else {
                    this.send({event: 'error', error: result.error})
                }
                this.closeWs()
            })
            .catch((err: unknown) => {
                this.send({
                    event: 'error',
                    error: {
                        code: ErrorCode.INTERNAL,
                        message: err instanceof Error ? err.message : String(err),
                    },
                })
                this.closeWs()
            })
    }
}

function isValidCommand(msg: unknown): msg is WsMkdirClientCommand {
    if (!msg || typeof msg !== 'object') return false
    const m = msg as Record<string, unknown>
    return m.command === 'start' && typeof m.path === 'string' && m.path.length > 0
}