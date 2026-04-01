export type OperationError = {
    code: string
    message: string
}

export type CopyEvents = {
    progress: {event: 'progress'; copied_bytes: number; current_file: string; files_done: number}
    confirm: {event: 'confirm'; confirm_id: string; confirm_type: string; message: string; source: string; destination: string}
    complete: {event: 'complete'; files_done: number; bytes_copied: number; errors: Array<{file: string; reason: string}>}
    error: {event: 'error'; error: OperationError}
}

export type MoveEvents = {
    progress: {event: 'progress'; current_file: string; files_done: number}
    confirm: {event: 'confirm'; confirm_id: string; confirm_type: string; message: string; source: string; destination: string}
    complete: {event: 'complete'; files_done: number; errors: Array<{file: string; reason: string}>}
    error: {event: 'error'; error: OperationError}
}

export type DeleteEvents = {
    progress: {event: 'progress'; deleted: number; current: string}
    complete: {event: 'complete'; deleted: number}
    error: {event: 'error'; error: OperationError}
}

export type MkdirEvents = {
    complete: {event: 'complete'; path: string}
    error: {event: 'error'; error: OperationError}
}

export type ExtractEvents = {
    progress: {event: 'progress'; current_file: string; files_done: number; total_files: number}
    complete: {event: 'complete'; files_done: number; total_files: number}
    error: {event: 'error'; error: OperationError}
}

export type PackEvents = {
    progress: {event: 'progress'; current_file: string; files_done: number; total_files?: number}
    complete: {event: 'complete'; files_done: number; total_files?: number; archive_size: number; skipped: number}
    error: {event: 'error'; error: OperationError}
}

import type {FSEntry} from './fs'

export type SearchEvents = {
    found: {event: 'found'; files: FSEntry[]}
    progress: {event: 'progress'; current: string; found: number; scanned: number}
    complete: {event: 'complete'; found: number; scanned: number}
    error: {event: 'error'; error: OperationError}
}
