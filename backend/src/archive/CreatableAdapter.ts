// backend/src/archive/CreatableAdapter.ts
import type {ArchiveAdapter} from './ArchiveAdapter.js'

export interface PackProgress {
    currentFile: string
    filesDone: number
    bytesWritten: number
}

export interface PackOptions {
    onProgress: (info: PackProgress) => void
    cancelled: () => boolean
}

export interface CreatableAdapter extends ArchiveAdapter {
    create(
        archivePath: string,
        sourcePaths: string[],
        options: PackOptions,
    ): Promise<{filesDone: number; bytesWritten: number; skipped: number}>
}

export function isCreatableAdapter(adapter: ArchiveAdapter): adapter is CreatableAdapter {
    return 'create' in adapter
}
