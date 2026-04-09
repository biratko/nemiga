import http from 'node:http'
import {createExpressApp} from './server.js'
import {fsRouter, workspaceRouter, settingsRouter, apiErrorHandler} from './api/router.js'
import {LocalProvider} from './providers/LocalProvider.js'
import {ProviderRouter} from './providers/ProviderRouter.js'
import {PathGuard} from './providers/pathGuard.js'
import {ArchiveProvider} from './archive/ArchiveProvider.js'
import {ZipAdapter} from './archive/adapters/ZipAdapter.js'
import {TarAdapter} from './archive/adapters/TarAdapter.js'
import {SevenZipAdapter} from './archive/adapters/SevenZipAdapter.js'
import {WsServer} from './ws/WsServer.js'
import {JsonFileStorage} from './storage/JsonFileStorage.js'
import {WorkspaceService} from './workspace/WorkspaceService.js'
import {SettingsService} from './settings/SettingsService.js'
import {FtpSessionManager} from './ftp/FtpSessionManager.js'
import type {SessionManagerOptions} from './ftp/FtpSessionManager.js'
import {FtpArchiveCache} from './ftp/FtpArchiveCache.js'
import type {ArchiveCacheOptions} from './ftp/FtpArchiveCache.js'
import {FtpArchiveProvider} from './ftp/FtpArchiveProvider.js'
import {NotifyServer} from './ws/NotifyServer.js'
import {WatchServer} from './ws/WatchServer.js'
import {ftpRouter} from './api/ftp.js'
import {ftpArchiveRouter} from './api/ftp-archive.js'
import {FtpConnectionsService} from './ftp/FtpConnectionsService.js'
import {ftpConnectionsRouter} from './api/ftp-connections.js'
import {SshSessionManager} from './ssh/SshSessionManager.js'
import {SshConnectionsService} from './ssh/SshConnectionsService.js'
import {sshRouter} from './api/ssh.js'
import {sshConnectionsRouter} from './api/ssh-connections.js'

export interface AppInstance {
    server: http.Server
    cleanup(): Promise<void>
}

export interface AppOptions {
    allowedRoots?: string[]
    frontendDist?: string
    ftpSessionManagerOptions?: SessionManagerOptions
    ftpArchiveCacheOptions?: ArchiveCacheOptions
}

export function createApp(options: AppOptions = {}): AppInstance {
    const pathGuard = new PathGuard(options.allowedRoots)

    const provider = new LocalProvider()
    const archiveProvider = new ArchiveProvider()
    archiveProvider.registerAdapter(new ZipAdapter())
    archiveProvider.registerAdapter(new TarAdapter())
    archiveProvider.registerAdapter(new SevenZipAdapter())
    const ftpSessionManager = new FtpSessionManager(options.ftpSessionManagerOptions)
    const ftpArchiveCache = new FtpArchiveCache(ftpSessionManager, options.ftpArchiveCacheOptions)
    const ftpArchiveProvider = new FtpArchiveProvider(ftpArchiveCache, archiveProvider, ftpSessionManager)
    ftpSessionManager.setArchiveCache(ftpArchiveCache)
    const notifyServer = new NotifyServer()
    ftpSessionManager.setNotifyServer(notifyServer)
    const sshSessionManager = new SshSessionManager()
    sshSessionManager.setNotifyServer(notifyServer)
    const router = new ProviderRouter(provider, archiveProvider, pathGuard, ftpSessionManager, ftpArchiveProvider, sshSessionManager)
    const storage = new JsonFileStorage()
    const workspaceService = new WorkspaceService(storage)
    const settingsService = new SettingsService(storage)
    const ftpConnectionsService = new FtpConnectionsService(storage)
    const sshConnectionsService = new SshConnectionsService(storage)
    const watchServer = new WatchServer(router)
    const wsServer = new WsServer(router, settingsService)

    const apiRouters = [
        fsRouter(router, settingsService, pathGuard),
        workspaceRouter(workspaceService),
        settingsRouter(settingsService),
        ftpRouter(ftpSessionManager),
        ftpArchiveRouter(ftpArchiveCache, ftpSessionManager),
        ftpConnectionsRouter(ftpConnectionsService),
        sshRouter(sshSessionManager, settingsService),
        sshConnectionsRouter(sshConnectionsService),
    ]
    const app = createExpressApp(apiRouters, apiErrorHandler, {
        frontendDist: options.frontendDist,
    })

    const server = http.createServer(app)
    wsServer.attach(server)
    notifyServer.attach(server)
    watchServer.attach(server)

    async function cleanup() {
        wsServer.close()
        notifyServer.close()
        watchServer.close()
        await ftpArchiveCache.cleanup().catch(() => {})
        await archiveProvider.cleanup().catch(() => {})
        await ftpSessionManager.cleanup().catch(() => {})
        await sshSessionManager.cleanup().catch(() => {})
        await new Promise<void>((resolve, reject) => {
            server.close((err) => err ? reject(err) : resolve())
        })
    }

    return {server, cleanup}
}
