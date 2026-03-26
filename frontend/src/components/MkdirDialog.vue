<script setup lang="ts">
import {ref, onMounted, onUnmounted, nextTick} from 'vue'
import {connectMkdirWs} from '@/api/ws'
import type {OperationWsHandle} from '@/api/ws'
import type {MkdirEvents} from '@/types/ws'
import {showToast} from '@/composables/useToast'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{
    basePath: string
}>()

const emit = defineEmits<{
    close: [created: boolean]
}>()

type Phase = 'input' | 'creating' | 'done' | 'error'
const phase = ref<Phase>('input')
const folderName = ref('')
const opError = ref<{code: string; message: string} | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

let wsHandle: OperationWsHandle<MkdirEvents> | null = null

function cleanup() {
    wsHandle?.close()
    wsHandle = null
}

function onKeydown(e: KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Enter') {
        if (phase.value === 'input') confirmMkdir()
        else if (phase.value === 'done') emit('close', true)
        else if (phase.value === 'error') emit('close', false)
    } else if (e.key === 'Escape') {
        if (phase.value === 'input') emit('close', false)
        else if (phase.value === 'done') emit('close', true)
        else if (phase.value === 'error') emit('close', false)
    }
}

onMounted(() => {
    document.addEventListener('keydown', onKeydown)
    nextTick(() => inputRef.value?.focus())
})

onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown)
    cleanup()
})

function confirmMkdir() {
    const name = folderName.value.trim()
    if (!name) return

    phase.value = 'creating'

    const fullPath = props.basePath.endsWith('/')
        ? props.basePath + name
        : props.basePath + '/' + name

    wsHandle = connectMkdirWs()

    wsHandle.onEvent('complete', () => {
        showToast(`Directory "${folderName.value}" created`)
        emit('close', true)
    })

    wsHandle.onEvent('error', (data) => {
        if (phase.value === 'done') return
        opError.value = data.error
        phase.value = 'error'
    })

    wsHandle.send({command: 'start', path: fullPath})
}
</script>

<template>
    <ModalDialog title="Create directory">
        <template v-if="phase === 'input'">
            <div class="field">
                <label class="field-label">Directory name:</label>
                <input
                    ref="inputRef"
                    v-model="folderName"
                    class="field-input"
                    type="text"
                    placeholder="New folder"
                />
            </div>
            <div class="dialog-footer">
                <button @click="confirmMkdir" :disabled="!folderName.trim()">Create</button>
                <button @click="emit('close', false)">Cancel</button>
            </div>
        </template>

        <template v-else-if="phase === 'creating'">
            <div class="current-file">Creating "{{ folderName }}"...</div>
            <div class="progress-bar-wrap">
                <div class="progress-bar-indeterminate"></div>
            </div>
        </template>

        <template v-else-if="phase === 'done'">
            <div class="done-msg">Directory "{{ folderName }}" created</div>
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

.field-label {
    font-size: 12px;
    color: var(--text-secondary);
}

.field-input {
    padding: 4px 8px;
    background: var(--bg-panel);
    color: var(--text-primary);
    border: 1px solid var(--border);
    font-family: inherit;
    font-size: 13px;
    outline: none;
}

.field-input:focus {
    border-color: var(--text-secondary);
}
</style>