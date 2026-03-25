import {access} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import os from 'node:os'
import type {StorageProvider} from '../storage/StorageProvider.js'
import type {WorkspaceState, PanelTabsState, TabState, PanelSort} from '../protocol/workspace-types.js'

const STORAGE_KEY = 'workspace'

async function isAccessible(p: string): Promise<boolean> {
    try {
        await access(p)
        return true
    } catch {
        return false
    }
}

const VALID_SORT_KEYS = new Set(['name', 'size', 'modified'])
const VALID_SORT_DIRS = new Set(['asc', 'desc'])
const VALID_TAB_MODES = new Set(['normal', 'locked', 'fixed'])

function parseSort(raw: unknown): PanelSort | undefined {
    if (!raw || typeof raw !== 'object') return undefined
    const s = raw as Record<string, unknown>
    if (VALID_SORT_KEYS.has(s.key as string) && VALID_SORT_DIRS.has(s.dir as string)) {
        return {key: s.key as PanelSort['key'], dir: s.dir as PanelSort['dir']}
    }
    return undefined
}

function defaultPanelTabs(path: string): PanelTabsState {
    return {
        tabs: [{id: randomUUID(), path, mode: 'normal'}],
        activeTabIndex: 0,
    }
}

function defaultState(): WorkspaceState {
    const home = os.homedir()
    return {panels: {left: defaultPanelTabs(home), right: defaultPanelTabs(home)}}
}

/** Migrate old flat panel format {path, sort} to tabbed format */
function migrateOldPanel(raw: Record<string, unknown>): PanelTabsState | null {
    if (typeof raw.path === 'string' && !Array.isArray(raw.tabs)) {
        return {
            tabs: [{
                id: randomUUID(),
                path: raw.path,
                sort: parseSort(raw.sort),
                mode: 'normal',
            }],
            activeTabIndex: 0,
        }
    }
    return null
}

async function validateTab(tab: TabState, fallbackPath: string): Promise<TabState> {
    const pathOk = typeof tab.path === 'string' && await isAccessible(tab.path)
    const validMode = VALID_TAB_MODES.has(tab.mode) ? tab.mode : 'normal' as const
    return {
        id: tab.id || randomUUID(),
        path: pathOk ? tab.path : fallbackPath,
        sort: parseSort(tab.sort),
        cursorIndex: typeof tab.cursorIndex === 'number' ? tab.cursorIndex : 0,
        selectedNames: Array.isArray(tab.selectedNames) ? tab.selectedNames.filter(n => typeof n === 'string') : [],
        mode: validMode,
        fixedPath: typeof tab.fixedPath === 'string' ? tab.fixedPath : undefined,
    }
}

async function validatePanelTabs(raw: unknown, fallbackPath: string): Promise<PanelTabsState> {
    if (!raw || typeof raw !== 'object') return defaultPanelTabs(fallbackPath)

    const obj = raw as Record<string, unknown>

    // Migrate old format
    const migrated = migrateOldPanel(obj)
    if (migrated) {
        const tab = await validateTab(migrated.tabs[0], fallbackPath)
        return {tabs: [tab], activeTabIndex: 0}
    }

    // New format
    if (!Array.isArray(obj.tabs) || obj.tabs.length === 0) return defaultPanelTabs(fallbackPath)

    const tabs: TabState[] = []
    for (const t of obj.tabs) {
        if (t && typeof t === 'object') {
            tabs.push(await validateTab(t as TabState, fallbackPath))
        }
    }
    if (tabs.length === 0) return defaultPanelTabs(fallbackPath)

    const activeIdx = typeof obj.activeTabIndex === 'number' ? obj.activeTabIndex : 0
    return {
        tabs,
        activeTabIndex: Math.max(0, Math.min(activeIdx, tabs.length - 1)),
    }
}

export class WorkspaceService {
    constructor(private storage: StorageProvider) {}

    async load(): Promise<WorkspaceState> {
        const parsed = await this.storage.load<Record<string, unknown>>(STORAGE_KEY)
        if (!parsed) return defaultState()

        const home = os.homedir()
        const panels = parsed.panels as Record<string, unknown> | undefined
        return {
            panels: {
                left: await validatePanelTabs(panels?.left, home),
                right: await validatePanelTabs(panels?.right, home),
            },
        }
    }

    async save(state: WorkspaceState): Promise<void> {
        await this.storage.save(STORAGE_KEY, state)
    }
}
