import type {ErrorInfo} from './errors.js'
import type {UserConfirmAction} from './fs-types.js'

// ── Copy: Server → Client events ──

export interface WsCopyProgressEvent {
    event: 'progress'
    copied_bytes: number
    current_file: string
    files_done: number
}

export interface WsCopyConfirmEvent {
    event: 'confirm'
    confirm_id: string
    confirm_type: string
    message: string
    source: string
    destination: string
}

export interface WsCopyCompleteEvent {
    event: 'complete'
    files_done: number
    bytes_copied: number
    errors: Array<{file: string; reason: string}>
}

export interface WsCopyErrorEvent {
    event: 'error'
    error: ErrorInfo
}

export type WsCopyServerEvent =
    | WsCopyProgressEvent
    | WsCopyConfirmEvent
    | WsCopyCompleteEvent
    | WsCopyErrorEvent

// ── Copy: Client → Server commands ──

export interface WsCopyStartCommand {
    command: 'start'
    sources: string[]
    destination: string
}

export interface WsCopyConfirmResponseCommand {
    command: 'confirm_response'
    confirm_id: string
    action: UserConfirmAction
}

export interface WsCopyCancelCommand {
    command: 'cancel'
}

export type WsCopyClientCommand =
    | WsCopyStartCommand
    | WsCopyConfirmResponseCommand
    | WsCopyCancelCommand

// ── Move: Server → Client events ──

export interface WsMoveProgressEvent {
    event: 'progress'
    current_file: string
    files_done: number
}

export interface WsMoveConfirmEvent {
    event: 'confirm'
    confirm_id: string
    confirm_type: string
    message: string
    source: string
    destination: string
}

export interface WsMoveCompleteEvent {
    event: 'complete'
    files_done: number
    errors: Array<{file: string; reason: string}>
}

export interface WsMoveErrorEvent {
    event: 'error'
    error: ErrorInfo
}

export type WsMoveServerEvent =
    | WsMoveProgressEvent
    | WsMoveConfirmEvent
    | WsMoveCompleteEvent
    | WsMoveErrorEvent

// ── Move: Client → Server commands ──

export interface WsMoveStartCommand {
    command: 'start'
    sources: string[]
    destination: string
}

export interface WsMoveConfirmResponseCommand {
    command: 'confirm_response'
    confirm_id: string
    action: UserConfirmAction
}

export interface WsMoveCancelCommand {
    command: 'cancel'
}

export type WsMoveClientCommand =
    | WsMoveStartCommand
    | WsMoveConfirmResponseCommand
    | WsMoveCancelCommand

// ── Delete: Server → Client events ──

export interface WsDeleteProgressEvent {
    event: 'progress'
    deleted: number
    current: string
}

export interface WsDeleteCompleteEvent {
    event: 'complete'
    deleted: number
}

export interface WsDeleteErrorEvent {
    event: 'error'
    error: ErrorInfo
}

export type WsDeleteServerEvent =
    | WsDeleteProgressEvent
    | WsDeleteCompleteEvent
    | WsDeleteErrorEvent

// ── Delete: Client → Server commands ──

export interface WsDeleteStartCommand {
    command: 'start'
    paths: string[]
}

export interface WsDeleteCancelCommand {
    command: 'cancel'
}

export type WsDeleteClientCommand =
    | WsDeleteStartCommand
    | WsDeleteCancelCommand

// ── Mkdir: Server → Client events ──

export interface WsMkdirCompleteEvent {
    event: 'complete'
    path: string
}

export interface WsMkdirErrorEvent {
    event: 'error'
    error: ErrorInfo
}

export type WsMkdirServerEvent =
    | WsMkdirCompleteEvent
    | WsMkdirErrorEvent

// ── Mkdir: Client → Server commands ──

export interface WsMkdirStartCommand {
    command: 'start'
    path: string
}

export type WsMkdirClientCommand = WsMkdirStartCommand

// ── Extract: Server → Client events ──

export interface WsExtractProgressEvent {
    event: 'progress'
    current_file: string
    files_done: number
    total_files: number
}

export interface WsExtractCompleteEvent {
    event: 'complete'
    files_done: number
    total_files: number
}

export interface WsExtractErrorEvent {
    event: 'error'
    error: ErrorInfo
}

export type WsExtractServerEvent =
    | WsExtractProgressEvent
    | WsExtractCompleteEvent
    | WsExtractErrorEvent

// ── Extract: Client → Server commands ──

export interface WsExtractStartCommand {
    command: 'start'
    archivePath: string
    destination: string
    toSubfolder: boolean
}

export interface WsExtractCancelCommand {
    command: 'cancel'
}

export type WsExtractClientCommand =
    | WsExtractStartCommand
    | WsExtractCancelCommand

// ── Pack: Server → Client events ──

export interface WsPackProgressEvent {
    event: 'progress'
    current_file: string
    files_done: number
    total_files: number
}

export interface WsPackCompleteEvent {
    event: 'complete'
    files_done: number
    total_files: number
    archive_size: number
    skipped: number
}

export interface WsPackErrorEvent {
    event: 'error'
    error: ErrorInfo
}

export type WsPackServerEvent =
    | WsPackProgressEvent
    | WsPackCompleteEvent
    | WsPackErrorEvent

// ── Pack: Client → Server commands ──

export interface WsPackStartCommand {
    command: 'start'
    sourcePaths: string[]
    destination: string
    archiveName: string
    overwrite: boolean
}

export interface WsPackCancelCommand {
    command: 'cancel'
}

export type WsPackClientCommand =
    | WsPackStartCommand
    | WsPackCancelCommand
