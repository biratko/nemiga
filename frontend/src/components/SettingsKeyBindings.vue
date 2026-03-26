<script setup lang="ts">
import {ref, inject, type Ref} from 'vue'
import {ACTION_CATEGORIES, ACTION_DEFAULTS, MODIFIER_LABELS, MODIFIER_DEFAULTS, eventToKey} from '@/composables/useActionMap'

const props = defineProps<{
    actionBindings: Record<string, string[]>
    modifiers: Record<string, string>
}>()

const emit = defineEmits<{
    'update:actionBindings': [value: Record<string, string[]>]
    'update:modifiers': [value: Record<string, string>]
}>()

const parentCapturing = inject<Ref<boolean>>('capturingKey')!
const capturingAction = ref<string | null>(null)
const capturingIndex = ref<number>(-1) // -1 means adding new binding

function formatKey(key: string): string {
    return key
        .replace('ArrowUp', 'Up').replace('ArrowDown', 'Down')
        .replace('ArrowLeft', 'Left').replace('ArrowRight', 'Right')
        .replace(' ', 'Space')
}

function getBindings(actionId: string): string[] {
    return props.actionBindings[actionId] ?? ACTION_DEFAULTS[actionId] ?? []
}

function startCapture(actionId: string, index: number) {
    capturingAction.value = actionId
    capturingIndex.value = index
    parentCapturing.value = true
}

function handleCapture(e: KeyboardEvent) {
    if (!capturingAction.value) return
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
        capturingAction.value = null
        capturingIndex.value = -1
        parentCapturing.value = false
        return
    }

    const key = eventToKey(e)
    if (!key) return

    const actionId = capturingAction.value
    const idx = capturingIndex.value
    const current = [...getBindings(actionId)]

    if (idx === -1) {
        // Adding new binding
        if (!current.includes(key)) current.push(key)
    } else {
        // Replacing existing binding
        current[idx] = key
    }

    const updated = {...props.actionBindings, [actionId]: current}
    capturingAction.value = null
    capturingIndex.value = -1
    parentCapturing.value = false
    emit('update:actionBindings', updated)
}

function removeBinding(actionId: string, index: number) {
    const current = [...getBindings(actionId)]
    current.splice(index, 1)
    const updated = {...props.actionBindings, [actionId]: current}
    emit('update:actionBindings', updated)
}

function resetAction(actionId: string) {
    const updated = {...props.actionBindings}
    delete updated[actionId]
    emit('update:actionBindings', updated)
}

function updateModifier(id: string, value: string) {
    emit('update:modifiers', {...props.modifiers, [id]: value})
}
</script>

<template>
    <div class="action-bindings">
        <div v-for="category in ACTION_CATEGORIES" :key="category.title" class="section">
            <div class="section-title">{{ category.title }}</div>
            <div class="bindings-grid">
                <template v-for="action in category.actions" :key="action.id">
                    <div class="binding-label">{{ action.label }}</div>
                    <div class="binding-keys">
                        <template v-for="(key, idx) in getBindings(action.id)" :key="idx">
                            <span class="key-group">
                                <button
                                    class="binding-value"
                                    :class="{capturing: capturingAction === action.id && capturingIndex === idx}"
                                    @click="startCapture(action.id, idx)"
                                    @keydown="capturingAction === action.id && capturingIndex === idx && handleCapture($event)"
                                >
                                    {{ capturingAction === action.id && capturingIndex === idx ? '...' : formatKey(key) }}
                                </button>
                                <button
                                    class="remove-btn"
                                    title="Remove binding"
                                    @click="removeBinding(action.id, idx)"
                                >x</button>
                            </span>
                        </template>
                        <button
                            class="add-btn"
                            :class="{capturing: capturingAction === action.id && capturingIndex === -1}"
                            @click="startCapture(action.id, -1)"
                            @keydown="capturingAction === action.id && capturingIndex === -1 && handleCapture($event)"
                            title="Add binding"
                        >{{ capturingAction === action.id && capturingIndex === -1 ? '...' : '+' }}</button>
                        <button
                            v-if="actionBindings[action.id]"
                            class="reset-btn"
                            title="Reset to default"
                            @click="resetAction(action.id)"
                        >&#x21ba;</button>
                    </div>
                </template>
            </div>
        </div>

        <div class="section" v-if="MODIFIER_LABELS.length > 0">
            <div class="section-title">Modifiers</div>
            <div class="bindings-grid">
                <template v-for="mod in MODIFIER_LABELS" :key="mod.id">
                    <div class="binding-label">{{ mod.label }}</div>
                    <div class="binding-keys">
                        <select
                            class="modifier-select"
                            :value="modifiers[mod.id] ?? MODIFIER_DEFAULTS[mod.id]"
                            @change="updateModifier(mod.id, ($event.target as HTMLSelectElement).value)"
                        >
                            <option value="Ctrl">Ctrl</option>
                            <option value="Shift">Shift</option>
                            <option value="Alt">Alt</option>
                        </select>
                    </div>
                </template>
            </div>
        </div>
    </div>
</template>

<style scoped>
.action-bindings {
    display: flex;
    flex-direction: column;
    gap: 12px;
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

.bindings-grid {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 4px 12px;
    align-items: center;
}

.binding-label {
    font-size: var(--font-size);
    color: var(--text-primary);
}

.binding-keys {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
}

.key-group {
    display: inline-flex;
    align-items: center;
}

.binding-value {
    padding: 2px 8px;
    background: var(--bg-header);
    color: var(--text-primary);
    border: 1px solid var(--border);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--font-size-sm);
    text-align: center;
    min-width: 40px;
    border-radius: 3px 0 0 3px;
}

.binding-value:hover {
    background: var(--bg-row-hover);
}

.binding-value.capturing {
    border-color: var(--accent);
    color: var(--accent);
}

.remove-btn {
    padding: 2px 5px;
    background: var(--bg-header);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-left: none;
    cursor: pointer;
    font-family: inherit;
    font-size: var(--font-size-xs);
    border-radius: 0 3px 3px 0;
    line-height: 1;
}

.remove-btn:hover {
    color: var(--accent);
    background: var(--bg-row-hover);
}

.add-btn {
    padding: 2px 8px;
    background: var(--bg-header);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--font-size-sm);
    border-radius: 3px;
    min-width: 28px;
    text-align: center;
}

.add-btn:hover {
    color: var(--accent);
    background: var(--bg-row-hover);
}

.add-btn.capturing {
    border-color: var(--accent);
    color: var(--accent);
}

.reset-btn {
    padding: 2px 6px;
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid transparent;
    cursor: pointer;
    font-family: inherit;
    font-size: var(--font-size);
    border-radius: 3px;
}

.reset-btn:hover {
    color: var(--accent);
    border-color: var(--border);
}

.modifier-select {
    padding: 2px 8px;
    background: var(--bg-header);
    color: var(--text-primary);
    border: 1px solid var(--border);
    font-family: inherit;
    font-size: var(--font-size-sm);
    border-radius: 3px;
    cursor: pointer;
}

.modifier-select:focus {
    outline: none;
    border-color: var(--accent);
}
</style>
