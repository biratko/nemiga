import { ref, computed, type Ref } from 'vue'
import type { FSEntry } from '@/types/fs'

type SortKey = 'name' | 'size' | 'modified'
type SortDir = 'asc' | 'desc'

export function useSorting(
  entries: Ref<FSEntry[]>,
  initialKey: SortKey = 'name',
  initialDir: SortDir = 'asc',
) {
  const sortKey = ref<SortKey>(initialKey)
  const sortDir = ref<SortDir>(initialDir)

  function setSort(key: SortKey) {
    if (sortKey.value === key) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortKey.value = key
      sortDir.value = 'asc'
    }
  }

  const sortedEntries = computed(() => {
    const dirs = entries.value.filter(e => e.type === 'directory')
    const files = entries.value.filter(e => e.type !== 'directory')

    const compareFiles = (a: FSEntry, b: FSEntry): number => {
      let result = 0
      if (sortKey.value === 'name') {
        result = a.name.localeCompare(b.name)
      } else if (sortKey.value === 'size') {
        result = a.size - b.size
      } else if (sortKey.value === 'modified') {
        result = a.modified.localeCompare(b.modified)
      }
      if (result === 0) result = a.name.localeCompare(b.name)
      return sortDir.value === 'asc' ? result : -result
    }

    const compareDirs = (a: FSEntry, b: FSEntry): number => {
      if (sortKey.value === 'size') {
        return a.name.localeCompare(b.name)
      }
      return compareFiles(a, b)
    }

    return [...dirs.sort(compareDirs), ...files.sort(compareFiles)]
  })

  return { sortKey, sortDir, setSort, sortedEntries }
}
