<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted} from 'vue'
import {connectSearchWs} from '@/api/ws'
import type {OperationWsHandle} from '@/api/ws'
import type {SearchEvents} from '@/types/ws'
import type {FSEntry} from '@/types/fs'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{
    initialDirectory: string
}>()

const emit = defineEmits<{
    close: []
    'to-panel': [results: FSEntry[], directory: string]
}>()

type Phase = 'input' | 'searching' | 'done' | 'error'
const phase = ref<Phase>('input')
const collapsed = ref(false)

// Form fields
const fileMask = ref('*')
const contentEnabled = ref(false)
const contentSearch = ref('')
const caseSensitive = ref(false)
const useRegex = ref(false)
const searchDir = ref(props.initialDirectory)
const maxDepthInput = ref('')

const maxDepth = computed(() => {
    const v = maxDepthInput.value.trim()
    if (v === '' || v === '∞') return -1
    const n = parseInt(v, 10)
    return isNaN(n) || n < 0 ? -1 : n
})

// Results
const results = ref<FSEntry[]>([])
const foundCount = ref(0)
const scannedCount = ref(0)
const currentScanning = ref('')
const opError = ref<{code: string; message: string} | null>(null)

let wsHandle: OperationWsHandle<SearchEvents> | null = null

const summaryText = computed(() => {
    let s = fileMask.value
    if (contentEnabled.value && contentSearch.value) {
        s += ` — content: "${contentSearch.value}"`
    }
    s += ` — in ${searchDir.value}`
    return s
})

function cleanup() {
    wsHandle?.close()
    wsHandle = null
}

function startSearch() {
    phase.value = 'searching'
    collapsed.value = true
    results.value = []
    foundCount.value = 0
    scannedCount.value = 0
    currentScanning.value = ''

    wsHandle = connectSearchWs()

    wsHandle.onEvent('found', (data) => {
        results.value = results.value.concat(data.files)
        foundCount.value = results.value.length
    })

    wsHandle.onEvent('progress', (data) => {
        currentScanning.value = data.current
        scannedCount.value = data.scanned
        foundCount.value = data.found
    })

    wsHandle.onEvent('complete', (data) => {
        foundCount.value = data.found
        scannedCount.value = data.scanned
        phase.value = 'done'
    })

    wsHandle.onEvent('error', (data) => {
        if (phase.value === 'done') return
        opError.value = data.error
        phase.value = 'error'
    })

    wsHandle.send({
        command: 'start',
        directory: searchDir.value,
        fileMask: fileMask.value,
        contentSearch: contentEnabled.value ? contentSearch.value : undefined,
        caseSensitive: caseSensitive.value,
        regex: useRegex.value,
        maxDepth: maxDepth.value,
    })
}

function stopSearch() {
    wsHandle?.send({command: 'cancel'})
    phase.value = 'done'
}

function toPanel() {
    cleanup()
    emit('to-panel', results.value, searchDir.value)
}

function close() {
    if (phase.value === 'searching') {
        wsHandle?.send({command: 'cancel'})
    }
    cleanup()
    emit('close')
}

function toggleCollapsed() {
    if (phase.value === 'searching') return
    collapsed.value = !collapsed.value
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`
}

function onKeydown(e: KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Escape') {
        close()
    } else if (e.key === 'Enter' && phase.value === 'input') {
        startSearch()
    }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown)
    cleanup()
})
</script>

<template>
    <ModalDialog title="Search" :wide="true">
        <!-- Parameters block -->
        <div v-if="!collapsed" class="params-block">
            <div class="field">
                <label class="field-label">File name mask</label>
                <input
                    class="field-input"
                    v-model="fileMask"
                    placeholder="*.ts, *.vue"
                    :disabled="phase === 'searching'"
                />
            </div>

            <div class="field">
                <label class="checkbox-label">
                    <input type="checkbox" v-model="contentEnabled" :disabled="phase === 'searching'">
                    Search in file content
                </label>
                <template v-if="contentEnabled">
                    <input
                        class="field-input"
                        v-model="contentSearch"
                        placeholder="Search text or regex"
                        :disabled="phase === 'searching'"
                    />
                    <div class="content-options">
                        <label class="checkbox-label small">
                            <input type="checkbox" v-model="caseSensitive" :disabled="phase === 'searching'">
                            Case sensitive
                        </label>
                        <label class="checkbox-label small">
                            <input type="checkbox" v-model="useRegex" :disabled="phase === 'searching'">
                            Regex
                        </label>
                    </div>
                </template>
            </div>

            <div class="field">
                <label class="field-label">Search in</label>
                <input
                    class="field-input"
                    v-model="searchDir"
                    :disabled="phase === 'searching'"
                />
            </div>

            <div class="field">
                <label class="field-label">Max depth</label>
                <div class="depth-row">
                    <input
                        class="field-input depth-input"
                        v-model="maxDepthInput"
                        placeholder="∞"
                        :disabled="phase === 'searching'"
                    />
                    <span class="depth-hint">empty = unlimited, 0 = only this directory</span>
                </div>
            </div>

            <div class="field">
                <label class="checkbox-label small disabled">
                    <input type="checkbox" disabled>
                    Search in archives
                </label>
            </div>
        </div>

        <!-- Collapsed summary -->
        <div v-else class="params-summary" @click="toggleCollapsed">
            <span class="summary-text">{{ summaryText }}</span>
            <span class="summary-chevron">{{ phase === 'searching' ? '' : '▸' }}</span>
        </div>

        <!-- Progress -->
        <div v-if="phase === 'searching'" class="progress-section">
            <div class="progress-row">
                <span class="scanning-path">{{ currentScanning || 'Starting...' }}</span>
                <span class="found-count">Found: {{ foundCount }}</span>
            </div>
            <div class="progress-bar-wrap">
                <div class="progress-bar-indeterminate"></div>
            </div>
        </div>

        <!-- Results table -->
        <div v-if="phase !== 'input'" class="results-section">
            <div v-if="results.length === 0 && phase === 'done'" class="no-results">
                No files found
            </div>
            <div v-else-if="results.length > 0" class="results-table-wrap">
                <table class="results-table">
                    <thead>
                        <tr>
                            <th class="col-name">Name</th>
                            <th class="col-path">Path</th>
                            <th class="col-size">Size</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(r, i) in results" :key="i">
                            <td class="col-name">{{ r.name }}</td>
                            <td class="col-path">{{ r.searchPath }}</td>
                            <td class="col-size">{{ formatSize(r.size) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Error -->
        <div v-if="phase === 'error'" class="error-msg">
            Error ({{ opError?.code }}): {{ opError?.message }}
        </div>

        <!-- Footer -->
        <div class="dialog-footer">
            <div class="footer-left">
                <button
                    v-if="results.length > 0 && phase !== 'searching'"
                    class="btn-primary"
                    @click="toPanel"
                >To panel</button>
            </div>
            <div class="footer-right">
                <button v-if="phase === 'input'" class="btn-primary" @click="startSearch">Search</button>
                <button v-if="phase === 'searching'" @click="stopSearch">Stop</button>
                <button @click="close">{{ phase === 'input' ? 'Cancel' : 'Close' }}</button>
            </div>
        </div>
    </ModalDialog>
</template>

<style scoped>
.params-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 10px;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.field-label {
    font-size: 11px;
    color: var(--text-secondary);
}

.field-input {
    padding: 3px 6px;
    font-size: 13px;
    font-family: var(--font-family);
    background: var(--bg-header);
    border: 1px solid var(--border);
    color: var(--text-primary);
    border-radius: 3px;
}

.field-input:disabled {
    opacity: 0.5;
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    color: var(--text-primary);
    cursor: pointer;
}

.checkbox-label.small {
    font-size: 12px;
}

.checkbox-label.disabled {
    color: var(--text-secondary);
    opacity: 0.5;
    cursor: default;
}

.content-options {
    display: flex;
    gap: 14px;
    margin-top: 3px;
}

.depth-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.depth-input {
    width: 60px;
    text-align: center;
}

.depth-hint {
    font-size: 11px;
    color: var(--text-secondary);
}

.params-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: var(--bg-header);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    margin-bottom: 10px;
    font-size: 12px;
    color: var(--text-secondary);
}

.params-summary:hover {
    background: var(--bg-row-hover);
}

.summary-chevron {
    font-size: 10px;
    color: var(--text-secondary);
}

.progress-section {
    margin-bottom: 8px;
}

.progress-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text-secondary);
    margin-bottom: 3px;
}

.scanning-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    margin-right: 10px;
}

.found-count {
    white-space: nowrap;
}

.results-section {
    margin-bottom: 10px;
}

.results-table-wrap {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 3px;
}

.results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}

.results-table thead {
    position: sticky;
    top: 0;
    background: var(--bg-header);
}

.results-table th {
    text-align: left;
    padding: 3px 8px;
    border-bottom: 1px solid var(--border);
    font-weight: bold;
    font-size: 11px;
    color: var(--text-secondary);
}

.results-table td {
    padding: 2px 8px;
    border-bottom: 1px solid var(--bg-header);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.col-name {
    width: 35%;
}

.col-path {
    width: 50%;
    color: var(--text-secondary);
}

.col-size {
    width: 15%;
    text-align: right;
}

.results-table td.col-path {
    color: var(--text-secondary);
}

.results-table td.col-size {
    text-align: right;
    color: var(--text-secondary);
}

.no-results {
    text-align: center;
    padding: 16px;
    color: var(--text-secondary);
    font-size: 13px;
}

.error-msg {
    color: var(--text-error);
    font-size: 13px;
    margin-bottom: 10px;
}

.dialog-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}

.footer-left, .footer-right {
    display: flex;
    gap: 8px;
}

.btn-primary {
    background: var(--accent) !important;
    color: var(--bg-primary) !important;
    border-color: var(--accent) !important;
}
</style>
