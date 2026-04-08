<script setup lang="ts">
import {ref, onMounted} from 'vue'
import {sshConnect, sshOpenTerminal} from '@/api/ssh'
import {
    listSshConnections,
    createSshConnection,
    updateSshConnection,
    deleteSshConnection,
    getSshConnectParams,
    type SavedSshConnectionDto,
    type SaveSshConnectionInput,
} from '@/api/ssh-connections'
import ModalDialog from './ModalDialog.vue'

const emit = defineEmits<{
    close: []
    connected: [path: string, connectionName?: string]
}>()

// Saved connections state
const savedConnections = ref<SavedSshConnectionDto[]>([])
const selectedId = ref<string | null>(null)
const listLoading = ref(false)
const listError = ref('')

// Form fields
const host = ref('')
const port = ref(22)
const username = ref('root')
const password = ref('')
const remotePath = ref('/')
const connectionName = ref('')
const savePassword = ref(false)

// Action state
const connecting = ref(false)
const saving = ref(false)
const terminalOpening = ref(false)
const errorMsg = ref('')

onMounted(async () => {
    await loadConnections()
})

async function loadConnections() {
    listLoading.value = true
    listError.value = ''
    try {
        savedConnections.value = await listSshConnections()
    } catch (err: any) {
        listError.value = err.message ?? 'Failed to load connections'
    } finally {
        listLoading.value = false
    }
}

function selectConnection(conn: SavedSshConnectionDto) {
    selectedId.value = conn.id
    connectionName.value = conn.name
    host.value = conn.host
    port.value = conn.port
    username.value = conn.username
    password.value = ''
    savePassword.value = conn.hasPassword
    remotePath.value = conn.remotePath
    errorMsg.value = ''
}

function newConnection() {
    selectedId.value = null
    connectionName.value = ''
    host.value = ''
    port.value = 22
    username.value = 'root'
    password.value = ''
    savePassword.value = false
    remotePath.value = '/'
    errorMsg.value = ''
}

function getInput(): SaveSshConnectionInput {
    return {
        name: connectionName.value.trim() || undefined,
        host: host.value.trim(),
        port: port.value,
        username: username.value.trim(),
        password: savePassword.value ? password.value : undefined,
        remotePath: remotePath.value.trim() || '/',
    }
}

async function doSave() {
    if (!host.value.trim()) {
        errorMsg.value = 'Host is required'
        return
    }
    if (!username.value.trim()) {
        errorMsg.value = 'Username is required'
        return
    }
    saving.value = true
    errorMsg.value = ''
    try {
        const input = getInput()
        if (selectedId.value) {
            const updated = await updateSshConnection(selectedId.value, input)
            const idx = savedConnections.value.findIndex(c => c.id === updated.id)
            if (idx !== -1) savedConnections.value[idx] = updated
        } else {
            const created = await createSshConnection(input)
            savedConnections.value.push(created)
            selectedId.value = created.id
        }
    } catch (err: any) {
        errorMsg.value = err.message ?? 'Failed to save'
    } finally {
        saving.value = false
    }
}

async function doDelete(id: string) {
    if (!confirm('Delete this saved connection?')) return
    try {
        await deleteSshConnection(id)
        savedConnections.value = savedConnections.value.filter(c => c.id !== id)
        if (selectedId.value === id) newConnection()
    } catch (err: any) {
        errorMsg.value = err.message ?? 'Failed to delete'
    }
}

function onKeydown(e: KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Escape') {
        emit('close')
    } else if (e.key === 'Enter' && !connecting.value && !saving.value && !terminalOpening.value) {
        doConnect()
    }
}

async function resolvePassword(): Promise<string | null> {
    let connectPassword = password.value
    if (selectedId.value && !connectPassword && savePassword.value) {
        try {
            const params = await getSshConnectParams(selectedId.value)
            connectPassword = params.password ?? ''
        } catch (err: any) {
            errorMsg.value = err.message ?? 'Failed to get connection params'
            return null
        }
    }
    return connectPassword
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

    const connectPassword = await resolvePassword()
    if (connectPassword === null) {
        connecting.value = false
        return
    }

    try {
        const result = await sshConnect({
            host: host.value.trim(),
            port: port.value,
            username: username.value.trim(),
            password: connectPassword,
        })

        if (result.ok && result.sessionId) {
            const rp = remotePath.value.trim() || '/'
            const sshPath = `ssh://${result.sessionId}@${host.value.trim()}${rp.startsWith('/') ? '' : '/'}${rp}`
            emit('connected', sshPath, connectionName.value.trim() || undefined)
        } else {
            errorMsg.value = result.error?.message ?? 'Connection failed'
        }
    } catch (err: any) {
        errorMsg.value = err.message ?? 'Connection failed'
    } finally {
        connecting.value = false
    }
}

async function doTerminal() {
    if (!host.value.trim()) {
        errorMsg.value = 'Host is required'
        return
    }
    if (!username.value.trim()) {
        errorMsg.value = 'Username is required'
        return
    }
    terminalOpening.value = true
    errorMsg.value = ''

    const connectPassword = await resolvePassword()
    if (connectPassword === null) {
        terminalOpening.value = false
        return
    }

    try {
        const result = await sshOpenTerminal({
            host: host.value.trim(),
            port: port.value,
            username: username.value.trim(),
            password: connectPassword,
        })

        if (!result.ok) {
            errorMsg.value = result.error?.message ?? 'Failed to open terminal'
        }
    } catch (err: any) {
        errorMsg.value = err.message ?? 'Failed to open terminal'
    } finally {
        terminalOpening.value = false
    }
}
</script>

<template>
    <ModalDialog title="SSH Connection" @keydown="onKeydown" wide>
        <div class="ssh-dialog-layout">
            <div class="saved-list">
                <div class="saved-list-header">
                    <span>Saved</span>
                    <button class="btn-new" @click="newConnection" title="New connection">+</button>
                </div>
                <div v-if="listLoading" class="saved-list-status">Loading...</div>
                <div v-else-if="listError" class="saved-list-status error">{{ listError }}</div>
                <div v-else-if="savedConnections.length === 0" class="saved-list-status">No saved connections</div>
                <div v-else class="saved-list-items">
                    <div
                        v-for="conn in savedConnections"
                        :key="conn.id"
                        class="saved-item"
                        :class="{active: selectedId === conn.id}"
                        @click="selectConnection(conn)"
                        @dblclick="selectConnection(conn); doConnect()"
                    >
                        <span class="saved-item-name" :title="conn.name">{{ conn.name }}</span>
                        <button class="btn-delete" @click.stop="doDelete(conn.id)" title="Delete">&times;</button>
                    </div>
                </div>
            </div>
            <div class="ssh-form">
                <div class="form-row">
                    <label>Name</label>
                    <input v-model="connectionName" type="text" placeholder="user@host:port" />
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
                    <div class="password-group">
                        <input v-model="password" type="password" />
                        <label class="checkbox-label">
                            <input v-model="savePassword" type="checkbox" />
                            Save
                        </label>
                    </div>
                </div>
                <div class="form-row">
                    <label>Remote path</label>
                    <input v-model="remotePath" type="text" placeholder="/" />
                </div>
                <div v-if="errorMsg" class="form-error">{{ errorMsg }}</div>
                <div class="form-actions">
                    <button @click="emit('close')" :disabled="connecting || saving || terminalOpening">Cancel</button>
                    <button @click="doSave" :disabled="connecting || saving || terminalOpening">
                        {{ saving ? 'Saving...' : 'Save' }}
                    </button>
                    <button @click="doTerminal" :disabled="connecting || saving || terminalOpening">
                        {{ terminalOpening ? 'Opening...' : 'Terminal' }}
                    </button>
                    <button @click="doConnect" :disabled="connecting || saving || terminalOpening" class="primary">
                        {{ connecting ? 'Connecting...' : 'Connect' }}
                    </button>
                </div>
            </div>
        </div>
    </ModalDialog>
</template>

<style scoped>
.ssh-dialog-layout {
    display: flex;
    gap: 12px;
    min-height: 280px;
    padding: 12px;
}

.saved-list {
    width: 160px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    padding-right: 12px;
}

.saved-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
}

.btn-new {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-primary);
    width: 20px;
    height: 20px;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
}

.btn-new:hover {
    background: var(--bg-row-hover);
}

.saved-list-status {
    font-size: 11px;
    color: var(--text-secondary);
    padding: 4px 0;
}

.saved-list-status.error {
    color: #e55;
}

.saved-list-items {
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow-y: auto;
    flex: 1;
}

.saved-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 4px;
    font-size: 12px;
    cursor: pointer;
    border-radius: 2px;
}

.saved-item:hover {
    background: var(--bg-row-hover);
}

.saved-item.active {
    background: var(--accent);
    color: #fff;
}

.saved-item-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.btn-delete {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 14px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
    opacity: 0;
}

.saved-item:hover .btn-delete {
    opacity: 1;
}

.saved-item.active .btn-delete {
    color: #fff;
    opacity: 0.7;
}

.saved-item.active .btn-delete:hover {
    opacity: 1;
}

.ssh-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
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

.password-group {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
}

.password-group input[type="password"] {
    flex: 1;
    padding: 3px 6px;
    font-size: 12px;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    outline: none;
    font-family: inherit;
}

.password-group input[type="password"]:focus {
    border-color: var(--accent);
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-primary);
    cursor: pointer;
    white-space: nowrap;
}

.checkbox-label input[type="checkbox"] {
    margin: 0;
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
