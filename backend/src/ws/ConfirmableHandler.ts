import {randomBytes} from 'node:crypto'
import type {WebSocket} from 'ws'
import type {ConfirmAction, UserConfirmAction} from '../protocol/fs-types.js'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import {ErrorCode} from '../protocol/errors.js'
import {PathGuardError} from '../providers/pathGuard.js'
import {BaseConnectionHandler, PROGRESS_THROTTLE_MS} from './BaseConnectionHandler.js'
import {normalizeSendPayload, fromPosix} from '../utils/platformPath.js'

export abstract class ConfirmableHandler extends BaseConnectionHandler {
    private cancelled = false
    private started = false
    private pendingConfirms = new Map<string, (action: ConfirmAction) => void>()
    private batchOverwrite = false
    private batchSkip = false

    constructor(ws: WebSocket, protected router: ProviderRouter) {
        super(ws)
    }

    handleMessage(msg: unknown): void {
        if (!isValidTransferCommand(msg)) return

        if (msg.command === 'start') {
            this.handleStart(msg.sources, msg.destination)
        } else if (msg.command === 'confirm_response') {
            this.handleConfirmResponse(msg.confirm_id, msg.action)
        } else if (msg.command === 'cancel') {
            this.cancel()
        }
    }

    cancel(): void {
        this.cancelled = true
        for (const resolver of this.pendingConfirms.values()) {
            resolver('abort')
        }
        this.pendingConfirms.clear()
    }

    protected abstract executeOperation(
        sources: string[],
        destination: string,
        ctx: TransferContext,
    ): Promise<TransferResult>

    protected abstract resolveProvider(
        sources: string[],
        destination: string,
    ): ReturnType<ProviderRouter['resolve']>

    private handleStart(rawSources: string[], rawDestination: string): void {
        if (this.started) return
        this.started = true

        const sources = rawSources.map(fromPosix)
        const destination = fromPosix(rawDestination)

        const handler = this
        let lastProgressTime = 0

        let provider
        try {
            provider = this.resolveProvider(sources, destination)
        } catch (err) {
            if (err instanceof PathGuardError) { this.sendPathGuardError(err); return }
            throw err
        }

        const ctx: TransferContext = {
            progress: {
                report: (info) => {
                    const now = Date.now()
                    if (now - lastProgressTime >= PROGRESS_THROTTLE_MS) {
                        lastProgressTime = now
                        handler.send(normalizeSendPayload({event: 'progress', ...info}))
                    }
                },
            },
            confirm: {
                ask: (req) => {
                    if (handler.batchSkip) return Promise.resolve('skip' as ConfirmAction)
                    if (handler.batchOverwrite) return Promise.resolve('overwrite' as ConfirmAction)

                    const confirmId = 'cfm_' + randomBytes(4).toString('hex')
                    return new Promise<ConfirmAction>((resolve) => {
                        handler.pendingConfirms.set(confirmId, resolve)
                        handler.send(normalizeSendPayload({event: 'confirm', confirm_id: confirmId, ...req}))
                    })
                },
            },
            cancellation: {
                get cancelled() {
                    return handler.cancelled
                },
            },
            provider,
        }

        this.executeOperation(sources, destination, ctx)
            .then((result) => {
                if (result.ok) {
                    handler.send(normalizeSendPayload({event: 'complete', ...result.data}))
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

    private handleConfirmResponse(confirmId: string, action: UserConfirmAction): void {
        const resolver = this.pendingConfirms.get(confirmId)
        if (!resolver) return
        this.pendingConfirms.delete(confirmId)

        if (action === 'overwrite_all') {
            this.batchOverwrite = true
            resolver('overwrite')
        } else if (action === 'skip_all') {
            this.batchSkip = true
            resolver('skip')
        } else {
            resolver(action)
        }
    }
}

export interface TransferContext {
    progress: { report(info: object): void }
    confirm: { ask(req: object): Promise<ConfirmAction> }
    cancellation: { readonly cancelled: boolean }
    provider: ReturnType<ProviderRouter['resolve']>
}

export type TransferResult =
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; error: { code: string; message: string } }

interface TransferCommand {
    command: 'start' | 'confirm_response' | 'cancel'
    sources?: string[]
    destination?: string
    confirm_id?: string
    action?: UserConfirmAction
}

function isValidTransferCommand(msg: unknown): msg is TransferCommand & (
    | { command: 'start'; sources: string[]; destination: string }
    | { command: 'confirm_response'; confirm_id: string; action: UserConfirmAction }
    | { command: 'cancel' }
) {
    if (!msg || typeof msg !== 'object') return false
    const m = msg as Record<string, unknown>

    if (m.command === 'start') {
        return Array.isArray(m.sources) && m.sources.length > 0
            && m.sources.every((s: unknown) => typeof s === 'string')
            && typeof m.destination === 'string'
    }
    if (m.command === 'confirm_response') {
        return typeof m.confirm_id === 'string' && isValidUserConfirmAction(m.action)
    }
    if (m.command === 'cancel') {
        return true
    }
    return false
}

const VALID_ACTIONS = new Set<string>(['overwrite', 'skip', 'overwrite_all', 'skip_all', 'abort'])

function isValidUserConfirmAction(action: unknown): action is UserConfirmAction {
    return typeof action === 'string' && VALID_ACTIONS.has(action)
}
