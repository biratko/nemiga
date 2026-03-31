import {ref, computed} from 'vue'

/** All action IDs and their default key bindings */
export const ACTION_DEFAULTS: Record<string, string[]> = {
    // Navigation
    'cursor.up':              ['ArrowUp'],
    'cursor.down':            ['ArrowDown'],
    'navigate.in':            ['ArrowRight', 'Enter'],
    'navigate.up':            ['ArrowLeft', 'Backspace'],
    'navigate.in.opposite':   ['Ctrl+ArrowRight'],
    'navigate.up.opposite':   ['Ctrl+ArrowLeft'],
    'panel.switch':           ['Tab'],
    'select.toggle':          ['Insert'],
    'dir.size':               [' '],

    // File operations
    'file.rename':            ['F2'],
    'file.view':              ['F3'],
    'file.edit':              ['F4'],
    'file.copy':              ['F5'],
    'file.move':              ['F6'],
    'dir.create':             ['F7'],
    'file.delete':            ['F8', 'Delete'],
    'search':                 ['Alt+F7'],

    // Tabs
    'tab.new':                ['Alt+T'],
    'tab.close':              ['Alt+W'],
}

export const MODIFIER_DEFAULTS: Record<string, string> = {
    'drag.copy': 'Ctrl',
}

/** Human-readable labels and category grouping for settings UI */
export const ACTION_CATEGORIES: {title: string; actions: {id: string; label: string}[]}[] = [
    {
        title: 'Navigation',
        actions: [
            {id: 'cursor.up', label: 'Cursor Up'},
            {id: 'cursor.down', label: 'Cursor Down'},
            {id: 'navigate.in', label: 'Navigate Into'},
            {id: 'navigate.up', label: 'Navigate Up'},
            {id: 'navigate.in.opposite', label: 'Open in Opposite Panel'},
            {id: 'navigate.up.opposite', label: 'Go Up in Opposite Panel'},
            {id: 'panel.switch', label: 'Switch Panel'},
            {id: 'select.toggle', label: 'Toggle Selection'},
            {id: 'dir.size', label: 'Calculate Dir Size'},
        ],
    },
    {
        title: 'File Operations',
        actions: [
            {id: 'file.rename', label: 'Rename'},
            {id: 'file.view', label: 'View'},
            {id: 'file.edit', label: 'Edit'},
            {id: 'file.copy', label: 'Copy'},
            {id: 'file.move', label: 'Move'},
            {id: 'dir.create', label: 'Create Directory'},
            {id: 'file.delete', label: 'Delete'},
            {id: 'search', label: 'Search'},
        ],
    },
    {
        title: 'Tabs',
        actions: [
            {id: 'tab.new', label: 'New Tab'},
            {id: 'tab.close', label: 'Close Tab'},
        ],
    },
]

export const MODIFIER_LABELS: {id: string; label: string}[] = [
    {id: 'drag.copy', label: 'Drag = Copy'},
]

/**
 * Normalize a KeyboardEvent into a string like "Ctrl+Shift+F5" or "ArrowUp".
 * Modifier-only presses (e.g. pressing just Ctrl) return null.
 */
export function eventToKey(e: KeyboardEvent): string | null {
    const key = e.key
    // Ignore lone modifier presses
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null

    const parts: string[] = []
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.shiftKey) parts.push('Shift')
    if (e.altKey) parts.push('Alt')

    // Normalize letter keys to uppercase for Ctrl+T / Alt+T style bindings
    if ((e.ctrlKey || e.altKey) && e.code.startsWith('Key')) {
        parts.push(e.code.slice(3)) // "KeyT" → "T"
    } else {
        parts.push(key)
    }
    return parts.join('+')
}

/** Build reverse map: key string → action ID */
function buildKeyMap(bindings: Record<string, string[]>): Map<string, string> {
    const map = new Map<string, string>()
    for (const [action, keys] of Object.entries(bindings)) {
        for (const key of keys) {
            map.set(key, action)
        }
    }
    return map
}

// --- Singleton state ---
const actionBindings = ref<Record<string, string[]>>({...ACTION_DEFAULTS})
const modifiers = ref<Record<string, string>>({...MODIFIER_DEFAULTS})
const keyMap = computed(() => buildKeyMap(actionBindings.value))

export function useActionMap() {
    /** Load user overrides from settings. Missing actions keep defaults. */
    function load(userBindings?: Record<string, string[]>, userModifiers?: Record<string, string>) {
        if (userBindings) {
            // Merge: user overrides replace defaults per-action, but actions not in user config keep defaults
            const merged = {...ACTION_DEFAULTS}
            for (const [action, keys] of Object.entries(userBindings)) {
                if (action in ACTION_DEFAULTS) {
                    merged[action] = keys
                }
            }
            actionBindings.value = merged
        } else {
            actionBindings.value = {...ACTION_DEFAULTS}
        }

        if (userModifiers) {
            modifiers.value = {...MODIFIER_DEFAULTS, ...userModifiers}
        } else {
            modifiers.value = {...MODIFIER_DEFAULTS}
        }
    }

    /** Match a keyboard event to an action ID, or null if no match. */
    function matchAction(e: KeyboardEvent): string | null {
        const key = eventToKey(e)
        if (!key) return null
        return keyMap.value.get(key) ?? null
    }

    /** Check if a modifier is active for a given mouse/keyboard event. */
    function isModifierActive(name: string, e: MouseEvent | KeyboardEvent): boolean {
        const mod = modifiers.value[name] ?? MODIFIER_DEFAULTS[name]
        if (!mod) return false
        switch (mod) {
            case 'Ctrl': return e.ctrlKey
            case 'Shift': return e.shiftKey
            case 'Alt': return e.altKey
            default: return false
        }
    }

    return {
        actionBindings,
        modifiers,
        load,
        matchAction,
        isModifierActive,
    }
}
