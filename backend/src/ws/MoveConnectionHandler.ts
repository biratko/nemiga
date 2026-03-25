import type {WebSocket} from 'ws'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import type {FileSystemProvider} from '../providers/FileSystemProvider.js'
import {ConfirmableHandler, type TransferContext, type TransferResult} from './ConfirmableHandler.js'

export class MoveConnectionHandler extends ConfirmableHandler {
    constructor(ws: WebSocket, router: ProviderRouter) {
        super(ws, router)
    }

    protected resolveProvider(sources: string[], destination: string): FileSystemProvider {
        return this.router.resolveForTransfer(sources, destination)
    }

    protected async executeOperation(
        sources: string[],
        destination: string,
        ctx: TransferContext,
    ): Promise<TransferResult> {
        const result = await ctx.provider.move(sources, destination, {
            progress: ctx.progress,
            confirm: ctx.confirm,
            cancellation: ctx.cancellation,
        })

        if (result.ok) {
            return {
                ok: true,
                data: {
                    files_done: result.files_done,
                    errors: result.errors,
                },
            }
        }
        return result
    }
}
