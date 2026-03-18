import type {WebSocket} from 'ws'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import type {FileSystemProvider} from '../providers/FileSystemProvider.js'
import {ConfirmableHandler, type TransferContext, type TransferResult} from './ConfirmableHandler.js'

export class CopyConnectionHandler extends ConfirmableHandler {
    constructor(
        ws: WebSocket,
        router: ProviderRouter,
        private followSymlinks: boolean,
    ) {
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
        const result = await ctx.provider.copy(sources, destination, {
            progress: ctx.progress,
            confirm: ctx.confirm,
            cancellation: ctx.cancellation,
        }, {followSymlinks: this.followSymlinks})

        if (result.ok) {
            return {
                ok: true,
                data: {
                    files_done: result.files_done,
                    bytes_copied: result.bytes_copied,
                    errors: result.errors,
                },
            }
        }
        return result
    }
}
