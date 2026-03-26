<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted} from 'vue'
import {connectExtractWs} from '@/api/ws'
import type {OperationWsHandle} from '@/api/ws'
import type {ExtractEvents} from '@/types/ws'
import {showToast} from '@/composables/useToast'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{
    archivePath: string
    destination: string
    archiveName: string
    subfolder: string
    skipInput: boolean
}>()

const emit = defineEmits<{
    close: [extracted: boolean]
}>()

type Phase = 'input' | 'extracting' | 'done' | 'error'
const phase = ref<Phase>(props.skipInput ? 'extracting' : 'input')

const destPath = ref(props.destination)
const toSubfolder = ref(true)

const finalPath = computed(() =>
    toSubfolder.value ? destPath.value + '/' + props.subfolder : destPath.value
)

const currentFile = ref('')
const filesDone = ref(0)
const totalFiles = ref(0)
const opError = ref<{code: string; message: string} | null>(null)

let wsHandle: OperationWsHandle<ExtractEvents> | null = null

function cleanup() {
    wsHandle?.close()
    wsHandle = null
}

function startExtract() {
    phase.value = 'extracting'

    wsHandle = connectExtractWs()

    wsHandle.onEvent('progress', (data) => {
        currentFile.value = data.current_file
        filesDone.value = data.files_done
        totalFiles.value = data.total_files
    })

    wsHandle.onEvent('complete', (data) => {
        showToast(`Extracted ${data.files_done} file(s)`)
        emit('close', true)
    })

    wsHandle.onEvent('error', (data) => {
        if (phase.value === 'done') return
        opError.value = data.error
        phase.value = 'error'
    })

    wsHandle.send({
        command: 'start',
        archivePath: props.archivePath,
        destination: destPath.value,
        toSubfolder: toSubfolder.value,
    })
}

function cancel() {
    if (phase.value === 'extracting') {
        wsHandle?.send({command: 'cancel'})
    }
    cleanup()
    emit('close', false)
}

function onKeydown(e: KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Enter') {
        if (phase.value === 'input') startExtract()
        else if (phase.value === 'done') emit('close', true)
        else if (phase.value === 'error') emit('close', filesDone.value > 0)
    } else if (e.key === 'Escape') {
        if (phase.value === 'input' || phase.value === 'extracting') cancel()
        else if (phase.value === 'done') emit('close', true)
        else if (phase.value === 'error') emit('close', filesDone.value > 0)
    }
}

onMounted(() => {
    document.addEventListener('keydown', onKeydown)
    if (props.skipInput) startExtract()
})

onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown)
    cleanup()
})
</script>

<template>
    <ModalDialog title="Unpack">
        <template v-if="phase === 'input'">
            <div class="field">
                <label>Unpack "{{ archiveName }}" to:</label>
                <input v-model="destPath" class="path-input" type="text" />
            </div>
            <div class="field">
                <label class="checkbox-label">
                    <input type="checkbox" v-model="toSubfolder" />
                    Extract to subfolder "{{ subfolder }}/"
                </label>
            </div>
            <div class="preview">&rarr; {{ finalPath }}</div>
            <div class="dialog-footer">
                <button @click="startExtract">Extract</button>
                <button @click="cancel">Cancel</button>
            </div>
        </template>

        <template v-else-if="phase === 'extracting'">
            <div class="current-file">{{ currentFile || 'Preparing...' }}</div>
            <div class="progress-bar-wrap">
                <div
                    v-if="totalFiles > 0"
                    class="progress-bar"
                    :style="{ width: (filesDone / totalFiles * 100) + '%' }"
                ></div>
                <div v-else class="progress-bar-indeterminate"></div>
            </div>
            <div class="progress-stats">{{ filesDone }} / {{ totalFiles }} files</div>
            <div class="dialog-footer">
                <button @click="cancel">Cancel</button>
            </div>
        </template>

        <template v-else-if="phase === 'done'">
            <div class="done-msg">Extracted {{ filesDone }} file(s)</div>
            <div class="dialog-footer">
                <button @click="emit('close', true)">Close</button>
            </div>
        </template>

        <template v-else-if="phase === 'error'">
            <div class="error-msg">Error ({{ opError?.code }}): {{ opError?.message }}</div>
            <div class="dialog-footer">
                <button @click="emit('close', filesDone > 0)">Close</button>
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

.field label {
    font-size: 13px;
    color: var(--text-secondary);
}

.path-input {
    font-family: inherit;
    font-size: 13px;
    padding: 4px 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border);
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    cursor: pointer;
}

.preview {
    font-size: 12px;
    color: var(--text-secondary);
    padding: 4px 8px;
    background: var(--bg-header);
    border: 1px solid var(--border);
    word-break: break-all;
}
</style>
