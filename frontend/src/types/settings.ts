export interface KeyBindings {
    cursorUp: string
    cursorDown: string
    navigateIn: string
    navigateUp: string
    switchPanel: string
}

export interface SettingsState {
    showHidden?: boolean
    followSymlinks?: boolean
    keyBindings?: KeyBindings
    theme?: string
    editor?: string
    viewer?: string
}
