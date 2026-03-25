import type {FSEntry} from './fs'

export interface PanelAPI {
    currentPath: string
    cursorIndex: number
    cursorEntry: FSEntry | null
    selectedNamesArray: string[]
    selectedEntries: FSEntry[]
    loadDirectory(path: string, restoreState?: {cursorIndex?: number; selectedNames?: string[]}): Promise<void>
    moveCursorUp(): void
    moveCursorDown(): void
    enterCursor(): void
    goUp(): Promise<void>
    toggleCursorSelection(): void
    setKeyboardActive(val: boolean): void
    startRename(): void
}
