import type {StorageProvider} from '../storage/StorageProvider.js'
import type {SettingsState} from '../protocol/settings-types.js'

const STORAGE_KEY = 'settings'

function getDefaults(): SettingsState {
    return {
        showHidden: false,
        followSymlinks: true,
        theme: 'dark',
        editor: '',
        viewer: '',
        showToolbar: true,
        fileTypes: {},
        toastDurationMs: 3000,
    }
}

export class SettingsService {
    constructor(private storage: StorageProvider) {}

    async load(): Promise<SettingsState> {
        const defaults = getDefaults()
        const data = await this.storage.load<SettingsState>(STORAGE_KEY)
        return {...defaults, ...data}
    }

    async save(state: SettingsState): Promise<void> {
        await this.storage.save(STORAGE_KEY, state)
    }
}
