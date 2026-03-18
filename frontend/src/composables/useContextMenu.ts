import { ref, type Ref } from 'vue'
import type { FSEntry } from '@/types/fs'

export interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  entry: FSEntry | null
}

export function useContextMenu(
  contextMenuSuppressed: Ref<boolean>,
) {
  const menuState = ref<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    entry: null,
  })

  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let startX = 0
  let startY = 0
  const LONG_PRESS_MS = 500
  const MOVE_THRESHOLD = 5

  let longPressEntry: FSEntry | null = null

  function onRightMouseDown(event: MouseEvent, entry: FSEntry, undoSelection: () => void) {
    if (entry.name === '..') return

    startX = event.clientX
    startY = event.clientY
    longPressEntry = entry

    longPressTimer = setTimeout(() => {
      longPressTimer = null
      contextMenuSuppressed.value = true
      // Undo the selection toggle that rightMouseDown already performed
      undoSelection()
      menuState.value = {
        visible: true,
        x: event.clientX,
        y: event.clientY,
        entry: longPressEntry!,
      }
      longPressEntry = null
    }, LONG_PRESS_MS)
  }

  function onMouseMove(event: MouseEvent) {
    if (!longPressTimer) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  function onRightMouseUp() {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  function closeMenu() {
    menuState.value = { visible: false, x: 0, y: 0, entry: null }
    contextMenuSuppressed.value = false
  }

  return {
    menuState,
    onRightMouseDown,
    onMouseMove,
    onRightMouseUp,
    closeMenu,
  }
}
