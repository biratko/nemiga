import type {PanelTabsState} from './tabs'

export interface PanelSort {
    key: 'name' | 'size' | 'modified'
    dir: 'asc' | 'desc'
}

export interface PanelState {
    left: PanelTabsState
    right: PanelTabsState
}
