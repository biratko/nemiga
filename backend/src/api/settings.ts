import type {Request, Response} from 'express'
import type {SettingsService} from '../settings/SettingsService.js'
import type {SettingsState, FileTypeOverride} from '../protocol/settings-types.js'
import {ErrorCode} from '../protocol/errors.js'

function sanitizeSettings(raw: Record<string, unknown>): SettingsState | null {
    const result: SettingsState = {}
    const allowed = new Set(['showHidden', 'followSymlinks', 'theme', 'zoom', 'editor', 'viewer', 'terminal', 'showToolbar', 'fileTypes', 'toastDurationMs', 'actionBindings', 'modifiers'])

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
    if ('zoom' in raw) {
        if (typeof raw.zoom !== 'number') return null
        result.zoom = raw.zoom
    }
    if ('editor' in raw) {
        if (raw.editor !== undefined && typeof raw.editor !== 'string') return null
        result.editor = raw.editor as string | undefined
    }
    if ('viewer' in raw) {
        if (raw.viewer !== undefined && typeof raw.viewer !== 'string') return null
        result.viewer = raw.viewer as string | undefined
    }
    if ('terminal' in raw) {
        if (raw.terminal !== undefined && typeof raw.terminal !== 'string') return null
        result.terminal = raw.terminal as string | undefined
    }
    if ('showToolbar' in raw) {
        if (typeof raw.showToolbar !== 'boolean') return null
        result.showToolbar = raw.showToolbar
    }
    if ('fileTypes' in raw) {
        const ft = raw.fileTypes
        if (typeof ft !== 'object' || ft === null || Array.isArray(ft)) return null
        const ftObj = ft as Record<string, unknown>
        const ftAllowedKeys = new Set(['icon', 'program'])
        for (const [ext, val] of Object.entries(ftObj)) {
            if (typeof ext !== 'string') return null
            if (typeof val !== 'object' || val === null) return null
            const entry = val as Record<string, unknown>
            for (const k of Object.keys(entry)) {
                if (!ftAllowedKeys.has(k)) return null
                if (entry[k] !== undefined && typeof entry[k] !== 'string') return null
            }
        }
        // Normalize keys to lowercase (spec: case-insensitive, lowercased on save)
        const normalized: Record<string, FileTypeOverride> = {}
        for (const [ext, val] of Object.entries(ftObj)) {
            normalized[ext.toLowerCase()] = val as FileTypeOverride
        }
        result.fileTypes = normalized
    }
    if ('actionBindings' in raw) {
        const ab = raw.actionBindings
        if (typeof ab !== 'object' || ab === null || Array.isArray(ab)) return null
        const abObj = ab as Record<string, unknown>
        for (const [key, val] of Object.entries(abObj)) {
            if (typeof key !== 'string') return null
            if (!Array.isArray(val)) return null
            for (const v of val) {
                if (typeof v !== 'string') return null
            }
        }
        result.actionBindings = ab as Record<string, string[]>
    }
    if ('modifiers' in raw) {
        const m = raw.modifiers
        if (typeof m !== 'object' || m === null || Array.isArray(m)) return null
        const mObj = m as Record<string, unknown>
        const validMods = new Set(['Ctrl', 'Shift', 'Alt'])
        for (const [key, val] of Object.entries(mObj)) {
            if (typeof key !== 'string') return null
            if (typeof val !== 'string' || !validMods.has(val)) return null
        }
        result.modifiers = m as Record<string, string>
    }
    if ('toastDurationMs' in raw) {
        if (typeof raw.toastDurationMs !== 'number') return null
        const ms = raw.toastDurationMs
        if (ms < 1000 || ms > 30000) return null
        result.toastDurationMs = ms
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
