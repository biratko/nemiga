<script setup lang="ts">
import {ref} from 'vue'
import type {FileTypeOverride} from '@/types/settings'

const props = defineProps<{
    fileTypes: Record<string, FileTypeOverride>
    platform: string
}>()

const emit = defineEmits<{
    'update:fileTypes': [value: Record<string, FileTypeOverride>]
}>()

const newExt = ref('')
const newIcon = ref('')
const newProgram = ref('')

function addRow() {
    const ext = newExt.value.trim().toLowerCase().replace(/^\./, '')
    if (!ext) return
    if (ext in props.fileTypes) return
    const updated = {...props.fileTypes, [ext]: {icon: newIcon.value || undefined, program: newProgram.value || undefined}}
    newExt.value = ''
    newIcon.value = ''
    newProgram.value = ''
    emit('update:fileTypes', updated)
}

function removeRow(ext: string) {
    const updated = {...props.fileTypes}
    delete updated[ext]
    emit('update:fileTypes', updated)
}

function updateField(ext: string, field: 'icon' | 'program', value: string) {
    const entry = {...(props.fileTypes[ext] ?? {})}
    entry[field] = value || undefined
    emit('update:fileTypes', {...props.fileTypes, [ext]: entry})
}
</script>

<template>
    <div class="section">
        <div class="section-title">File Type Overrides</div>
        <p class="hint">Override built-in icons or assign programs to file extensions.</p>
        <table class="ft-table">
            <thead>
                <tr>
                    <th>Extension</th>
                    <th>Icon</th>
                    <th>Program</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="(override, ext) in fileTypes" :key="ext">
                    <td class="ext-cell">.{{ ext }}</td>
                    <td><input type="text" :value="override.icon ?? ''" @input="updateField(ext as string, 'icon', ($event.target as HTMLInputElement).value)" class="ft-input icon-input" placeholder="emoji" /></td>
                    <td><input type="text" :value="override.program ?? ''" @input="updateField(ext as string, 'program', ($event.target as HTMLInputElement).value)" class="ft-input" :placeholder="platform === 'win32' ? 'program.exe' : '/usr/bin/...'" /></td>
                    <td><button class="remove-btn" @click="removeRow(ext as string)">Remove</button></td>
                </tr>
            </tbody>
        </table>
        <div class="add-row">
            <input type="text" v-model="newExt" class="ft-input ext-input" placeholder="ext" @keydown.enter="addRow" />
            <input type="text" v-model="newIcon" class="ft-input icon-input" placeholder="icon" @keydown.enter="addRow" />
            <input type="text" v-model="newProgram" class="ft-input" placeholder="program" @keydown.enter="addRow" />
            <button class="add-btn" @click="addRow">Add</button>
        </div>
    </div>
</template>

<style scoped>
.section {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.section-title {
    font-size: var(--font-size-xs);
    font-weight: bold;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.hint {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0;
}

.ft-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
}

.ft-table th {
    text-align: left;
    padding: 4px 8px;
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    border-bottom: 1px solid var(--border);
}

.ft-table td {
    padding: 2px 4px;
}

.ext-cell {
    color: var(--text-primary);
    font-family: inherit;
    padding-left: 8px !important;
}

.ft-input {
    width: 100%;
    padding: 3px 8px;
    background: var(--bg-header);
    color: var(--text-primary);
    border: 1px solid var(--border);
    font-family: inherit;
    font-size: var(--font-size-sm);
    box-sizing: border-box;
}

.ft-input:focus {
    outline: none;
    border-color: var(--accent);
}

.icon-input {
    width: 60px;
}

.ext-input {
    width: 60px;
}

.add-row {
    display: flex;
    gap: 4px;
    align-items: center;
}

.add-row .ft-input {
    flex: 1;
}

.add-row .ext-input,
.add-row .icon-input {
    flex: 0 0 60px;
}

.add-btn, .remove-btn {
    padding: 3px 10px;
    background: var(--bg-panel);
    color: var(--text-primary);
    border: 1px solid var(--border);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--font-size-sm);
    white-space: nowrap;
}

.add-btn:hover, .remove-btn:hover {
    background: var(--bg-row-hover);
}
</style>
