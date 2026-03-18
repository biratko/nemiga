import {Router} from 'express'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import type {WorkspaceService} from '../workspace/WorkspaceService.js'
import type {SettingsService} from '../settings/SettingsService.js'
import type {PathGuard} from '../providers/pathGuard.js'
import {makeFsListHandler} from './fs-list.js'
import {makeGetWorkspaceHandler, makePutWorkspaceHandler} from './workspace.js'
import {makeGetSettingsHandler, makePutSettingsHandler} from './settings.js'
import {makeFsOpenHandler, makeFsViewHandler} from './fs-open.js'
import {makeFsRenameHandler} from './fs-rename.js'

export function fsRouter(
    router_: ProviderRouter,
    workspaceService: WorkspaceService,
    settingsService: SettingsService,
    pathGuard: PathGuard,
): Router {
    const router = Router()

    router.get('/fs/list', makeFsListHandler(router_))
    router.get('/archive/extensions', (_req, res) => {
        res.json({ok: true, extensions: router_.getArchiveExtensions()})
    })
    router.get('/workspace', makeGetWorkspaceHandler(workspaceService))
    router.put('/workspace', makePutWorkspaceHandler(workspaceService))
    router.get('/settings', makeGetSettingsHandler(settingsService))
    router.put('/settings', makePutSettingsHandler(settingsService))
    router.post('/fs/open', makeFsOpenHandler(settingsService, pathGuard))
    router.post('/fs/view', makeFsViewHandler(settingsService, pathGuard))
    router.post('/fs/rename', makeFsRenameHandler(router_))

    return router
}
