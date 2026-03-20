import {Router, type ErrorRequestHandler} from 'express'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import type {WorkspaceService} from '../workspace/WorkspaceService.js'
import type {SettingsService} from '../settings/SettingsService.js'
import {type PathGuard, PathGuardError} from '../providers/pathGuard.js'
import {ErrorCode} from '../protocol'
import {makeFsListHandler} from './fs-list.js'
import {makeGetWorkspaceHandler, makePutWorkspaceHandler} from './workspace.js'
import {makeGetSettingsHandler, makePutSettingsHandler} from './settings.js'
import {makeFsOpenHandler, makeFsViewHandler} from './fs-open.js'
import {makeFsRenameHandler} from './fs-rename.js'

export function fsRouter(providerRouter: ProviderRouter, settingsService: SettingsService, pathGuard: PathGuard): Router {
    const router = Router()

    router.get('/fs/list', makeFsListHandler(providerRouter))
    router.post('/fs/open', makeFsOpenHandler(settingsService, pathGuard))
    router.post('/fs/view', makeFsViewHandler(settingsService, pathGuard))
    router.post('/fs/rename', makeFsRenameHandler(providerRouter))

    router.get('/archive/extensions', (_req, res) => {
        res.json({ok: true, extensions: providerRouter.getArchiveExtensions()})
    })
    router.get('/platform', (_req, res) => {
        res.json({ok: true, platform: process.platform})
    })

    return router
}

export function workspaceRouter(workspaceService: WorkspaceService): Router {
    const router = Router()

    router.get('/workspace', makeGetWorkspaceHandler(workspaceService))
    router.put('/workspace', makePutWorkspaceHandler(workspaceService))

    return router
}

export function settingsRouter(settingsService: SettingsService): Router {
    const router = Router()

    router.get('/settings', makeGetSettingsHandler(settingsService))
    router.put('/settings', makePutSettingsHandler(settingsService))

    return router
}

export const apiErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof PathGuardError) {
        res.status(403).json({ok: false, error: {code: ErrorCode.PERMISSION_DENIED, message: err.message}})
        return
    }
    console.error('Unhandled error:', err)
    res.status(500).json({ok: false, error: {code: ErrorCode.INTERNAL, message: 'Internal server error'}})
}