import type {Request, Response} from 'express'
import type {WorkspaceService} from '../workspace/WorkspaceService.js'
import type {WorkspaceState, TabState, PanelTabsState, PanelSort} from '../protocol/workspace-types.js'
import {ErrorCode} from '../protocol/errors.js'

const VALID_SORT_KEYS = new Set(['name', 'size', 'modified'])
const VALID_SORT_DIRS = new Set(['asc', 'desc'])
const VALID_TAB_MODES = new Set(['normal', 'locked', 'fixed'])

function isValidSort(v: unknown): v is PanelSort {
    if (!v || typeof v !== 'object') return false
    const s = v as Record<string, unknown>
    return VALID_SORT_KEYS.has(s.key as string) && VALID_SORT_DIRS.has(s.dir as string)
}

function isValidTab(v: unknown): v is TabState {
    if (!v || typeof v !== 'object') return false
    const t = v as Record<string, unknown>
    if (typeof t.id !== 'string' || typeof t.path !== 'string') return false
    if (!VALID_TAB_MODES.has(t.mode as string)) return false
    if (t.sort !== undefined && !isValidSort(t.sort)) return false
    if (t.cursorIndex !== undefined && typeof t.cursorIndex !== 'number') return false
    if (t.selectedNames !== undefined) {
        if (!Array.isArray(t.selectedNames) || !t.selectedNames.every((n: unknown) => typeof n === 'string')) return false
    }
    if (t.fixedPath !== undefined && typeof t.fixedPath !== 'string') return false
    return true
}

function isValidPanel(v: unknown): v is PanelTabsState {
    if (!v || typeof v !== 'object') return false
    const p = v as Record<string, unknown>
    if (!Array.isArray(p.tabs) || p.tabs.length === 0) return false
    if (typeof p.activeTabIndex !== 'number') return false
    return p.tabs.every(isValidTab)
}

function sanitizeWorkspace(raw: unknown): WorkspaceState | null {
    if (!raw || typeof raw !== 'object') return null
    const w = raw as Record<string, unknown>
    if (!w.panels || typeof w.panels !== 'object') return null
    const panels = w.panels as Record<string, unknown>
    if (!isValidPanel(panels.left) || !isValidPanel(panels.right)) return null
    return {panels: {left: panels.left, right: panels.right}}
}

export function makeGetWorkspaceHandler(workspaceService: WorkspaceService) {
    return async (_req: Request, res: Response): Promise<void> => {
        const workspace = await workspaceService.load()
        res.json({ok: true, workspace})
    }
}

export function makePutWorkspaceHandler(workspaceService: WorkspaceService) {
    return async (req: Request, res: Response): Promise<void> => {
        const raw = (req.body as {workspace?: unknown})?.workspace
        const workspace = sanitizeWorkspace(raw)

        if (!workspace) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'invalid workspace shape'}})
            return
        }

        await workspaceService.save(workspace)
        res.json({ok: true})
    }
}
