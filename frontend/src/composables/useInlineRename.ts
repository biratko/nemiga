import { ref } from 'vue'
import type { FSEntry } from '@/types/fs'
import { renameFile } from '@/api/fs'
import { joinPath } from '@/utils/path'

export function useInlineRename(
  currentPath: () => string,
  reloadDirectory: (restoreCursorName?: string) => void,
) {
  const renamingEntry = ref<string | null>(null)
  const renameValue = ref('')
  const renameError = ref<string | null>(null)

  function startRename(entry: FSEntry) {
    if (entry.name === '..') return
    renamingEntry.value = entry.name
    renameValue.value = entry.name
    renameError.value = null
  }

  async function commitRename() {
    const originalName = renamingEntry.value
    const newName = renameValue.value.trim()

    if (!originalName || !newName || newName === originalName) {
      cancelRename()
      return
    }

    // Clear renamingEntry synchronously to prevent blur from firing cancel
    renamingEntry.value = null
    renameError.value = null

    const result = await renameFile(
      joinPath(currentPath(), originalName),
      newName,
    )

    if (result.ok) {
      reloadDirectory(newName)
    } else {
      // Re-open input on error
      renamingEntry.value = originalName
      renameValue.value = newName
      renameError.value = result.error?.message ?? 'Rename failed'
      alert(renameError.value)
    }
  }

  function cancelRename() {
    if (renamingEntry.value === null) return
    renamingEntry.value = null
    renameValue.value = ''
    renameError.value = null
  }

  return {
    renamingEntry,
    renameValue,
    renameError,
    startRename,
    commitRename,
    cancelRename,
  }
}
