<script setup lang="ts">
import {useTheme} from '@/composables/useTheme'
import {themeNames, themes} from '@/themes'

const props = defineProps<{
    theme: string
}>()

const emit = defineEmits<{
    'update:theme': [value: string]
}>()

const {applyTheme} = useTheme()

function onThemeChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value
    applyTheme(value)
    emit('update:theme', value)
}
</script>

<template>
    <div class="section">
        <div class="section-title">Theme</div>
        <div class="field-row">
            <label class="field-label">Theme</label>
            <select :value="theme" @change="onThemeChange" class="field-select">
                <option v-for="t in themeNames" :key="t" :value="t">{{ themes[t].label }}</option>
            </select>
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

.field-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.field-label {
    font-size: var(--font-size);
    color: var(--text-primary);
}

.field-select {
    padding: 3px 10px;
    background: var(--bg-header);
    color: var(--text-primary);
    border: 1px solid var(--border);
    font-family: inherit;
    font-size: var(--font-size-sm);
    cursor: pointer;
}

.field-select:hover {
    background: var(--bg-row-hover);
}
</style>
