import type {FSEntry} from '../protocol'

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

    /** Returns true if the archive at the given path cannot be modified (e.g. .rar via 7z). */
    isReadonly(archivePath: string): boolean

    /** Rename a single entry inside the archive. Throws if the format is read-only or the source is missing. */
    renameEntry(archivePath: string, oldInnerPath: string, newInnerPath: string): Promise<void>

    /** Replace the content of a single file entry from a local file on disk. Throws if read-only or entry is a directory. */
    replaceEntry(archivePath: string, innerPath: string, sourcePath: string): Promise<void>
}
