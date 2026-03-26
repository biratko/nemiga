<script setup lang="ts">
import {ref, onMounted, onUnmounted, provide} from 'vue'
import ModalDialog from './ModalDialog.vue'
import SettingsAppearance from './SettingsAppearance.vue'
import SettingsKeyBindings from './SettingsKeyBindings.vue'
import SettingsFileTypes from './SettingsFileTypes.vue'
import SettingsSystem from './SettingsSystem.vue'
import type {SettingsState, FileTypeOverride} from '@/types/settings'
import {saveSettings} from '@/api/settings'
import {getPlatform} from '@/api/platform'
import {useTheme} from '@/composables/useTheme'

const props = defineProps<{
    initialSettings?: SettingsState
}>()

const emit = defineEmits<{close: [settings?: SettingsState]}>()

const {currentTheme, applyTheme} = useTheme()

type TabId = 'appearance' | 'keybindings' | 'filetypes' | 'system'
const activeTab = ref<TabId>('appearance')

// Shared flag so child components (SettingsKeyBindings) can block dialog-level
// Escape/Enter while they are capturing a key press.
const capturingKey = ref(false)
provide('capturingKey', capturingKey)

const tabs: {id: TabId; icon: string; label: string}[] = [
    {id: 'appearance', icon: '🎨', label: 'Look'},
    {id: 'keybindings', icon: '⌨', label: 'Keys'},
    {id: 'filetypes', icon: '📄', label: 'Types'},
    {id: 'system', icon: '⚙', label: 'System'},
]

const theme = ref(currentTheme.value)
const originalTheme = ref(currentTheme.value)
const zoom = ref(parseFloat(document.documentElement.style.zoom) || 1)
const originalZoom = ref(zoom.value)
const actionBindings = ref<Record<string, string[]>>({...(props.initialSettings?.actionBindings ?? {})})
const modifierBindings = ref<Record<string, string>>({...(props.initialSettings?.modifiers ?? {})})
const showHidden = ref(props.initialSettings?.showHidden ?? false)
const followSymlinks = ref(props.initialSettings?.followSymlinks ?? true)
const showToolbar = ref(props.initialSettings?.showToolbar ?? true)
const editor = ref(props.initialSettings?.editor ?? '')
const viewer = ref(props.initialSettings?.viewer ?? '')
const terminal = ref(props.initialSettings?.terminal ?? '')
const fileTypes = ref<Record<string, FileTypeOverride>>({...(props.initialSettings?.fileTypes ?? {})})
const toastDurationMs = ref(props.initialSettings?.toastDurationMs ?? 3000)
const platform = ref('linux')

function onKeydown(e: KeyboardEvent) {
    e.stopPropagation()
    // Don't handle Escape/Enter while key capture is active in KeyBindings tab
    if (capturingKey.value) return
    if (e.key === 'Escape') cancel()
    else if (e.key === 'Enter') save()
}

onMounted(() => {
    document.addEventListener('keydown', onKeydown)
    getPlatform().then(p => { platform.value = p })
})
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

function cancel() {
    applyTheme(originalTheme.value)
    document.documentElement.style.zoom = String(originalZoom.value)
    emit('close')
}

async function save() {
    const state: SettingsState = {
        showHidden: showHidden.value,
        followSymlinks: followSymlinks.value,
        showToolbar: showToolbar.value,
        actionBindings: actionBindings.value,
        modifiers: modifierBindings.value,
        theme: theme.value,
        editor: editor.value,
        viewer: viewer.value,
        terminal: terminal.value,
        fileTypes: fileTypes.value,
        toastDurationMs: toastDurationMs.value,
    }
    localStorage.setItem('tacom-theme', theme.value)
    localStorage.setItem('tacom-zoom', String(zoom.value))
    document.documentElement.style.zoom = String(zoom.value)
    await saveSettings(state)
    emit('close', state)
}
</script>

<template>
    <ModalDialog title="Settings" :wide="true">
        <template #default>
            <div class="settings-layout">
                <nav class="sidebar">
                    <button
                        v-for="tab in tabs"
                        :key="tab.id"
                        class="sidebar-item"
                        :class="{active: activeTab === tab.id}"
                        @click="activeTab = tab.id"
                    >
                        <span class="sidebar-icon">{{ tab.icon }}</span>
                        <span class="sidebar-label">{{ tab.label }}</span>
                    </button>
                </nav>
                <div class="tab-content">
                    <div class="tab-body">
                        <SettingsAppearance
                            v-if="activeTab === 'appearance'"
                            :theme="theme"
                            :zoom="zoom"
                            @update:theme="theme = $event"
                            @update:zoom="zoom = $event"
                        />
                        <SettingsKeyBindings
                            v-if="activeTab === 'keybindings'"
                            :action-bindings="actionBindings"
                            :modifiers="modifierBindings"
                            @update:action-bindings="actionBindings = $event"
                            @update:modifiers="modifierBindings = $event"
                        />
                        <SettingsFileTypes
                            v-if="activeTab === 'filetypes'"
                            :file-types="fileTypes"
                            :platform="platform"
                            @update:file-types="fileTypes = $event"
                        />
                        <SettingsSystem
                            v-if="activeTab === 'system'"
                            :show-hidden="showHidden"
                            :follow-symlinks="followSymlinks"
                            :show-toolbar="showToolbar"
                            :viewer="viewer"
                            :editor="editor"
                            :terminal="terminal"
                            :platform="platform"
                            @update:show-hidden="showHidden = $event"
                            @update:follow-symlinks="followSymlinks = $event"
                            @update:show-toolbar="showToolbar = $event"
                            @update:viewer="viewer = $event"
                            @update:editor="editor = $event"
                            @update:terminal="terminal = $event"
                            :toast-duration-ms="toastDurationMs"
                            @update:toast-duration-ms="toastDurationMs = $event"
                        />
                    </div>
                    <div class="dialog-footer">
                        <button class="btn-save" @click="save">Save</button>
                        <button @click="cancel">Cancel</button>
                    </div>
                </div>
            </div>
        </template>
    </ModalDialog>
</template>

<style scoped>
.settings-layout {
    display: flex;
    flex: 1;
    min-height: 0;
}

.sidebar {
    width: 150px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 4px 0;
}

.sidebar-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: transparent;
    color: var(--text-primary);
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: var(--font-size);
    text-align: left;
}

.sidebar-item:hover {
    background: var(--bg-row-hover);
}

.sidebar-item.active {
    background: var(--bg-row-selected);
    color: var(--accent);
}

.sidebar-icon {
    font-size: 16px;
    width: 20px;
    text-align: center;
}

.sidebar-label {
    white-space: nowrap;
}

.tab-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.tab-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
}

.dialog-footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding: 8px 12px;
    border-top: 1px solid var(--border);
}

.dialog-footer button {
    padding: 4px 16px;
    background: var(--bg-panel);
    color: var(--text-primary);
    border: 1px solid var(--border);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--font-size-sm);
}

.dialog-footer button:hover {
    background: var(--bg-row-hover);
}

.btn-save {
    color: var(--accent) !important;
    border-color: var(--accent) !important;
}
</style>
