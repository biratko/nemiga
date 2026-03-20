import { ref } from 'vue'
import { fetchRoots } from '@/api/fs'
import type { DriveEntry } from '@/types/fs'

const drives = ref<DriveEntry[]>([])
let initialized = false

async function refresh() {
    const result = await fetchRoots()
    if (result.length > 0) {
        drives.value = result
    }
}

export function useDriveList() {
    if (!initialized) {
        initialized = true
        refresh()
    }
    return { drives, refreshDrives: refresh }
}
