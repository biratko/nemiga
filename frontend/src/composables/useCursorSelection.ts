import { ref, computed, type ComputedRef } from 'vue'
import type { FSEntry } from '@/types/fs'

export function useCursorSelection(
  sortedEntries: ComputedRef<FSEntry[]>,
  scrollToIndex: (index: number) => void,
) {
  const cursorIndex = ref(0)
  const selectedNames = ref<Set<string>>(new Set())
  const keyboardActive = ref(false)
  const contextMenuSuppressed = ref(false)

  function moveCursorUp() {
    if (cursorIndex.value > 0) {
      cursorIndex.value--
      scrollToIndex(cursorIndex.value)
    }
  }

  function moveCursorDown() {
    if (cursorIndex.value < sortedEntries.value.length) {
      cursorIndex.value++
      scrollToIndex(cursorIndex.value)
    }
  }

  function setCursor(idx: number) {
    cursorIndex.value = idx + 1
  }

  const rightDragMode = ref<'select' | 'deselect' | null>(null)

  function rightMouseDown(entry: FSEntry) {
    if (contextMenuSuppressed.value) return
    if (selectedNames.value.has(entry.name)) {
      selectedNames.value.delete(entry.name)
      rightDragMode.value = 'deselect'
    } else {
      selectedNames.value.add(entry.name)
      rightDragMode.value = 'select'
    }
  }

  function rightMouseEnter(entry: FSEntry) {
    if (contextMenuSuppressed.value) return
    if (rightDragMode.value === 'select') {
      selectedNames.value.add(entry.name)
    } else if (rightDragMode.value === 'deselect') {
      selectedNames.value.delete(entry.name)
    }
  }

  function rightMouseUp() {
    rightDragMode.value = null
  }

  function resetCursorSelection() {
    selectedNames.value.clear()
    cursorIndex.value = 0
  }

  function toggleCursorSelection() {
    if (cursorIndex.value === 0) return
    const entry = sortedEntries.value[cursorIndex.value - 1]
    if (!entry) return
    if (selectedNames.value.has(entry.name)) {
      selectedNames.value.delete(entry.name)
    } else {
      selectedNames.value.add(entry.name)
    }
    moveCursorDown()
  }

  function setKeyboardActive(val: boolean) {
    keyboardActive.value = val
  }

  const selectedEntries = computed(() =>
    sortedEntries.value.filter(e => selectedNames.value.has(e.name)),
  )

  return {
    cursorIndex,
    selectedNames,
    selectedEntries,
    keyboardActive,
    contextMenuSuppressed,
    moveCursorUp,
    moveCursorDown,
    setCursor,
    rightMouseDown,
    rightMouseEnter,
    rightMouseUp,
    toggleCursorSelection,
    resetCursorSelection,
    setKeyboardActive,
  }
}
