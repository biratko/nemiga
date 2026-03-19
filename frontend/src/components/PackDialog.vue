<script setup lang="ts">
import {ref, computed, watch, onMounted, onUnmounted} from 'vue'
import {connectPackWs} from '@/api/ws'
import type {OperationWsHandle} from '@/api/ws'
import type {PackEvents} from '@/types/ws'
import ModalDialog from './ModalDialog.vue'

const FORMATS = [
    {label: 'zip', extensions: ['.zip']},
    {label: 'tar.gz', extensions: ['.tar.gz']},
    {label: 'tar.bz2', extensions: ['.tar.bz2']},
    {label: '7z', extensions: ['.7z']},
] as const

type Format = typeof FORMATS[number]['label']

const props = defineProps<{
    defaultName: string
    sourcePaths: string[]
    destination: string
}>()

const emit = defineEmits<{
    close: [packed: boolean]
}>()

type Phase = 'input' | 'packing' | 'done' | 'error'
const phase = ref<Phase>('input')

const format = ref<Format>('zip')
const archiveName = ref(props.defaultName + '.zip')
const overwrite = ref(false)

const currentFile = ref('')
const filesDone = ref(0)
const totalFiles = ref(0)
const archiveSize = ref(0)
const opError = ref<{code: string; message: string} | null>(null)

// Auto-update extension when format changes
watch(format, (newFormat) => {
    const name = archiveName.value
    // Strip any known archive extension
    let baseName = name
    for (const fmt of FORMATS) {
        for (const ext of fmt.extensions) {
            if (name.endsWith(ext)) {
                baseName = name.slice(0, -ext.length)
                break
            }
        }
        if (baseName !== name) break
    }
    const ext = FORMATS.find(f => f.label === newFormat)!.extensions[0]
    archiveName.value = baseName + ext
})

const progressPercent = computed(() => {
    if (totalFiles.value <= 0) return 0
    return Math.min(100, (filesDone.value / totalFiles.value) * 100)
})

function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

let wsHandle: OperationWsHandle<PackEvents> | null = null

function cleanup() {
    wsHandle?.close()
    wsHandle = null
}

function startPack() {
    phase.value = 'packing'

    wsHandle = connectPackWs()

    wsHandle.onEvent('progress', (data) => {
        currentFile.value = data.current_file
        filesDone.value = data.files_done
        totalFiles.value = data.total_files
    })

    wsHandle.onEvent('complete', (data) => {
        filesDone.value = data.files_done
        totalFiles.value = data.total_files
        archiveSize.value = data.archive_size
        phase.value = 'done'
    })

    wsHandle.onEvent('error', (data) => {
        if (phase.value === 'done') return
        opError.value = data.error
        phase.value = 'error'
    })

    wsHandle.send({
        command: 'start',
        sourcePaths: props.sourcePaths,
        destination: props.destination,
        archiveName: archiveName.value,
        overwrite: overwrite.value,
    })
}

function cancel() {
    if (phase.value === 'packing') {
        wsHandle?.send({command: 'cancel'})
    }
    cleanup()
    emit('close', false)
}

function onKeydown(e: KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Enter') {
        if (phase.value === 'input') startPack()
        else if (phase.value === 'done') emit('close', true)
        else if (phase.value === 'error') emit('close', false)
    } else if (e.key === 'Escape') {
        if (phase.value === 'input' || phase.value === 'packing') cancel()
        else if (phase.value === 'done') emit('close', true)
        else if (phase.value === 'error') emit('close', false)
    }
}

onMounted(() => {
    document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown)
    cleanup()
})
</script>

<template>
    <ModalDialog title="Pack">
        <template v-if="phase === 'input'">
            <div class="field">
                <label>Archive name:</label>
                <input v-model="archiveName" class="path-input" type="text" />
            </div>
            <div class="field">
                <label>Format:</label>
                <select v-model="format" class="format-select">
                    <option v-for="f in FORMATS" :key="f.label" :value="f.label">{{ f.label }}</option>
                </select>
            </div>
            <div class="field">
                <label>Destination:</label>
                <div class="preview">{{ destination }}</div>
            </div>
            <div class="field">
                <label class="checkbox-label">
                    <input type="checkbox" v-model="overwrite" />
                    Overwrite if exists
                </label>
            </div>
            <div class="dialog-footer">
                <button @click="startPack">Pack</button>
                <button @click="cancel">Cancel</button>
            </div>
        </template>

        <template v-else-if="phase === 'packing'">
            <div class="current-file">{{ currentFile || 'Preparing...' }}</div>
            <div class="progress-bar-wrap">
                <div
                    v-if="totalFiles > 0"
                    class="progress-bar"
                    :style="{ width: progressPercent + '%' }"
                ></div>
                <div v-else class="progress-bar-indeterminate"></div>
            </div>
            <div class="progress-stats">{{ filesDone }} / {{ totalFiles }} files</div>
            <div class="dialog-footer">
                <button @click="cancel">Cancel</button>
            </div>
        </template>

        <template v-else-if="phase === 'done'">
            <div class="done-msg">Packed {{ filesDone }} file(s), {{ formatSize(archiveSize) }}</div>
            <div class="dialog-footer">
                <button @click="emit('close', true)">Close</button>
            </div>
        </template>

        <template v-else-if="phase === 'error'">
            <div class="error-msg">Error ({{ opError?.code }}): {{ opError?.message }}</div>
            <div class="dialog-footer">
                <button @click="emit('close', false)">Close</button>
            </div>
        </template>
    </ModalDialog>
</template>

<style scoped>
.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.field label {
    font-size: 13px;
    color: var(--text-secondary);
}

.path-input,
.format-select {
    font-family: inherit;
    font-size: 13px;
    padding: 4px 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border);
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    cursor: pointer;
}

.preview {
    font-size: 12px;
    color: var(--text-secondary);
    padding: 4px 8px;
    background: var(--bg-header);
    border: 1px solid var(--border);
    word-break: break-all;
}
</style>
