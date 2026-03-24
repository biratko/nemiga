import type {Request, Response} from 'express'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import {ErrorCode} from '../protocol/errors.js'
import {isArchivePath} from '../archive/ArchiveProvider.js'
import {toPosix, fromPosix} from '../utils/platformPath.js'

export function makeFsListHandler(router: ProviderRouter) {
    const archiveExts = router.getArchiveExtensions()

    return async (req: Request, res: Response): Promise<void> => {
        const rawPath = req.query.path ? String(req.query.path) : undefined
        const dirPath = rawPath?.startsWith('ftp://') ? rawPath : rawPath ? fromPosix(rawPath) : undefined

        if (!dirPath) {
            res.json({
                ok: false,
                error: {code: ErrorCode.INVALID_REQUEST, message: 'path parameter is required'},
            })
            return
        }

        const provider = router.resolve(dirPath)
        const result = await provider.list(dirPath)

        if (result.ok) {
            if (!dirPath.startsWith('ftp://')) {
                for (const entry of result.entries) {
                    if (entry.type === 'file') {
                        const lower = entry.name.toLowerCase()
                        if (archiveExts.some(ext => lower.endsWith(ext))) {
                            entry.isArchive = true
                        }
                    }
                }
                result.path = toPosix(result.path)
            }
        }

        res.json(result)
    }
}
