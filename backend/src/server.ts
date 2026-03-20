import express, {type Router, type ErrorRequestHandler} from 'express'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const DEFAULT_FRONTEND_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist')
const API_PREFIX = '/api'
const BODY_LIMIT = '1mb'

export interface ServerOptions {
    frontendDist?: string
}

export function createExpressApp(
    apiRouters: Router[],
    errorHandler: ErrorRequestHandler,
    options: ServerOptions = {},
): express.Express {
    const app = express()

    app.use(express.json({limit: BODY_LIMIT}))

    // API routes
    for (const router of apiRouters) {
        app.use(API_PREFIX, router)
    }
    app.use(API_PREFIX, errorHandler)

    // Serve frontend static files (production)
    const frontendDist = options.frontendDist ?? DEFAULT_FRONTEND_DIST
    app.use(express.static(frontendDist))

    app.get('{*path}', (_req, res) => {
        res.sendFile(path.join(frontendDist, 'index.html'))
    })

    return app
}
