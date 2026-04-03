import type {PanelSort} from './workspace'
import type {FSEntry} from './fs'

export type TabMode = 'normal' | 'locked' | 'fixed'

export interface TabState {
    id: string
    path: string
    sort: PanelSort
    cursorIndex: number
    selectedNames: string[]
    mode: TabMode
    fixedPath?: string
    searchResults?: FSEntry[]
    customName?: string
}

export interface PanelTabsState {
    tabs: TabState[]
    activeTabIndex: number
}
