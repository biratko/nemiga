<script setup lang="ts">
import {ref, onMounted, onUnmounted} from 'vue'
import {connectCopyWs} from '@/api/ws'
import type {OperationWsHandle} from '@/api/ws'
import type {CopyEvents} from '@/types/ws'
import {formatBytes} from '@/utils/format'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{
    sources: string[]
    destination: string
}>()

const emit = defineEmits<{
    close: [copied: boolean]
}>()

const progress = ref({
    copied_bytes: 0,
    current_file: '',
    files_done: 0,
})

interface Confirm {
    confirm_id: string
    confirm_type: string
    message: string
    source: string
    destination: string
}

const confirm = ref<Confirm | null>(null)
const done = ref(false)
const doneInfo = ref<{files_done: number; bytes_copied: number; errors: Array<{file: string; reason: string}>} | null>(
    null,
)
const opError = ref<{code: string; message: string} | null>(null)

let wsHandle: OperationWsHandle<CopyEvents> | null = null

function cleanup() {
    wsHandle?.close()
    wsHandle = null
}

function onKeydown(e: KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Enter') {
        if (confirm.value) respondConfirm('overwrite')
        else if (done.value) emit('close', true)
        else if (opError.value) emit('close', false)
    } else if (e.key === 'Escape') {
        if (confirm.value) respondConfirm('skip')
        else if (done.value) emit('close', true)
        else if (opError.value) emit('close', false)
        else cancel()
    }
}

onMounted(() => {
    document.addEventListener('keydown', onKeydown)
    wsHandle = connectCopyWs()

    wsHandle.onEvent('progress', (data) => {
        progress.value = {
            copied_bytes: data.copied_bytes,
            current_file: data.current_file,
            files_done: data.files_done,
        }
    })

    wsHandle.onEvent('confirm', (data) => {
        confirm.value = {
            confirm_id: data.confirm_id,
            confirm_type: data.confirm_type,
            message: data.message,
            source: data.source,
            destination: data.destination,
        }
    })

    wsHandle.onEvent('complete', (data) => {
        done.value = true
        doneInfo.value = {
            files_done: data.files_done,
            bytes_copied: data.bytes_copied,
            errors: data.errors,
        }
    })

    wsHandle.onEvent('error', (data) => {
        if (done.value) return
        opError.value = data.error
    })

    wsHandle.send({command: 'start', sources: props.sources, destination: props.destination})
})

onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown)
    cleanup()
})

function respondConfirm(action: string) {
    if (!confirm.value || !wsHandle) return
    wsHandle.send({command: 'confirm_response', confirm_id: confirm.value.confirm_id, action})
    confirm.value = null
}

function cancel() {
    wsHandle?.send({command: 'cancel'})
}
</script>

<template>
    <ModalDialog :title="'Copy to: ' + destination">
        <template v-if="!done && !opError">
            <div class="current-file">{{ progress.current_file || 'Preparing...' }}</div>
            <div class="progress-bar-wrap">
                <div class="progress-bar-indeterminate"></div>
            </div>
            <div class="progress-stats">
                {{ formatBytes(progress.copied_bytes) }}
                &nbsp;&middot;&nbsp;
                {{ progress.files_done }} files copied
            </div>

            <div v-if="confirm" class="confirm-box">
                <div class="confirm-msg">{{ confirm.message }}</div>
                <div class="confirm-btns">
                    <button @click="respondConfirm('overwrite')">Overwrite</button>
                    <button @click="respondConfirm('overwrite_all')">All</button>
                    <button @click="respondConfirm('skip')">Skip</button>
                    <button @click="respondConfirm('skip_all')">Skip All</button>
                    <button @click="respondConfirm('abort')">Abort</button>
                </div>
            </div>

            <div class="dialog-footer">
                <button @click="cancel">Cancel</button>
            </div>
        </template>

        <template v-else-if="done && doneInfo">
            <div class="done-msg">Done: {{ doneInfo.files_done }} files ({{ formatBytes(doneInfo.bytes_copied) }})</div>
            <div v-if="doneInfo.errors.length" class="skipped">{{ doneInfo.errors.length }} file(s) skipped</div>
            <div class="dialog-footer">
                <button @click="emit('close', true)">Close</button>
            </div>
        </template>

        <template v-else-if="opError">
            <div class="error-msg">Error ({{ opError.code }}): {{ opError.message }}</div>
            <div class="dialog-footer">
                <button @click="emit('close', false)">Close</button>
            </div>
        </template>
    </ModalDialog>
</template>

<style scoped>
.confirm-box {
    border: 1px solid var(--border);
    background: var(--bg-header);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.confirm-msg {
    font-size: 12px;
    word-break: break-all;
}

.confirm-btns {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
}

.confirm-btns button {
    padding: 3px 10px;
    background: var(--bg-panel);
    color: var(--text-primary);
    border: 1px solid var(--border);
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
}

.confirm-btns button:hover {
    background: var(--bg-row-hover);
}

.skipped {
    font-size: 12px;
    color: var(--text-secondary);
}
</style>
