import {ref} from 'vue'
import {themes, DEFAULT_THEME, type ThemeTokens} from '@/themes'

const currentTheme = ref<string>(DEFAULT_THEME)

function applyTheme(name: string) {
    if (!(name in themes)) return
    const tokens: ThemeTokens = themes[name].tokens
    const root = document.documentElement
    root.setAttribute('data-theme', name)
    for (const [key, value] of Object.entries(tokens)) {
        root.style.setProperty(`--${key}`, value)
    }
    currentTheme.value = name
}

function initTheme(savedTheme?: string) {
    const name = savedTheme && savedTheme in themes ? savedTheme : DEFAULT_THEME
    applyTheme(name)
}

/**
 * Singleton composable — `currentTheme`, `applyTheme`, and `initTheme` are
 * module-scoped so every caller shares the same reactive state. This is
 * intentional: theme state is global and must stay in sync across components.
 */
export function useTheme() {
    return {currentTheme, applyTheme, initTheme}
}
