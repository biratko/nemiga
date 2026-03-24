import type {FileSystemProvider} from './FileSystemProvider.js'
import {isArchivePath, archiveRealPath} from '../archive/ArchiveProvider.js'
import type {ArchiveProvider} from '../archive/ArchiveProvider.js'
import type {PathGuard} from './pathGuard.js'
import type {FtpSessionManager} from '../ftp/FtpSessionManager.js'
import {CrossProviderTransfer} from '../ftp/CrossProviderTransfer.js'
import {ErrorCode} from '../protocol/errors.js'

export function isFtpPath(p: string): boolean {
    return p.startsWith('ftp://')
}

export function extractFtpSessionId(p: string): string {
    const withoutPrefix = p.slice('ftp://'.length)
    const slashIndex = withoutPrefix.indexOf('/')
    return slashIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, slashIndex)
}

export class ProviderRouter {
    constructor(
        private local: FileSystemProvider,
        private archive: ArchiveProvider,
        private pathGuard: PathGuard,
        private ftpSessions?: FtpSessionManager,
    ) {}

    resolve(path: string): FileSystemProvider {
        if (isFtpPath(path)) {
            return this.resolveFtp(path)
        }
        this.guardPath(path)
        return isArchivePath(path) ? this.archive : this.local
    }

    resolveForTransfer(sources: string[], destination: string): FileSystemProvider {
        const srcIsFtp = isFtpPath(sources[0])
        const destIsFtp = isFtpPath(destination)

        if (!srcIsFtp && !destIsFtp) {
            this.guardPaths([...sources, destination])
            if (isArchivePath(destination) || isArchivePath(sources[0])) {
                return this.archive
            }
            return this.local
        }

        const srcProvider = this.resolve(sources[0])
        const destProvider = this.resolve(destination)

        if (srcProvider === destProvider) {
            return srcProvider
        }

        return new CrossProviderTransfer(srcProvider, destProvider)
    }

    getArchiveExtensions(): string[] {
        return this.archive.getArchiveExtensions()
    }

    findAdapter(archivePath: string) {
        return this.archive.findAdapter(archivePath)
    }

    private resolveFtp(p: string): FileSystemProvider {
        if (!this.ftpSessions) {
            throw new Error('FTP not configured')
        }
        const sessionId = extractFtpSessionId(p)
        const provider = this.ftpSessions.get(sessionId)
        if (!provider) {
            const err = new Error(`FTP session not found: ${sessionId}`)
            ;(err as any).code = ErrorCode.SESSION_NOT_FOUND
            throw err
        }
        return provider
    }

    private guardPath(p: string): void {
        if (isFtpPath(p)) return
        const real = isArchivePath(p) ? archiveRealPath(p) : p
        this.pathGuard.assert(real)
    }

    private guardPaths(paths: string[]): void {
        for (const p of paths) {
            this.guardPath(p)
        }
    }
}
