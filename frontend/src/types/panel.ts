import type {FSEntry} from './fs'

export interface PanelAPI {
    currentPath: string
    cursorIndex: number
    cursorEntry: FSEntry | null
    allEntries: FSEntry[]
    selectedNamesArray: string[]
    selectedEntries: FSEntry[]
    loadDirectory(path: string, restoreState?: {cursorIndex?: number; selectedNames?: string[]}): Promise<void>
    moveCursorUp(): void
    moveCursorDown(): void
    enterCursor(event?: KeyboardEvent): void
    goUp(): Promise<void>
    toggleCursorSelection(): void
    setKeyboardActive(val: boolean): void
    startRename(): void
    calcDirSize(): void
}
