export interface FileTypeOverride {
    icon?: string
    program?: string
}

export interface SettingsState {
    showHidden?: boolean
    followSymlinks?: boolean
    theme?: string
    editor?: string
    viewer?: string
    terminal?: string
    showToolbar?: boolean
    fileTypes?: Record<string, FileTypeOverride>
    toastDurationMs?: number
    actionBindings?: Record<string, string[]>
    modifiers?: Record<string, string>
}
