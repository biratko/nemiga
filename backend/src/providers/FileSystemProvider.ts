import type {ConfirmAction, ConfirmRequest, ProgressInfo, MoveProgressInfo, DeleteProgressInfo, CopyResult, MoveResult, DeleteResult, MkdirResult, RenameResult, ListResult} from '../protocol/fs-types.js'

export interface ProgressSink {
    report(info: ProgressInfo): void
}

export interface MoveProgressSink {
    report(info: MoveProgressInfo): void
}

export interface DeleteProgressSink {
    report(info: DeleteProgressInfo): void
}

export interface ConfirmResolver {
    ask(req: ConfirmRequest): Promise<ConfirmAction>
}

export interface CancellationToken {
    readonly cancelled: boolean
}

export interface OperationContext {
    progress: ProgressSink
    confirm: ConfirmResolver
    cancellation: CancellationToken
}

export interface DeleteContext {
    progress: DeleteProgressSink
    cancellation: CancellationToken
}

export interface MoveContext {
    progress: MoveProgressSink
    confirm: ConfirmResolver
    cancellation: CancellationToken
}

export interface CopyOptions {
    followSymlinks: boolean
}

export interface FileSystemProvider {
    list(dirPath: string): Promise<ListResult>
    copy(sources: string[], destination: string, ctx: OperationContext, options: CopyOptions): Promise<CopyResult>
    move(sources: string[], destination: string, ctx: MoveContext): Promise<MoveResult>
    delete(paths: string[], ctx: DeleteContext): Promise<DeleteResult>
    mkdir(dirPath: string): Promise<MkdirResult>
    rename(filePath: string, newName: string): Promise<RenameResult>
    createReadStream?(filePath: string): Promise<import('node:stream').Readable>
    createWriteStream?(filePath: string): Promise<import('node:stream').Writable>
}
