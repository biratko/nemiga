<script setup lang="ts">
import {ref, onMounted, onUnmounted} from 'vue'
import {commitFtpArchive, discardFtpArchive, downloadFtpArchiveTemp} from '@/api/fs'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{
    ftpPath: string
    sessionDead?: boolean
}>()

const emit = defineEmits<{
    resolved: []
}>()

type Phase = 'idle' | 'retrying'
const phase = ref<Phase>('idle')
const errorMsg = ref('')

async function retry() {
    phase.value = 'retrying'
    errorMsg.value = ''
    const result = await commitFtpArchive(props.ftpPath)
    if (result.ok) {
        emit('resolved')
    } else {
        errorMsg.value = result.error?.message ?? 'Upload failed'
        phase.value = 'idle'
    }
}

async function discard() {
    await discardFtpArchive(props.ftpPath)
    emit('resolved')
}

function saveLocally() {
    downloadFtpArchiveTemp(props.ftpPath)
    emit('resolved')
}

function onKeydown(e: KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Escape' && phase.value === 'idle') discard()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
    <ModalDialog title="Archive upload failed">
        <template v-if="phase === 'idle'">
            <div class="message">
                <template v-if="sessionDead">
                    The FTP session expired. Changes to the archive could not be uploaded.
                </template>
                <template v-else>
                    Failed to upload the archive back to the FTP server.
                </template>
            </div>
            <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
            <div class="dialog-footer">
                <button v-if="!sessionDead" class="btn-primary" @click="retry">Retry</button>
                <button @click="saveLocally">Save locally</button>
                <button class="btn-danger" @click="discard">Discard changes</button>
            </div>
        </template>

        <template v-else>
            <div class="message">Uploading...</div>
            <div class="progress-bar-wrap">
                <div class="progress-bar-indeterminate"></div>
            </div>
        </template>
    </ModalDialog>
</template>

<style scoped>
.message {
    font-size: 13px;
    margin-bottom: 8px;
}

.btn-primary {
    font-weight: 600;
}

.btn-danger {
    color: var(--text-error) !important;
    border-color: var(--text-error) !important;
}
</style>
