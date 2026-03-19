<script setup lang="ts">
import {ref, inject, type Ref} from 'vue'
import type {KeyBindings} from '@/types/settings'

const props = defineProps<{
    bindings: KeyBindings
}>()

const emit = defineEmits<{
    'update:bindings': [value: KeyBindings]
}>()

// Shared with parent SettingsDialog to block Escape/Enter during capture
const parentCapturing = inject<Ref<boolean>>('capturingKey')!
const capturingKey = ref<keyof KeyBindings | null>(null)

const bindingLabels: Record<keyof KeyBindings, string> = {
    cursorUp: 'Cursor Up',
    cursorDown: 'Cursor Down',
    navigateIn: 'Navigate Into',
    navigateUp: 'Navigate Up',
    switchPanel: 'Switch Panel',
}

function formatKey(key: string): string {
    const map: Record<string, string> = {
        ArrowUp: 'Up', ArrowDown: 'Down',
        ArrowLeft: 'Left', ArrowRight: 'Right',
        ' ': 'Space',
    }
    return map[key] ?? key
}

function startCapture(field: keyof KeyBindings) {
    capturingKey.value = field
    parentCapturing.value = true
}

function handleCapture(e: KeyboardEvent) {
    if (!capturingKey.value) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
        capturingKey.value = null
        parentCapturing.value = false
        return
    }
    const updated = {...props.bindings, [capturingKey.value]: e.key}
    capturingKey.value = null
    parentCapturing.value = false
    emit('update:bindings', updated)
}
</script>

<template>
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
</style>
