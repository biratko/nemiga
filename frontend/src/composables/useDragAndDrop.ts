import { ref, type Ref } from 'vue'
import type { FSEntry } from '@/types/fs'
import { joinPath } from '@/utils/path'

export interface DragData {
  sources: string[]
  sourcePath: string
  panelId: string
}

const MIME = 'application/x-tacom-drag'

/** Shared reactive state across both panels */
const dropTargetPanelId = ref<string | null>(null)
const dropTargetEntry = ref<FSEntry | 'parent' | null>(null)

/** Ctrl state captured from mousedown before drag starts */
const ctrlOnMouseDown = ref(false)

export function useDragAndDrop(
  panelId: string,
  currentPath: Ref<string>,
  selectedEntries: Ref<FSEntry[]>,
  cursorEntry: Ref<FSEntry | null>,
) {
  function onMouseDown(e: MouseEvent) {
    if (e.button === 0) {
      ctrlOnMouseDown.value = e.ctrlKey
    }
  }

  function onDragStart(e: DragEvent, entry: FSEntry) {
    if (!e.dataTransfer) return

    const entries = selectedEntries.value.length > 0 && selectedEntries.value.some(s => s.name === entry.name)
      ? selectedEntries.value
      : [entry]

    const data: DragData = {
      sources: entries.map(en => joinPath(currentPath.value, en.name)),
      sourcePath: currentPath.value,
      panelId,
    }

    e.dataTransfer.setData(MIME, JSON.stringify(data))
    e.dataTransfer.effectAllowed = 'copyMove'
    e.dataTransfer.dropEffect = ctrlOnMouseDown.value ? 'copy' : 'move'

    // Custom drag image with count
    if (entries.length > 1) {
      const badge = document.createElement('div')
      badge.textContent = `${entries.length} items`
      badge.style.cssText = 'position:absolute;top:-1000px;padding:4px 8px;background:#333;color:#fff;border-radius:3px;font-size:12px;white-space:nowrap;'
      document.body.appendChild(badge)
      e.dataTransfer.setDragImage(badge, 0, 0)
      requestAnimationFrame(() => document.body.removeChild(badge))
    }
  }

  function onDragOver(e: DragEvent, entry: FSEntry | 'parent') {
    if (!e.dataTransfer || !e.dataTransfer.types.includes(MIME)) return

    const canDrop = entry === 'parent' || entry.type === 'directory'
    if (!canDrop) return

    e.preventDefault()
    e.dataTransfer.dropEffect = ctrlOnMouseDown.value ? 'copy' : 'move'
    dropTargetPanelId.value = panelId
    dropTargetEntry.value = entry
  }

  function onDragOverPanel(e: DragEvent) {
    if (!e.dataTransfer || !e.dataTransfer.types.includes(MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = ctrlOnMouseDown.value ? 'copy' : 'move'

    // Only set panel as target if no specific entry target is set
    if (dropTargetPanelId.value !== panelId) {
      dropTargetPanelId.value = panelId
      dropTargetEntry.value = null
    }
  }

  function onDragLeaveEntry() {
    if (dropTargetPanelId.value === panelId) {
      dropTargetEntry.value = null
    }
  }

  function onDragLeavePanel(e: DragEvent) {
    const related = e.relatedTarget as Node | null
    const panel = (e.currentTarget as HTMLElement)
    if (related && panel.contains(related)) return
    if (dropTargetPanelId.value === panelId) {
      dropTargetPanelId.value = null
      dropTargetEntry.value = null
    }
  }

  function onDrop(e: DragEvent, entry: FSEntry | 'parent' | null): { op: 'copy' | 'move'; sources: string[]; destination: string } | null {
    e.preventDefault()
    dropTargetPanelId.value = null
    dropTargetEntry.value = null

    if (!e.dataTransfer) return null
    const raw = e.dataTransfer.getData(MIME)
    if (!raw) return null

    const data: DragData = JSON.parse(raw)
    const op = ctrlOnMouseDown.value ? 'copy' : 'move'

    let destination: string
    if (entry === 'parent') {
      destination = currentPath.value.replace(/\/[^/]+$/, '') || '/'
    } else if (entry && entry.type === 'directory') {
      destination = joinPath(currentPath.value, entry.name)
    } else {
      destination = currentPath.value
    }

    // Prevent dropping into same directory
    if (data.sourcePath === destination) return null

    // Prevent dropping a directory into itself
    for (const src of data.sources) {
      if (destination === src || destination.startsWith(src + '/')) return null
    }

    return { op, sources: data.sources, destination }
  }

  return {
    dropTargetPanelId,
    dropTargetEntry,
    onMouseDown,
    onDragStart,
    onDragOver,
    onDragOverPanel,
    onDragLeaveEntry,
    onDragLeavePanel,
    onDrop,
  }
}
