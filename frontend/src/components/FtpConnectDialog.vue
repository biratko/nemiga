<script setup lang="ts">
import {ref, watch} from 'vue'
import {ftpConnect} from '@/api/ftp'
import ModalDialog from './ModalDialog.vue'

const emit = defineEmits<{
    close: []
    connected: [path: string]
}>()

const protocol = ref<'ftp' | 'ftps' | 'sftp'>('ftp')
const host = ref('')
const port = ref(21)
const username = ref('')
const password = ref('')
const remotePath = ref('/')
const connecting = ref(false)
const errorMsg = ref('')

watch(protocol, (val) => {
    port.value = val === 'sftp' ? 22 : 21
})

function onKeydown(e: KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Escape') {
        emit('close')
    } else if (e.key === 'Enter' && !connecting.value) {
        doConnect()
    }
}

async function doConnect() {
    if (!host.value.trim()) {
        errorMsg.value = 'Host is required'
        return
    }
    if (!username.value.trim()) {
        errorMsg.value = 'Username is required'
        return
    }
    connecting.value = true
    errorMsg.value = ''

    const result = await ftpConnect({
        protocol: protocol.value,
        host: host.value.trim(),
        port: port.value,
        username: username.value.trim(),
        password: password.value,
    })

    connecting.value = false

    if (result.ok && result.sessionId) {
        const rp = remotePath.value.trim() || '/'
        const ftpPath = `ftp://${result.sessionId}${rp.startsWith('/') ? '' : '/'}${rp}`
        emit('connected', ftpPath)
    } else {
        errorMsg.value = result.error?.message ?? 'Connection failed'
    }
}
</script>

<template>
    <ModalDialog title="FTP Connection" @keydown="onKeydown">
        <div class="ftp-form">
            <div class="form-row">
                <label>Protocol</label>
                <select v-model="protocol">
                    <option value="ftp">FTP</option>
                    <option value="ftps">FTPS</option>
                    <option value="sftp">SFTP</option>
                </select>
            </div>
            <div class="form-row">
                <label>Host</label>
                <input v-model="host" type="text" placeholder="example.com" />
            </div>
            <div class="form-row">
                <label>Port</label>
                <input v-model.number="port" type="number" min="1" max="65535" />
            </div>
            <div class="form-row">
                <label>Username</label>
                <input v-model="username" type="text" />
            </div>
            <div class="form-row">
                <label>Password</label>
                <input v-model="password" type="password" />
            </div>
            <div class="form-row">
                <label>Remote path</label>
                <input v-model="remotePath" type="text" placeholder="/" />
            </div>
            <div v-if="errorMsg" class="form-error">{{ errorMsg }}</div>
            <div class="form-actions">
                <button @click="emit('close')" :disabled="connecting">Cancel</button>
                <button @click="doConnect" :disabled="connecting" class="primary">
                    {{ connecting ? 'Connecting...' : 'Connect' }}
                </button>
            </div>
        </div>
    </ModalDialog>
</template>

<style scoped>
.ftp-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.form-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.form-row label {
    width: 90px;
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-secondary);
    text-align: right;
}

.form-row input,
.form-row select {
    flex: 1;
    padding: 3px 6px;
    font-size: 12px;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    outline: none;
    font-family: inherit;
}

.form-row input:focus,
.form-row select:focus {
    border-color: var(--accent);
}

.form-error {
    color: #e55;
    font-size: 11px;
    padding: 2px 0 0 98px;
}

.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 4px;
}

.form-actions button {
    padding: 4px 14px;
    font-size: 12px;
    background: var(--bg-header);
    color: var(--text-primary);
    border: 1px solid var(--border);
    cursor: pointer;
    font-family: inherit;
}

.form-actions button:hover {
    background: var(--bg-row-hover);
}

.form-actions button.primary {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
}

.form-actions button.primary:hover {
    opacity: 0.9;
}

.form-actions button:disabled {
    opacity: 0.5;
    cursor: default;
}
</style>
