export interface PanelSort {
    key: 'name' | 'size' | 'modified'
    dir: 'asc' | 'desc'
}

export interface ColumnWidths {
    name: number
    size: number
    date: number
}

export interface SearchColumnWidths extends ColumnWidths {
    path: number
}

export type TabMode = 'normal' | 'locked' | 'fixed'

export interface TabState {
    id: string
    path: string
    sort?: PanelSort
    cursorIndex?: number
    selectedNames?: string[]
    mode: TabMode
    fixedPath?: string
    customName?: string
}

export interface PanelTabsState {
    tabs: TabState[]
    activeTabIndex: number
}

export interface WorkspaceState {
    panels: {
        left: PanelTabsState
        right: PanelTabsState
    }
    columnWidths?: {
        left?: ColumnWidths
        right?: ColumnWidths
        search?: SearchColumnWidths
    }
}
