import {computed, type Ref} from 'vue'
import type {FSEntry} from '@/types/fs'

export type CaseTransform = 'none' | 'lower' | 'upper' | 'title'

export type DatePreset = 'YYYY-MM-DD' | 'DD.MM.YYYY' | 'YYYYMMDD' | 'YYYYMMDD_HHmmss'

export interface MultiRenameParams {
    nameMask: string
    extMask: string
    search: string
    replace: string
    useRegex: boolean
    caseTransform: CaseTransform
    counterStart: number
    counterStep: number
    counterWidth: number
    datePreset: DatePreset
}

export interface PreviewRow {
    entry: FSEntry
    originalName: string
    newName: string
    conflict: 'duplicate' | 'exists' | null
    unchanged: boolean
}

export const DEFAULT_PARAMS: MultiRenameParams = {
    nameMask: '[N]',
    extMask: '[E]',
    search: '',
    replace: '',
    useRegex: false,
    caseTransform: 'none',
    counterStart: 1,
    counterStep: 1,
    counterWidth: 3,
    datePreset: 'YYYY-MM-DD',
}

function splitNameExt(filename: string): {name: string; ext: string} {
    const dot = filename.lastIndexOf('.')
    if (dot <= 0) return {name: filename, ext: ''}
    return {name: filename.slice(0, dot), ext: filename.slice(dot + 1)}
}

function formatDate(isoString: string, preset: DatePreset): string {
    const d = new Date(isoString)
    const Y = d.getFullYear()
    const M = String(d.getMonth() + 1).padStart(2, '0')
    const D = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    const s = String(d.getSeconds()).padStart(2, '0')

    switch (preset) {
        case 'YYYY-MM-DD': return `${Y}-${M}-${D}`
        case 'DD.MM.YYYY': return `${D}.${M}.${Y}`
        case 'YYYYMMDD': return `${Y}${M}${D}`
        case 'YYYYMMDD_HHmmss': return `${Y}${M}${D}_${h}${m}${s}`
    }
}

function padCounter(value: number, width: number): string {
    return String(value).padStart(width, '0')
}

function substituteTokens(
    mask: string,
    originalName: string,
    originalExt: string,
    counter: number,
    counterWidth: number,
    dateStr: string,
): string {
    return mask
        .replace(/\[N]/g, originalName)
        .replace(/\[E]/g, originalExt)
        .replace(/\[C]/g, padCounter(counter, counterWidth))
        .replace(/\[D]/g, dateStr)
}

function applyCase(str: string, transform: CaseTransform): string {
    switch (transform) {
        case 'lower': return str.toLowerCase()
        case 'upper': return str.toUpperCase()
        case 'title': return str.replace(/\b\w/g, c => c.toUpperCase())
        default: return str
    }
}

export function computePreview(
    entry: FSEntry,
    params: MultiRenameParams,
    counter: number,
): string {
    const {name: origName, ext: origExt} = splitNameExt(entry.name)
    const dateStr = formatDate(entry.modified, params.datePreset)

    const newName = substituteTokens(params.nameMask, origName, origExt, counter, params.counterWidth, dateStr)
    const newExt = substituteTokens(params.extMask, origName, origExt, counter, params.counterWidth, dateStr)

    let fullName = newExt ? `${newName}.${newExt}` : newName

    if (params.search) {
        if (params.useRegex) {
            try {
                fullName = fullName.replace(new RegExp(params.search, 'g'), params.replace)
            } catch {
                // invalid regex — skip
            }
        } else {
            fullName = fullName.replace(params.search, params.replace)
        }
    }

    fullName = applyCase(fullName, params.caseTransform)

    return fullName
}

export function useMultiRenamePreview(
    entries: Ref<FSEntry[]>,
    allEntries: Ref<FSEntry[]>,
    params: Ref<MultiRenameParams>,
    caseSensitive: Ref<boolean>,
) {
    const rows = computed<PreviewRow[]>(() => {
        const p = params.value
        const result: PreviewRow[] = []
        let counter = p.counterStart

        for (const entry of entries.value) {
            const newName = computePreview(entry, p, counter)
            const unchanged = newName === entry.name
            result.push({entry, originalName: entry.name, newName, conflict: null, unchanged})
            counter += p.counterStep
        }

        const normalize = caseSensitive.value ? (s: string) => s : (s: string) => s.toLowerCase()

        const renamingNames = new Set(entries.value.map(e => normalize(e.name)))
        const existingNames = new Set(
            allEntries.value
                .filter(e => !renamingNames.has(normalize(e.name)))
                .map(e => normalize(e.name)),
        )

        const newNameCounts = new Map<string, number[]>()
        for (let i = 0; i < result.length; i++) {
            if (result[i].unchanged) continue
            const key = normalize(result[i].newName)
            if (!newNameCounts.has(key)) newNameCounts.set(key, [])
            newNameCounts.get(key)!.push(i)
        }

        for (const [, indices] of newNameCounts) {
            if (indices.length > 1) {
                for (const i of indices) result[i].conflict = 'duplicate'
            }
        }

        for (let i = 0; i < result.length; i++) {
            if (result[i].unchanged || result[i].conflict) continue
            if (existingNames.has(normalize(result[i].newName))) {
                result[i].conflict = 'exists'
            }
        }

        return result
    })

    const hasConflicts = computed(() => rows.value.some(r => r.conflict !== null))
    const hasChanges = computed(() => rows.value.some(r => !r.unchanged))
    const canRename = computed(() => hasChanges.value && !hasConflicts.value)

    return {rows, hasConflicts, hasChanges, canRename}
}
