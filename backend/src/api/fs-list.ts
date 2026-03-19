import type {Request, Response} from 'express'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import {ErrorCode} from '../protocol/errors.js'
import {isArchivePath} from '../archive/ArchiveProvider.js'
import {toPosix, fromPosix} from '../utils/platformPath.js'

export function makeFsListHandler(router: ProviderRouter) {
    const archiveExts = router.getArchiveExtensions()

    return async (req: Request, res: Response): Promise<void> => {
        const dirPath = req.query.path ? fromPosix(req.query.path as string) : undefined

        if (!dirPath) {
            res.json({
                ok: false,
                error: {code: ErrorCode.INVALID_REQUEST, message: 'path parameter is required'},
            })
            return
        }

        const provider = router.resolve(dirPath)
        const result = await provider.list(dirPath)

        // Mark archive files so frontend can navigate into them
        if (result.ok) {
            for (const entry of result.entries) {
                if (entry.type === 'file') {
                    const lower = entry.name.toLowerCase()
                    if (archiveExts.some(ext => lower.endsWith(ext))) {
                        entry.isArchive = true
                    }
                }
            }
        }

        if (result.ok) {
            result.path = toPosix(result.path)
        }

        res.json(result)
    }
}
