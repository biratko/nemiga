import type {FSEntry} from '../protocol/fs-types.js'

export interface ExtractProgress {
    currentFile: string
    bytesWritten: number
    filesDone: number
}

export interface ExtractOptions {
    onProgress: (info: ExtractProgress) => void
    cancelled: () => boolean
}

export interface ArchiveAdapter {
    readonly extensions: string[]
    listEntries(archivePath: string): Promise<FSEntry[]>
    extract(archivePath: string, innerPaths: string[], destDir: string, options: ExtractOptions): Promise<{filesDone: number; bytesWritten: number}>
    add(archivePath: string, innerDestPath: string, sourcePaths: string[], options: ExtractOptions): Promise<{filesDone: number; bytesWritten: number}>
    deleteEntries(archivePath: string, innerPaths: string[]): Promise<{deleted: number}>
    mkdirEntry(archivePath: string, innerPath: string): Promise<void>
}