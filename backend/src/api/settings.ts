import type {Request, Response} from 'express'
import type {SettingsService} from '../settings/SettingsService.js'
import type {SettingsState, KeyBindings} from '../protocol/settings-types.js'
import {ErrorCode} from '../protocol/errors.js'

function sanitizeSettings(raw: Record<string, unknown>): SettingsState | null {
    const result: SettingsState = {}
    const allowed = new Set(['showHidden', 'followSymlinks', 'keyBindings', 'theme', 'editor', 'viewer'])

    for (const key of Object.keys(raw)) {
        if (!allowed.has(key)) return null
    }

    if ('showHidden' in raw) {
        if (typeof raw.showHidden !== 'boolean') return null
        result.showHidden = raw.showHidden
    }
    if ('followSymlinks' in raw) {
        if (typeof raw.followSymlinks !== 'boolean') return null
        result.followSymlinks = raw.followSymlinks
    }
    if ('theme' in raw) {
        if (typeof raw.theme !== 'string') return null
        result.theme = raw.theme
    }
    if ('editor' in raw) {
        if (raw.editor !== undefined && typeof raw.editor !== 'string') return null
        result.editor = raw.editor as string | undefined
    }
    if ('viewer' in raw) {
        if (raw.viewer !== undefined && typeof raw.viewer !== 'string') return null
        result.viewer = raw.viewer as string | undefined
    }
    if ('keyBindings' in raw) {
        const kb = raw.keyBindings
        if (typeof kb !== 'object' || kb === null) return null
        const kbObj = kb as Record<string, unknown>
        const kbKeys = ['cursorUp', 'cursorDown', 'navigateIn', 'navigateUp', 'switchPanel']
        for (const k of Object.keys(kbObj)) {
            if (!kbKeys.includes(k)) return null
            if (typeof kbObj[k] !== 'string') return null
        }
        result.keyBindings = kb as KeyBindings
    }

    return result
}

export function makeGetSettingsHandler(settingsService: SettingsService) {
    return async (_req: Request, res: Response): Promise<void> => {
        const settings = await settingsService.load()
        res.json({ok: true, settings})
    }
}

export function makePutSettingsHandler(settingsService: SettingsService) {
    return async (req: Request, res: Response): Promise<void> => {
        const raw = (req.body as {settings?: Record<string, unknown>})?.settings
        if (!raw || typeof raw !== 'object') {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'settings object is required'}})
            return
        }

        const settings = sanitizeSettings(raw)
        if (!settings) {
            res.json({ok: false, error: {code: ErrorCode.INVALID_REQUEST, message: 'invalid settings shape'}})
            return
        }

        await settingsService.save(settings)
        res.json({ok: true})
    }
}
