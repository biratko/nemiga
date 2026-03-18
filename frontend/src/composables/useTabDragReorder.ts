import {ref} from 'vue'

export function useTabDragReorder(onReorder: (fromIndex: number, toIndex: number) => void) {
    const dragIndex = ref<number | null>(null)
    const dropIndex = ref<number | null>(null)

    function onDragStart(e: DragEvent, index: number) {
        dragIndex.value = index
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/x-tab-reorder', String(index))
        }
    }

    function onDragOver(e: DragEvent, index: number) {
        if (dragIndex.value === null) return
        e.preventDefault()
        dropIndex.value = index
    }

    function onDragLeave() {
        dropIndex.value = null
    }

    function onDrop(e: DragEvent, index: number) {
        e.preventDefault()
        if (dragIndex.value !== null && dragIndex.value !== index) {
            onReorder(dragIndex.value, index)
        }
        dragIndex.value = null
        dropIndex.value = null
    }

    function onDragEnd() {
        dragIndex.value = null
        dropIndex.value = null
    }

    return {dragIndex, dropIndex, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd}
}
