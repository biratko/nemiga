import type {StorageProvider} from '../storage/StorageProvider.js'
import type {KeyBindings, SettingsState} from '../protocol/settings-types.js'

const STORAGE_KEY = 'settings'

function getDefaults(): SettingsState {
    return {
        showHidden: false,
        followSymlinks: true,
        keyBindings: {
            cursorUp: 'ArrowUp',
            cursorDown: 'ArrowDown',
            navigateIn: 'ArrowRight',
            navigateUp: 'ArrowLeft',
            switchPanel: 'Tab',
        },
        theme: 'dark',
        editor: '',
    }
}

export class SettingsService {
    constructor(private storage: StorageProvider) {}

    async load(): Promise<SettingsState> {
        const defaults = getDefaults()
        const data = await this.storage.load<SettingsState>(STORAGE_KEY)
        return {
            ...defaults,
            ...data,
            keyBindings: Object.assign({} as KeyBindings, defaults.keyBindings, data?.keyBindings),
        }
    }

    async save(state: SettingsState): Promise<void> {
        await this.storage.save(STORAGE_KEY, state)
    }
}
