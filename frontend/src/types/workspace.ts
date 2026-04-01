import type {PanelTabsState} from './tabs'

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

export interface PanelState {
    left: PanelTabsState
    right: PanelTabsState
    columnWidths?: {
        left?: ColumnWidths
        right?: ColumnWidths
        search?: SearchColumnWidths
    }
}
