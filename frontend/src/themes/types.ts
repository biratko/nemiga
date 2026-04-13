export interface ThemeTokens {
    // Backgrounds
    'bg-primary': string
    'bg-panel': string
    'bg-header': string
    'bg-row-hover': string
    'bg-row-alt': string
    'bg-row-selected': string
    // Text
    'text-primary': string
    'text-secondary': string
    'text-dir': string
    'text-symlink': string
    'text-error': string
    // Border & accent
    border: string
    accent: string
    backdrop: string
    // Typography
    'font-family': string
    'font-size': string
    'font-size-sm': string
    'font-size-xs': string
    'font-weight-dir': string
    // Cursor & selection
    'cursor-outline-width': string
    'cursor-outline-style': string
    'cursor-outline-color': string
    'selection-font-style': string
    // Busy overlay
    'busy-overlay-bg': string
    'busy-overlay-spinner-color': string
    'busy-overlay-text-color': string
}

export interface ThemeDefinition {
    name: string
    label: string
    tokens: ThemeTokens
}
