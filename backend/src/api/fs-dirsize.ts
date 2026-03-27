import fs from 'node:fs/promises'
import path from 'node:path'
import type {Request, Response} from 'express'
import type {PathGuard} from '../providers/pathGuard.js'
import {ErrorCode} from '../protocol'
import {fromPosix} from '../utils/platformPath.js'

async function calcDirSize(dirPath: string): Promise<number> {
    let total = 0
    const stack = [dirPath]

    while (stack.length > 0) {
        const dir = stack.pop()!
        let entries
        try {
            entries = await fs.readdir(dir, {withFileTypes: true})
        } catch {
            continue
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                stack.push(full)
            } else if (entry.isFile()) {
                try {
                    const stat = await fs.stat(full)
                    total += stat.size
                } catch {
                    // skip inaccessible files
                }
            }
        }
    }
    return total
}

export function makeFsDirSizeHandler(pathGuard: PathGuard) {
    return async (req: Request, res: Response): Promise<void> => {
        const rawPath = req.query.path
        if (!rawPath || typeof rawPath !== 'string') {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'path is required'}})
            return
        }

        const dirPath = fromPosix(rawPath)
        pathGuard.assert(dirPath)

        try {
            const stat = await fs.stat(dirPath)
            if (!stat.isDirectory()) {
                res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'path is not a directory'}})
                return
            }
        } catch {
            res.json({ok: false, error: {code: ErrorCode.NOT_FOUND, message: 'path does not exist'}})
            return
        }

        const size = await calcDirSize(dirPath)
        res.json({ok: true, size})
    }
}
