<script setup lang="ts">
import {ref, computed, onMounted} from 'vue'
import type {FileTypeOverride} from '@/types/settings'
import {EXTENSION_MAP} from '@/utils/iconMap'
import {fetchMimeDefaults} from '@/api/fs'

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
const mimeDefaults = ref<Record<string, {mime: string; program: string}>>({})

onMounted(async () => {
    mimeDefaults.value = await fetchMimeDefaults()
})

/** Merged list: built-in extensions + user-added ones */
const rows = computed(() => {
    const result: {ext: string; icon: string; program: string; systemProgram: string; builtin: boolean}[] = []
    // Built-in from EXTENSION_MAP
    for (const [ext, iconName] of EXTENSION_MAP) {
        const override = props.fileTypes[ext]
        const systemProg = mimeDefaults.value[ext]?.program ?? ''
        result.push({
            ext,
            icon: override?.icon ?? iconName,
            program: override?.program ?? '',
            systemProgram: systemProg,
            builtin: true,
        })
    }
    // User-added extensions not in EXTENSION_MAP
    for (const ext of Object.keys(props.fileTypes)) {
        if (!EXTENSION_MAP.has(ext)) {
            const override = props.fileTypes[ext]
            result.push({
                ext,
                icon: override.icon ?? '',
                program: override.program ?? '',
                systemProgram: '',
                builtin: false,
            })
        }
    }
    return result
})

function addRow() {
    const ext = newExt.value.trim().toLowerCase().replace(/^\./, '')
    if (!ext) return
    if (EXTENSION_MAP.has(ext) || ext in props.fileTypes) return
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
    const builtinIcon = EXTENSION_MAP.get(ext)
    const current = {...(props.fileTypes[ext] ?? {})}

    if (field === 'icon' && builtinIcon && (value === builtinIcon || value === '')) {
        // Reset icon to default — remove override if program is also empty
        delete current.icon
    } else {
        current[field] = value || undefined
    }

    // If nothing is overridden for a built-in type, remove the entry entirely
    if (builtinIcon && !current.icon && !current.program) {
        const updated = {...props.fileTypes}
        delete updated[ext]
        emit('update:fileTypes', updated)
        return
    }

    emit('update:fileTypes', {...props.fileTypes, [ext]: current})
}
</script>

<template>
    <div class="section">
        <div class="section-title">File Types</div>
        <p class="hint">Built-in file types with their icons. You can override icons or assign programs.</p>
        <div class="table-wrap">
            <table class="ft-table">
                <thead>
                    <tr>
                        <th class="col-ext">Extension</th>
                        <th class="col-icon">Icon</th>
                        <th class="col-prog">Program</th>
                        <th class="col-act"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in rows" :key="row.ext" :class="{overridden: row.ext in fileTypes}">
                        <td class="ext-cell">.{{ row.ext }}</td>
                        <td><input type="text" :value="row.icon" @input="updateField(row.ext, 'icon', ($event.target as HTMLInputElement).value)" class="ft-input icon-input" /></td>
                        <td><input type="text" :value="row.program" @input="updateField(row.ext, 'program', ($event.target as HTMLInputElement).value)" class="ft-input" :placeholder="row.systemProgram || (platform === 'win32' ? 'program.exe' : '/usr/bin/...')" /></td>
                        <td>
                            <button v-if="!row.builtin" class="remove-btn" @click="removeRow(row.ext)">Remove</button>
                            <button v-else-if="row.ext in fileTypes" class="remove-btn" @click="removeRow(row.ext)">Reset</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
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

.table-wrap {
    max-height: 320px;
    overflow-y: auto;
    border: 1px solid var(--border);
}

.ft-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
}

.ft-table thead {
    position: sticky;
    top: 0;
    background: var(--bg-panel);
    z-index: 1;
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
    padding: 1px 4px;
}

.col-ext { width: 80px; }
.col-icon { width: 120px; }
.col-act { width: 60px; }

.ext-cell {
    color: var(--text-primary);
    font-family: inherit;
    padding-left: 8px !important;
}

tr.overridden .ext-cell {
    color: var(--accent);
}

.ft-input {
    width: 100%;
    padding: 2px 6px;
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
    width: 120px;
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
    flex: 0 0 auto;
}

.add-btn, .remove-btn {
    padding: 2px 8px;
    background: var(--bg-panel);
    color: var(--text-primary);
    border: 1px solid var(--border);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--font-size-xs);
    white-space: nowrap;
}

.add-btn:hover, .remove-btn:hover {
    background: var(--bg-row-hover);
}
</style>
