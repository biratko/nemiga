import type {DirectoryWatcher} from './DirectoryWatcher.js'

export class NullDirectoryWatcher implements DirectoryWatcher {
    start(): void {}
    stop(): void {}
}
