import type {ErrorInfo} from './errors.js'
import type {ListResult} from './fs-types.js'
import type {SettingsState} from './settings-types.js'
import type {WorkspaceState} from './workspace-types.js'

// GET /api/fs/list?path=...
export interface FsListRequest {
    path: string
}
export type FsListResponse = ListResult

// GET /api/workspace
export type GetWorkspaceResponse = {ok: true; workspace: WorkspaceState}

// PUT /api/workspace
export type PutWorkspaceRequest = {workspace: WorkspaceState}
export type PutWorkspaceResponse =
    | {ok: true}
    | {ok: false; error: ErrorInfo}

// GET /api/settings
export type GetSettingsResponse = {ok: true; settings: SettingsState}

// PUT /api/settings
export type PutSettingsRequest = {settings: SettingsState}
export type PutSettingsResponse =
    | {ok: true}
    | {ok: false; error: ErrorInfo}
