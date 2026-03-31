import type {PanelSort} from './workspace'
import type {SearchResultEntry} from './panel'

export type TabMode = 'normal' | 'locked' | 'fixed'

export interface TabState {
    id: string
    path: string
    sort: PanelSort
    cursorIndex: number
    selectedNames: string[]
    mode: TabMode
    fixedPath?: string
    searchResults?: SearchResultEntry[]
}

export interface PanelTabsState {
    tabs: TabState[]
    activeTabIndex: number
}
