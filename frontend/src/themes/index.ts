import type {ThemeDefinition, ThemeTokens} from './types'

const modules = import.meta.glob<{default: ThemeDefinition}>('./*.ts', {eager: true})

const themes: Record<string, ThemeDefinition> = {}
for (const [path, mod] of Object.entries(modules)) {
    const fileName = path.replace('./', '').replace('.ts', '')
    if (fileName === 'index' || fileName === 'types') continue
    themes[mod.default.name] = mod.default
}

const themeNames: string[] = Object.keys(themes)

const DEFAULT_THEME = 'dark'

export {themes, themeNames, DEFAULT_THEME}
export type {ThemeDefinition, ThemeTokens}
