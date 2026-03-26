import type {DirectoryWatcher} from './DirectoryWatcher.js'
import type {FileSystemProvider} from '../../providers/FileSystemProvider.js'

const DEFAULT_INTERVAL_MS = 5_000

export class PollingDirectoryWatcher implements DirectoryWatcher {
    private timer: ReturnType<typeof setInterval> | null = null
    private fingerprint: string | null = null

    constructor(
        private dirPath: string,
        private provider: FileSystemProvider,
        private intervalMs = DEFAULT_INTERVAL_MS,
    ) {}

    start(onChange: () => void): void {
        // Take initial fingerprint
        this.poll().then(fp => { this.fingerprint = fp })

        this.timer = setInterval(async () => {
            const fp = await this.poll()
            if (fp !== null && this.fingerprint !== null && fp !== this.fingerprint) {
                this.fingerprint = fp
                onChange()
            } else if (fp !== null) {
                this.fingerprint = fp
            }
        }, this.intervalMs)
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
        this.fingerprint = null
    }

    private async poll(): Promise<string | null> {
        try {
            const result = await this.provider.list(this.dirPath)
            if (!result.ok) return null
            return result.entries
                .map(e => `${e.name}\t${e.size}\t${e.modified}`)
                .sort()
                .join('\n')
        } catch {
            return null
        }
    }
}
