import { ref } from 'vue'
import type { FSEntry } from '@/types/fs'
import { listDirectory } from '@/api/fs'

export function useDirectoryLoader() {
  const currentPath = ref('/')
  const entries = ref<FSEntry[]>([])
  const error = ref<string | null>(null)

  async function loadDirectory(path: string, signal?: AbortSignal): Promise<boolean> {
    error.value = null
    try {
      const res = await listDirectory(path, signal)
      if (signal?.aborted) return false
      if (res.ok && res.entries) {
        currentPath.value = res.path!
        entries.value = res.entries
        return true
      }
      if (res.error) {
        error.value = res.error.message
      }
      return false
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false
      error.value = e instanceof Error ? e.message : 'Failed to load directory'
      return false
    }
  }

  return { currentPath, entries, error, loadDirectory }
}
