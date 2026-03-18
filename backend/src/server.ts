import express, {type ErrorRequestHandler} from 'express'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import type {ProviderRouter} from './providers/ProviderRouter.js'
import type {WorkspaceService} from './workspace/WorkspaceService.js'
import type {SettingsService} from './settings/SettingsService.js'
import type {PathGuard} from './providers/pathGuard.js'
import {fsRouter} from './api/router.js'
import {ErrorCode} from './protocol/errors.js'
import {PathGuardError} from './providers/pathGuard.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface ServerOptions {
    frontendDist?: string
}

export function createServer(
    router: ProviderRouter,
    workspaceService: WorkspaceService,
    settingsService: SettingsService,
    pathGuard: PathGuard,
    options: ServerOptions = {},
): express.Express {
    const app = express()

    app.use(express.json({limit: '1mb'}))

    // API routes
    app.use('/api', fsRouter(router, workspaceService, settingsService, pathGuard))

    // Catch-all error handler for API routes
    const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
        if (err instanceof PathGuardError) {
            res.status(403).json({ok: false, error: {code: ErrorCode.PERMISSION_DENIED, message: err.message}})
            return
        }
        console.error('Unhandled error:', err)
        res.status(500).json({ok: false, error: {code: ErrorCode.INTERNAL, message: 'Internal server error'}})
    }
    app.use('/api', errorHandler)

    // Serve frontend static files (production)
    const frontendDist = options.frontendDist ?? path.resolve(__dirname, '../../frontend/dist')
    app.use(express.static(frontendDist))

    // SPA fallback
    app.get('{*path}', (_req, res) => {
        res.sendFile(path.join(frontendDist, 'index.html'))
    })

    return app
}
