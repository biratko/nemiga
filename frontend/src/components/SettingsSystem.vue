<script setup lang="ts">

const props = defineProps<{
    showHidden: boolean
    followSymlinks: boolean
    showToolbar: boolean
    viewer: string
    editor: string
    terminal: string
    platform: string
    toastDurationMs: number
}>()

const emit = defineEmits<{
    'update:showHidden': [value: boolean]
    'update:followSymlinks': [value: boolean]
    'update:showToolbar': [value: boolean]
    'update:viewer': [value: string]
    'update:editor': [value: string]
    'update:terminal': [value: string]
    'update:toastDurationMs': [value: number]
}>()
</script>

<template>
    <div class="section">
        <div class="section-title">General</div>
        <label class="checkbox-row">
            <input type="checkbox" :checked="showHidden" @change="emit('update:showHidden', ($event.target as HTMLInputElement).checked)" />
            <span>Show hidden files</span>
        </label>
        <label class="checkbox-row">
            <input type="checkbox" :checked="followSymlinks" @change="emit('update:followSymlinks', ($event.target as HTMLInputElement).checked)" />
            <span>Follow symlinks when copying</span>
        </label>
        <label class="checkbox-row">
            <input type="checkbox" :checked="showToolbar" @change="emit('update:showToolbar', ($event.target as HTMLInputElement).checked)" />
            <span>Show bottom toolbar</span>
        </label>
    </div>
    <div class="section">
        <div class="section-title">External Programs</div>
        <div class="field-row">
            <label class="field-label">Viewer</label>
            <input type="text" :value="viewer" @input="emit('update:viewer', ($event.target as HTMLInputElement).value)" class="field-input" :placeholder="platform === 'win32' ? 'notepad' : '/usr/bin/less'" />
        </div>
        <div class="field-row">
            <label class="field-label">Editor</label>
            <input type="text" :value="editor" @input="emit('update:editor', ($event.target as HTMLInputElement).value)" class="field-input" :placeholder="platform === 'win32' ? 'notepad' : '/usr/bin/subl'" />
        </div>
        <div class="field-row">
            <label class="field-label">Terminal</label>
            <input type="text" :value="terminal" @input="emit('update:terminal', ($event.target as HTMLInputElement).value)" class="field-input" :placeholder="platform === 'win32' ? 'wt' : 'wt.exe -d %P'" />
        </div>
    </div>
    <div class="section">
        <div class="section-title">Notifications</div>
        <div class="field-row">
            <label class="field-label">Toast (sec)</label>
            <input
                type="number"
                min="1"
                max="30"
                :value="toastDurationMs / 1000"
                @input="emit('update:toastDurationMs', Math.round(Number(($event.target as HTMLInputElement).value) * 1000))"
                class="field-input"
                style="width: 60px; flex: none;"
            />
        </div>
    </div>
</template>

<style scoped>
.section {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.section + .section {
    margin-top: 12px;
}

.section-title {
    font-size: var(--font-size-xs);
    font-weight: bold;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size);
    color: var(--text-primary);
    cursor: pointer;
}

.checkbox-row input[type="checkbox"] {
    accent-color: var(--accent);
}

.field-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.field-label {
    font-size: var(--font-size);
    color: var(--text-primary);
    min-width: 50px;
}

.field-input {
    flex: 1;
    padding: 3px 10px;
    background: var(--bg-header);
    color: var(--text-primary);
    border: 1px solid var(--border);
    font-family: inherit;
    font-size: var(--font-size-sm);
}

.field-input:focus {
    outline: none;
    border-color: var(--accent);
}
</style>
