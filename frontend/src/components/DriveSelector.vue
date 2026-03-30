<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useDriveList } from '@/composables/useDriveList'
import type { DriveEntry } from '@/types/fs'
import driveIconRaw from '@/assets/icons/drive.svg?raw'
import { getUiZoom } from '@/utils/zoom'

const props = defineProps<{ currentPath: string }>()
const emit = defineEmits<{ navigate: [path: string]; 'open-ftp': [] }>()

const { drives, refreshDrives } = useDriveList()
const isOpen = ref(false)
const wrapperEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const highlightIndex = ref(0)
const dropdownStyle = ref({ top: '0px', left: '0px' })

const isFtp = computed(() => props.currentPath.startsWith('ftp://'))

const currentDrive = computed(() => {
    if (isFtp.value) return null
    const fsPath = props.currentPath.split('::')[0]
    let best: DriveEntry | null = null
    let bestLen = -1
    for (const d of drives.value) {
        const dp = d.path.endsWith('/') ? d.path.slice(0, -1) : d.path
        if (
            (fsPath === dp || fsPath.startsWith(dp + '/')) &&
            dp.length > bestLen
        ) {
            best = d
            bestLen = dp.length
        }
    }
    return best
})

const totalItems = computed(() => drives.value.length + 1)
const ftpIndex = computed(() => drives.value.length)

function toggle() {
    if (isOpen.value) {
        isOpen.value = false
    } else {
        const rect = wrapperEl.value?.getBoundingClientRect()
        if (rect) {
            const zoom = getUiZoom()
            dropdownStyle.value = { top: `${rect.bottom / zoom}px`, left: `${rect.left / zoom}px` }
        }
        isOpen.value = true
        highlightIndex.value = drives.value.findIndex(
            (d) => d.path === currentDrive.value?.path,
        )
        if (highlightIndex.value < 0) highlightIndex.value = 0
        refreshDrives()
        nextTick(() => menuEl.value?.focus())
    }
}

function selectFtp() {
    isOpen.value = false
    emit('open-ftp')
}

function select(drive: DriveEntry) {
    isOpen.value = false
    emit('navigate', drive.path)
}

function onClickOutside(e: MouseEvent) {
    if (wrapperEl.value?.contains(e.target as Node)) return
    isOpen.value = false
}

function onKeydown(e: KeyboardEvent) {
    if (!isOpen.value) return
    switch (e.key) {
        case 'Escape':
            isOpen.value = false
            e.stopPropagation()
            break
        case 'ArrowDown':
            highlightIndex.value = Math.min(highlightIndex.value + 1, totalItems.value - 1)
            e.preventDefault()
            break
        case 'ArrowUp':
            highlightIndex.value = Math.max(highlightIndex.value - 1, 0)
            e.preventDefault()
            break
        case 'Enter':
            if (highlightIndex.value === ftpIndex.value) {
                selectFtp()
            } else if (drives.value[highlightIndex.value]) {
                select(drives.value[highlightIndex.value])
            }
            e.preventDefault()
            break
    }
}

onMounted(() => {
    document.addEventListener('mousedown', onClickOutside, { capture: true })
})

onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onClickOutside, { capture: true })
})
</script>

<template>
    <div class="drive-selector" ref="wrapperEl">
        <button class="drive-btn" :title="isFtp ? 'FTP' : currentDrive?.name ?? 'Drives'" @click.stop="toggle">
            <span class="drive-icon" v-html="driveIconRaw" />
            <span class="drive-label">{{ isFtp ? 'FTP' : currentDrive?.name ?? 'Drive' }}</span>
            <span class="drive-chevron">▾</span>
        </button>
        <div
            v-if="isOpen"
            ref="menuEl"
            class="drive-dropdown"
            :style="dropdownStyle"
            tabindex="-1"
            @keydown="onKeydown"
        >
            <div
                v-if="drives.length === 0"
                class="drive-item empty"
            >
                No drives found
            </div>
            <div
                v-for="(drive, i) in drives"
                :key="drive.path"
                class="drive-item"
                :class="{
                    active: drive.path === currentDrive?.path,
                    highlight: i === highlightIndex,
                }"
                @click="select(drive)"
                @mouseenter="highlightIndex = i"
            >
                <span class="drive-item-icon" v-html="driveIconRaw" />
                <span class="drive-item-name">{{ drive.name }}</span>
            </div>
            <div class="drive-separator" />
            <div
                class="drive-item"
                :class="{ highlight: highlightIndex === ftpIndex }"
                @click="selectFtp"
                @mouseenter="highlightIndex = ftpIndex"
            >
                <span class="drive-item-icon ftp-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2v8m0 4v8M2 12h8m4 0h8"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                </span>
                <span class="drive-item-name">FTP</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.drive-selector {
    position: relative;
    flex-shrink: 0;
}

.drive-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0 6px;
    height: 20px;
    background: var(--bg-row-hover);
    border: 1px solid var(--border);
    border-radius: 0 3px 3px 0;
    color: var(--text-primary);
    cursor: pointer;
    font-family: var(--font-family);
    font-size: var(--font-size-xs);
    white-space: nowrap;
}

.drive-btn:hover {
    background: var(--bg-row-selected);
}

.drive-icon {
    display: inline-flex;
    width: 12px;
    height: 12px;
}

.drive-icon :deep(svg) {
    width: 100%;
    height: 100%;
}

.drive-label {
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
}

.drive-chevron {
    font-size: 10px;
    line-height: 1;
    opacity: 0.7;
}

.drive-dropdown {
    position: fixed;
    z-index: 1000;
    min-width: 140px;
    max-height: 300px;
    overflow-y: auto;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.2);
    padding: 2px 0;
    outline: none;
}

.drive-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
    color: var(--text-primary);
}

.drive-item.empty {
    color: var(--text-secondary);
    cursor: default;
    font-style: italic;
}

.drive-item.highlight {
    background: var(--bg-row-selected);
    color: var(--text-selected);
}

.drive-item.active {
    font-weight: bold;
    color: var(--accent);
}

.drive-item.active.highlight {
    color: var(--text-selected);
}

.drive-item-icon {
    display: inline-flex;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
}

.drive-item-icon :deep(svg) {
    width: 100%;
    height: 100%;
}

.drive-separator {
    height: 1px;
    background: var(--border);
    margin: 2px 0;
}

.ftp-icon svg {
    width: 100%;
    height: 100%;
}
</style>
