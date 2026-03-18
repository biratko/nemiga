<script setup lang="ts">
import {ref, onMounted, onUnmounted} from 'vue'
import {connectDeleteWs} from '@/api/ws'
import type {OperationWsHandle} from '@/api/ws'
import type {DeleteEvents} from '@/types/ws'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{
    names: string[]
    paths: string[]
}>()

const emit = defineEmits<{
    close: [deleted: boolean]
}>()

const title = props.names.length === 1 ? 'Delete' : `Delete ${props.names.length} items`

type Phase = 'confirm' | 'deleting' | 'done' | 'error'
const phase = ref<Phase>('confirm')
const deletedCount = ref(0)
const currentItem = ref('')
const opError = ref<{code: string; message: string} | null>(null)

let wsHandle: OperationWsHandle<DeleteEvents> | null = null

function cleanup() {
    wsHandle?.close()
    wsHandle = null
}

function onKeydown(e: KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Enter') {
        if (phase.value === 'confirm') confirmDelete()
        else if (phase.value === 'done') emit('close', true)
        else if (phase.value === 'error') emit('close', deletedCount.value > 0)
    } else if (e.key === 'Escape') {
        if (phase.value === 'confirm' || phase.value === 'deleting') cancel()
        else if (phase.value === 'done') emit('close', true)
        else if (phase.value === 'error') emit('close', deletedCount.value > 0)
    }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown)
    cleanup()
})

function confirmDelete() {
    phase.value = 'deleting'
    wsHandle = connectDeleteWs()

    wsHandle.onEvent('progress', (data) => {
        deletedCount.value = data.deleted
        currentItem.value = data.current
    })

    wsHandle.onEvent('complete', (data) => {
        deletedCount.value = data.deleted
        phase.value = 'done'
    })

    wsHandle.onEvent('error', (data) => {
        if (phase.value === 'done') return
        opError.value = data.error
        phase.value = 'error'
    })

    wsHandle.send({command: 'start', paths: props.paths})
}

function cancel() {
    if (phase.value === 'deleting') {
        wsHandle?.send({command: 'cancel'})
    }
    cleanup()
    emit('close', false)
}
</script>

<template>
    <ModalDialog :title="title">
        <template v-if="phase === 'confirm'">
            <div class="message">
                {{ names.length === 1 ? `Delete "${names[0]}"?` : `Delete ${names.length} items?` }}
            </div>
            <div v-if="names.length > 1" class="item-list">
                <div v-for="name in names" :key="name" class="item">{{ name }}</div>
            </div>
            <div class="dialog-footer">
                <button class="btn-danger" @click="confirmDelete">Delete</button>
                <button @click="cancel">Cancel</button>
            </div>
        </template>

        <template v-else-if="phase === 'deleting'">
            <div class="current-file">{{ currentItem || 'Preparing...' }}</div>
            <div class="progress-bar-wrap">
                <div class="progress-bar-indeterminate"></div>
            </div>
            <div class="progress-stats">{{ deletedCount }} deleted</div>
            <div class="dialog-footer">
                <button @click="cancel">Cancel</button>
            </div>
        </template>

        <template v-else-if="phase === 'done'">
            <div class="done-msg">Deleted {{ deletedCount }} item(s)</div>
            <div class="dialog-footer">
                <button @click="emit('close', true)">Close</button>
            </div>
        </template>

        <template v-else-if="phase === 'error'">
            <div class="error-msg">Error ({{ opError?.code }}): {{ opError?.message }}</div>
            <div class="dialog-footer">
                <button @click="emit('close', deletedCount > 0)">Close</button>
            </div>
        </template>
    </ModalDialog>
</template>

<style scoped>
.message {
    font-size: 13px;
}

.item-list {
    max-height: 160px;
    overflow-y: auto;
    border: 1px solid var(--border);
    background: var(--bg-header);
    padding: 4px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.item {
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.btn-danger {
    color: var(--text-error) !important;
    border-color: var(--text-error) !important;
}
</style>
