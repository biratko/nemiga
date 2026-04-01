import {ref, computed, type Ref} from 'vue'
import type {ColumnWidths, SearchColumnWidths} from '@/types/workspace'

const DEFAULT_WIDTHS: ColumnWidths = {name: 60, size: 20, date: 20}
const DEFAULT_SEARCH_WIDTHS: SearchColumnWidths = {name: 35, path: 30, size: 15, date: 20}
const MIN_COL_WIDTH = 5

type ColumnKey = keyof ColumnWidths
type SearchColumnKey = keyof SearchColumnWidths

export function useColumnResize(
    initialWidths: ColumnWidths | undefined,
    isSearchMode: Ref<boolean>,
    searchWidths: Ref<SearchColumnWidths | undefined>,
    onSave: (widths: ColumnWidths) => void,
    onSaveSearch: (widths: SearchColumnWidths) => void,
) {
    const widths = ref<ColumnWidths>({...(initialWidths ?? DEFAULT_WIDTHS)})

    const activeWidths = computed(() => {
        if (isSearchMode.value) {
            return searchWidths.value ?? {...DEFAULT_SEARCH_WIDTHS}
        }
        return widths.value
    })

    const columnOrder = computed<string[]>(() => {
        if (isSearchMode.value) return ['name', 'path', 'size', 'date']
        return ['name', 'size', 'date']
    })

    let dragging = false
    let dragLeftCol = ''
    let dragRightCol = ''
    let startX = 0
    let startLeftWidth = 0
    let startRightWidth = 0
    let tableWidth = 0

    function onSeparatorMouseDown(e: MouseEvent, leftCol: string, rightCol: string, tableEl: HTMLElement) {
        e.preventDefault()
        dragging = true
        dragLeftCol = leftCol
        dragRightCol = rightCol
        startX = e.clientX
        tableWidth = tableEl.offsetWidth

        const w = activeWidths.value as Record<string, number>
        startLeftWidth = w[leftCol]
        startRightWidth = w[rightCol]

        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }

    function onMouseMove(e: MouseEvent) {
        if (!dragging) return
        const dx = e.clientX - startX
        const deltaPercent = (dx / tableWidth) * 100

        let newLeft = startLeftWidth + deltaPercent
        let newRight = startRightWidth - deltaPercent

        if (newLeft < MIN_COL_WIDTH) {
            newLeft = MIN_COL_WIDTH
            newRight = startLeftWidth + startRightWidth - MIN_COL_WIDTH
        }
        if (newRight < MIN_COL_WIDTH) {
            newRight = MIN_COL_WIDTH
            newLeft = startLeftWidth + startRightWidth - MIN_COL_WIDTH
        }

        if (isSearchMode.value) {
            const current = searchWidths.value ?? {...DEFAULT_SEARCH_WIDTHS}
            const updated = {...current, [dragLeftCol]: newLeft, [dragRightCol]: newRight}
            searchWidths.value = updated
        } else {
            widths.value = {...widths.value, [dragLeftCol]: newLeft, [dragRightCol]: newRight}
        }
    }

    function onMouseUp() {
        if (!dragging) return
        dragging = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''

        if (isSearchMode.value) {
            onSaveSearch(searchWidths.value ?? {...DEFAULT_SEARCH_WIDTHS})
        } else {
            onSave({...widths.value})
        }
    }

    return {
        widths,
        activeWidths,
        columnOrder,
        onSeparatorMouseDown,
    }
}

export {DEFAULT_WIDTHS, DEFAULT_SEARCH_WIDTHS}
export type {ColumnKey, SearchColumnKey}
