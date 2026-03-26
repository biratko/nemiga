export interface DirectoryWatcher {
    start(onChange: () => void): void
    stop(): void
}
