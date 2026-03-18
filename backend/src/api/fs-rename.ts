import type {Request, Response} from 'express'
import type {ProviderRouter} from '../providers/ProviderRouter.js'
import {ErrorCode} from '../protocol/errors.js'
import {isArchivePath} from '../archive/ArchiveProvider.js'
import path from 'node:path'

export function makeFsRenameHandler(router: ProviderRouter) {
    return async (req: Request, res: Response): Promise<void> => {
        const {path: filePath, newName} = req.body as {path?: string; newName?: string}

        if (!filePath || !newName) {
            res.status(400).json({
                ok: false,
                error: {code: ErrorCode.INVALID_REQUEST, message: 'path and newName are required'},
            })
            return
        }

        if (isArchivePath(filePath)) {
            res.status(400).json({
                ok: false,
                error: {code: ErrorCode.INVALID_REQUEST, message: 'Rename inside archives is not supported'},
            })
            return
        }

        const provider = router.resolve(filePath)
        // Also guard the target path
        const targetPath = path.join(path.dirname(filePath), newName)
        router.resolve(targetPath)

        const result = await provider.rename(filePath, newName)

        if (!result.ok) {
            const status =
                result.error.code === ErrorCode.INVALID_REQUEST ? 400
                : result.error.code === ErrorCode.NOT_FOUND ? 404
                : result.error.code === ErrorCode.ALREADY_EXISTS ? 409
                : 500
            res.status(status).json(result)
            return
        }

        res.json(result)
    }
}
