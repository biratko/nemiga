import type {ErrorInfo} from './errors.js'

export type FSEntry = {
    name: string
    type: 'file' | 'directory' | 'symlink'
    size: number
    modified: string
    permissions: string
    extension: string | null
    hidden: boolean
    symlink_target: string | null
    symlink_target_type: 'file' | 'directory' | null
    isArchive?: boolean
    searchPath?: string
}

// What the provider asks for (per-file decision)
export type ConfirmAction = 'overwrite' | 'skip' | 'abort'

// What the user responds with (may include batch hint)
export type UserConfirmAction = 'overwrite' | 'skip' | 'overwrite_all' | 'skip_all' | 'abort'

export type ConfirmRequest = {
    confirm_type: string
    message: string
    source: string
    destination: string
}

export type ProgressInfo = {
    copied_bytes: number
    current_file: string
    files_done: number
}

export type DeleteProgressInfo = {
    deleted: number
    current: string
}

export type CopyResult =
    | {ok: true; files_done: number; bytes_copied: number; errors: Array<{file: string; reason: string}>}
    | {ok: false; error: ErrorInfo}

export type MoveProgressInfo = {
    current_file: string
    files_done: number
}

export type MoveResult =
    | {ok: true; files_done: number; errors: Array<{file: string; reason: string}>}
    | {ok: false; error: ErrorInfo}

export type DeleteResult =
    | {ok: true; deleted: number; errors?: Array<{file: string; reason: string}>}
    | {ok: false; error: ErrorInfo}

export type MkdirResult =
    | {ok: true; path: string}
    | {ok: false; error: ErrorInfo}

export type RenameResult =
    | {ok: true}
    | {ok: false; error: ErrorInfo}

export type ListResult =
    | {ok: true; path: string; entries: FSEntry[]}
    | {ok: false; error: ErrorInfo}

export interface DriveEntry {
    name: string
    path: string
}

export type RootsResult =
    | { ok: true; roots: DriveEntry[] }
    | { ok: false; error: ErrorInfo }
