import {WebSocket} from 'ws'
import {PathGuardError} from '../providers/pathGuard.js'
import {ErrorCode} from '../protocol/errors.js'

export const PROGRESS_THROTTLE_MS = 100

export abstract class BaseConnectionHandler {
    protected constructor(protected ws: WebSocket) {}

    abstract cancel(): void
    abstract handleMessage(msg: unknown): void

    protected send(event: object): void {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(event))
        }
    }

    protected closeWs(): void {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close(1000, 'operation done')
        }
    }

    protected sendPathGuardError(err: PathGuardError): void {
        this.send({event: 'error', error: {code: ErrorCode.PERMISSION_DENIED, message: err.message}})
        this.closeWs()
    }
}
