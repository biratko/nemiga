import type {FileSystemProvider} from './FileSystemProvider.js'
import {isArchivePath, archiveRealPath} from '../archive/ArchiveProvider.js'
import type {ArchiveProvider} from '../archive/ArchiveProvider.js'
import type {PathGuard} from './pathGuard.js'

export class ProviderRouter {
    constructor(
        private local: FileSystemProvider,
        private archive: ArchiveProvider,
        private pathGuard: PathGuard,
    ) {}

    resolve(path: string): FileSystemProvider {
        this.guardPath(path)
        return isArchivePath(path) ? this.archive : this.local
    }

    resolveForTransfer(sources: string[], destination: string): FileSystemProvider {
        this.guardPaths([...sources, destination])
        if (isArchivePath(destination) || isArchivePath(sources[0])) {
            return this.archive
        }
        return this.local
    }

    getArchiveExtensions(): string[] {
        return this.archive.getArchiveExtensions()
    }

    findAdapter(archivePath: string) {
        return this.archive.findAdapter(archivePath)
    }

    private guardPath(p: string): void {
        const real = isArchivePath(p) ? archiveRealPath(p) : p
        this.pathGuard.assert(real)
    }

    private guardPaths(paths: string[]): void {
        for (const p of paths) {
            this.guardPath(p)
        }
    }
}