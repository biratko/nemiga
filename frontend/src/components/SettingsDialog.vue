<script setup lang="ts">
import {ref, onMounted, onUnmounted} from 'vue'
import ModalDialog from './ModalDialog.vue'
import type {SettingsState, KeyBindings} from '@/types/settings'
import {saveSettings} from '@/api/settings'
import {useTheme} from '@/composables/useTheme'
import {themeNames, themes} from '@/themes'

const props = defineProps<{
    initialSettings?: SettingsState
}>()

const emit = defineEmits<{close: [settings?: SettingsState]}>()

const {currentTheme, applyTheme} = useTheme()

const showHidden = ref(props.initialSettings?.showHidden ?? false)
const followSymlinks = ref(props.initialSettings?.followSymlinks ?? true)
const editor = ref(props.initialSettings?.editor ?? '')
const viewer = ref(props.initialSettings?.viewer ?? '')
const selectedTheme = ref(currentTheme.value)
const originalTheme = ref(currentTheme.value)
const bindings = ref<KeyBindings>({
    cursorUp: 'ArrowUp',
    cursorDown: 'ArrowDown',
    navigateIn: 'ArrowRight',
    navigateUp: 'ArrowLeft',
    switchPanel: 'Tab',
    ...props.initialSettings?.keyBindings,
})
const capturingKey = ref<keyof KeyBindings | null>(null)

const themeOptions = themeNames

function onThemeChange() {
    applyTheme(selectedTheme.value)
}

function onKeydown(e: KeyboardEvent) {
    e.stopPropagation()
    if (capturingKey.value) return
    if (e.key === 'Escape') cancel()
    else if (e.key === 'Enter') save()
}

onUnmounted(() => document.removeEventListener('keydown', onKeydown))
onMounted(() => document.addEventListener('keydown', onKeydown))

const bindingLabels: Record<keyof KeyBindings, string> = {
    cursorUp: 'Cursor Up',
    cursorDown: 'Cursor Down',
    navigateIn: 'Navigate Into',
    navigateUp: 'Navigate Up',
    switchPanel: 'Switch Panel',
}

function formatKey(key: string): string {
    const map: Record<string, string> = {
        ArrowUp: 'Up',
        ArrowDown: 'Down',
        ArrowLeft: 'Left',
        ArrowRight: 'Right',
        ' ': 'Space',
    }
    return map[key] ?? key
}

function startCapture(field: keyof KeyBindings) {
    capturingKey.value = field
}

function handleCapture(e: KeyboardEvent) {
    if (!capturingKey.value) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
        capturingKey.value = null
        return
    }
    bindings.value[capturingKey.value] = e.key
    capturingKey.value = null
}

function cancel() {
    applyTheme(originalTheme.value)
    emit('close')
}

async function save() {
    const state: SettingsState = {
        showHidden: showHidden.value,
        followSymlinks: followSymlinks.value,
        keyBindings: {...bindings.value},
        theme: selectedTheme.value,
        editor: editor.value,
        viewer: viewer.value,
    }
    localStorage.setItem('tacom-theme', selectedTheme.value)
    await saveSettings(state)
    emit('close', state)
}
</script>

<template>
    <ModalDialog title="Settings">
        <template #default>
            <div class="section">
                <div class="section-title">Appearance</div>
                <div class="theme-row">
                    <label class="theme-label">Theme</label>
                    <select v-model="selectedTheme" @change="onThemeChange" class="theme-select">
                        <option v-for="t in themeOptions" :key="t" :value="t">{{ themes[t].label }}</option>
                    </select>
                </div>
            </div>
            <div class="section">
                <div class="section-title">General</div>
                <label class="checkbox-row">
                    <input type="checkbox" v-model="showHidden" />
                    <span>Show hidden files</span>
                </label>
                <label class="checkbox-row">
                    <input type="checkbox" v-model="followSymlinks" />
                    <span>Follow symlinks when copying</span>
                </label>
                <div class="editor-row">
                    <label class="editor-label">Viewer</label>
                    <input type="text" v-model="viewer" class="editor-input" placeholder="/usr/bin/less" />
                </div>
                <div class="editor-row">
                    <label class="editor-label">Editor</label>
                    <input type="text" v-model="editor" class="editor-input" placeholder="/usr/bin/subl" />
                </div>
            </div>
            <div class="section">
                <div class="section-title">Key Bindings</div>
                <div class="bindings-grid">
                    <template v-for="(label, field) in bindingLabels" :key="field">
                        <div class="binding-label">{{ label }}</div>
                        <button
                            class="binding-value"
                            :class="{capturing: capturingKey === field}"
                            @click="startCapture(field)"
                            @keydown="capturingKey === field && handleCapture($event)"
                        >
                            {{ capturingKey === field ? 'Press a key...' : formatKey(bindings[field]) }}
                        </button>
                    </template>
                </div>
            </div>
            <div class="dialog-footer">
                <button class="btn-save" @click="save">Save</button>
                <button @click="cancel">Cancel</button>
            </div>
        </template>
    </ModalDialog>
</template>

<style scoped>
.theme-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.theme-label {
    font-size: var(--font-size);
    color: var(--text-primary);
}

.theme-select {
    padding: 3px 10px;
    background: var(--bg-header);
    color: var(--text-primary);
    border: 1px solid var(--border);
    font-family: inherit;
    font-size: var(--font-size-sm);
    cursor: pointer;
}

.theme-select:hover {
    background: var(--bg-row-hover);
}

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

.checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size);
    color: var(--text-primary);
    cursor: pointer;
}

.checkbox-row input[type="checkbox"] {
    accent-color: var(--accent);
}

.editor-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.editor-label {
    font-size: var(--font-size);
    color: var(--text-primary);
}

.editor-input {
    flex: 1;
    padding: 3px 10px;
    background: var(--bg-header);
    color: var(--text-primary);
    border: 1px solid var(--border);
    font-family: inherit;
    font-size: var(--font-size-sm);
}

.editor-input:focus {
    outline: none;
    border-color: var(--accent);
}

.bindings-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 12px;
    align-items: center;
}

.binding-label {
    font-size: var(--font-size);
    color: var(--text-primary);
}

.binding-value {
    padding: 3px 10px;
    background: var(--bg-header);
    color: var(--text-primary);
    border: 1px solid var(--border);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--font-size-sm);
    text-align: center;
    min-width: 80px;
}

.binding-value:hover {
    background: var(--bg-row-hover);
}

.binding-value.capturing {
    border-color: var(--accent);
    color: var(--accent);
}

.btn-save {
    color: var(--accent) !important;
    border-color: var(--accent) !important;
}
</style>
