<script setup lang="ts">
import {ref, reactive, onUnmounted, computed} from 'vue'
import type {FSEntry} from '@/types/fs'
import type {OperationWsHandle} from '@/api/ws'
import type {MultiRenameEvents} from '@/types/ws'
import {connectMultiRenameWs} from '@/api/ws'
import {getPlatform} from '@/api/platform'
import {showToast} from '@/composables/useToast'
import {useMultiRenamePreview, DEFAULT_PARAMS, type MultiRenameParams, type CaseTransform, type DatePreset} from '@/composables/useMultiRenamePreview'
import {useVirtualScroll} from '@/composables/useVirtualScroll'
import {joinPath} from '@/utils/path'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{
    basePath: string
    entries: FSEntry[]
    allEntries: FSEntry[]
}>()

const emit = defineEmits<{close: [renamed: boolean]}>()

type Phase = 'editing' | 'renaming' | 'done'

const phase = ref<Phase>('editing')
const params = reactive<MultiRenameParams>({...DEFAULT_PARAMS})
const paramsRef = computed(() => ({...params}))
const entriesRef = computed(() => props.entries)
const allEntriesRef = computed(() => props.allEntries)
const caseSensitive = ref(true)

getPlatform().then(p => {
    caseSensitive.value = p === 'linux'
})

const {rows, canRename} = useMultiRenamePreview(entriesRef, allEntriesRef, paramsRef, caseSensitive)

const tableRef = ref<HTMLElement | null>(null)
const ROW_HEIGHT = 28
const {startIndex, endIndex, topSpacerHeight, bottomSpacerHeight} =
    useVirtualScroll(tableRef, computed(() => rows.value.length), ROW_HEIGHT)

const visibleRows = computed(() =>
    rows.value.slice(startIndex.value, endIndex.value)
        .map((row, i) => ({...row, globalIndex: startIndex.value + i}))
)

const progress = ref({current: 0, total: 0, name: ''})
const errorItems = ref<Array<{index: number; name: string; message: string}>>([])
let wsHandle: OperationWsHandle<MultiRenameEvents> | null = null

function cleanup() {
    wsHandle?.close()
    wsHandle = null
}

onUnmounted(cleanup)

function startRename() {
    const renames = rows.value
        .filter(r => !r.unchanged)
        .map(r => ({path: joinPath(props.basePath, r.originalName), newName: r.newName}))

    if (!renames.length) return

    phase.value = 'renaming'
    progress.value = {current: 0, total: renames.length, name: ''}
    errorItems.value = []

    wsHandle = connectMultiRenameWs()

    wsHandle.onEvent('progress', (data) => {
        progress.value = {current: data.current, total: data.total, name: data.name}
    })

    wsHandle.onEvent('error_item', (data) => {
        errorItems.value.push({index: data.index, name: data.name, message: data.message})
    })

    wsHandle.onEvent('complete', (data) => {
        phase.value = 'done'
        if (data.errors === 0) {
            showToast(`Renamed ${data.renamed} files`)
            emit('close', true)
        }
    })

    wsHandle.onEvent('error', (data) => {
        phase.value = 'done'
        errorItems.value.push({index: -1, name: '', message: data.error.message})
    })

    wsHandle.send({command: 'start', renames})
}

function cancelRename() {
    wsHandle?.send({command: 'cancel'})
}

function close(renamed: boolean) {
    cleanup()
    emit('close', renamed)
}

const DATE_PRESETS: DatePreset[] = ['YYYY-MM-DD', 'DD.MM.YYYY', 'YYYYMMDD', 'YYYYMMDD_HHmmss']
const CASE_OPTIONS: {value: CaseTransform; label: string}[] = [
    {value: 'none', label: 'None'},
    {value: 'lower', label: 'lowercase'},
    {value: 'upper', label: 'UPPERCASE'},
    {value: 'title', label: 'Title Case'},
]
</script>

<template>
    <ModalDialog title="Multi-Rename" :wide="true" @close="close(false)">
        <template v-if="phase === 'editing'">
            <div class="mr-form">
                <div class="mr-row">
                    <label>Name mask:<input v-model="params.nameMask" class="mr-input mr-input-wide" /></label>
                    <label>Extension:<input v-model="params.extMask" class="mr-input" /></label>
                </div>
                <div class="mr-row">
                    <label>Search:<input v-model="params.search" class="mr-input" /></label>
                    <label>Replace:<input v-model="params.replace" class="mr-input" /></label>
                    <label class="mr-checkbox"><input type="checkbox" v-model="params.useRegex" /> RegExp</label>
                </div>
                <div class="mr-row">
                    <label>Case:
                        <select v-model="params.caseTransform" class="mr-select">
                            <option v-for="opt in CASE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                        </select>
                    </label>
                </div>
                <div class="mr-row">
                    <label>Counter start:<input v-model.number="params.counterStart" type="number" class="mr-input mr-input-narrow" /></label>
                    <label>Step:<input v-model.number="params.counterStep" type="number" class="mr-input mr-input-narrow" /></label>
                    <label>Width:<input v-model.number="params.counterWidth" type="number" min="1" max="10" class="mr-input mr-input-narrow" /></label>
                </div>
                <div class="mr-row">
                    <label>Date format:
                        <select v-model="params.datePreset" class="mr-select">
                            <option v-for="p in DATE_PRESETS" :key="p" :value="p">{{ p }}</option>
                        </select>
                    </label>
                </div>
            </div>

            <div ref="tableRef" class="mr-table-container">
                <table class="mr-table">
                    <thead>
                        <tr>
                            <th>Original name</th>
                            <th>New name</th>
                            <th class="mr-status-col">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr :style="{height: topSpacerHeight + 'px'}" v-if="topSpacerHeight > 0"></tr>
                        <tr
                            v-for="row in visibleRows"
                            :key="row.globalIndex"
                            :class="{
                                'mr-conflict': row.conflict !== null,
                                'mr-unchanged': row.unchanged,
                            }"
                            :style="{height: ROW_HEIGHT + 'px'}"
                        >
                            <td>{{ row.originalName }}</td>
                            <td>{{ row.newName }}</td>
                            <td class="mr-status-col">
                                <span v-if="row.conflict === 'duplicate'" class="mr-conflict-badge">duplicate</span>
                                <span v-else-if="row.conflict === 'exists'" class="mr-conflict-badge">exists</span>
                            </td>
                        </tr>
                        <tr :style="{height: bottomSpacerHeight + 'px'}" v-if="bottomSpacerHeight > 0"></tr>
                    </tbody>
                </table>
            </div>

            <div class="mr-actions">
                <button class="mr-btn mr-btn-primary" :disabled="!canRename" @click="startRename">Rename</button>
                <button class="mr-btn" @click="close(false)">Cancel</button>
            </div>
        </template>

        <template v-if="phase === 'renaming'">
            <div class="mr-progress">
                <div class="mr-progress-text">
                    Renaming {{ progress.current }} / {{ progress.total }}: {{ progress.name }}
                </div>
                <div class="mr-progress-bar">
                    <div class="mr-progress-fill" :style="{width: (progress.total ? progress.current / progress.total * 100 : 0) + '%'}"></div>
                </div>
            </div>
            <div class="mr-actions">
                <button class="mr-btn" @click="cancelRename">Cancel</button>
            </div>
        </template>

        <template v-if="phase === 'done'">
            <div class="mr-results">
                <div class="mr-results-summary">
                    Renamed: {{ progress.current - errorItems.length }} of {{ progress.total }}
                </div>
                <div v-for="err in errorItems" :key="err.index" class="mr-error-item">
                    ✗ {{ err.name || 'Fatal error' }} — {{ err.message }}
                </div>
            </div>
            <div class="mr-actions">
                <button class="mr-btn mr-btn-primary" @click="close(true)">Close</button>
            </div>
        </template>
    </ModalDialog>
</template>

<style scoped>
.mr-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
}
.mr-row {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
}
.mr-row label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text);
    white-space: nowrap;
}
.mr-input {
    background: var(--bg-input);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 2px 6px;
    font-size: 12px;
    font-family: inherit;
}
.mr-input-wide { width: 200px; }
.mr-input-narrow { width: 60px; }
.mr-select {
    background: var(--bg-input);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 2px 4px;
    font-size: 12px;
}
.mr-checkbox {
    cursor: pointer;
}

.mr-table-container {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--border);
}
.mr-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    table-layout: fixed;
}
.mr-table thead {
    position: sticky;
    top: 0;
    background: var(--bg-header);
    z-index: 1;
}
.mr-table th, .mr-table td {
    padding: 2px 8px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-bottom: 1px solid var(--border);
}
.mr-status-col { width: 80px; text-align: center; }
.mr-conflict { background: var(--bg-conflict, rgba(255, 80, 80, 0.15)); }
.mr-unchanged { opacity: 0.5; }
.mr-conflict-badge {
    color: var(--error-text, #ff5050);
    font-size: 11px;
    font-weight: bold;
}

.mr-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
}
.mr-btn {
    padding: 4px 16px;
    font-size: 12px;
    cursor: pointer;
    background: var(--bg-button);
    color: var(--text);
    border: 1px solid var(--border);
}
.mr-btn:hover { background: var(--bg-button-hover); }
.mr-btn-primary { background: var(--accent); color: var(--accent-text); }
.mr-btn-primary:hover { filter: brightness(1.1); }
.mr-btn:disabled { opacity: 0.4; cursor: default; }

.mr-progress { margin: 16px 0; }
.mr-progress-text { font-size: 12px; margin-bottom: 4px; color: var(--text); }
.mr-progress-bar {
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
}
.mr-progress-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.1s;
}

.mr-results { margin: 8px 0; }
.mr-results-summary { font-size: 13px; font-weight: bold; margin-bottom: 8px; color: var(--text); }
.mr-error-item {
    font-size: 12px;
    color: var(--error-text, #ff5050);
    padding: 2px 0;
}
</style>
