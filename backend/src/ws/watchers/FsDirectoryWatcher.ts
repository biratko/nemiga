import fs from 'node:fs'
import type {DirectoryWatcher} from './DirectoryWatcher.js'

const DEBOUNCE_MS = 300

export class FsDirectoryWatcher implements DirectoryWatcher {
    private watcher: fs.FSWatcher | null = null
    private debounceTimer: ReturnType<typeof setTimeout> | null = null

    constructor(private dirPath: string) {}

    start(onChange: () => void): void {
        try {
            this.watcher = fs.watch(this.dirPath, () => {
                if (this.debounceTimer) clearTimeout(this.debounceTimer)
                this.debounceTimer = setTimeout(() => {
                    this.debounceTimer = null
                    onChange()
                }, DEBOUNCE_MS)
            })
            this.watcher.on('error', () => {
                this.stop()
            })
        } catch {
            // Directory doesn't exist or not watchable
        }
    }

    stop(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
            this.debounceTimer = null
        }
        if (this.watcher) {
            this.watcher.close()
            this.watcher = null
        }
    }
}
