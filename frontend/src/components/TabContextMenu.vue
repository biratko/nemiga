<script setup lang="ts">
import type {TabMode} from '@/types/tabs'

defineProps<{
    x: number
    y: number
    currentMode: TabMode
    canClose: boolean
}>()

const emit = defineEmits<{
    'set-mode': [mode: TabMode]
    close: []
    'close-others': []
    dismiss: []
}>()
</script>

<template>
    <div class="ctx-backdrop" @click="emit('dismiss')" @contextmenu.prevent="emit('dismiss')">
        <div class="ctx-menu" :style="{left: x + 'px', top: y + 'px'}" @click.stop>
            <div class="ctx-item" :class="{active: currentMode === 'normal'}" @click="emit('set-mode', 'normal')">
                Normal
            </div>
            <div class="ctx-item" :class="{active: currentMode === 'locked'}" @click="emit('set-mode', 'locked')">
                <svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Locked
            </div>
            <div class="ctx-item" :class="{active: currentMode === 'fixed'}" @click="emit('set-mode', 'fixed')">
                <svg class="ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v8m-4-4 4 4 4-4M5 14h14l-1 8H6z"/></svg>
                Fixed
            </div>
            <div class="ctx-sep"></div>
            <div class="ctx-item" :class="{disabled: !canClose}" @click="canClose && emit('close')">Close</div>
            <div class="ctx-item" @click="emit('close-others')">Close others</div>
        </div>
    </div>
</template>

<style scoped>
.ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
}

.ctx-menu {
    position: fixed;
    background: var(--bg-header);
    border: 1px solid var(--border);
    padding: 4px 0;
    min-width: 150px;
    z-index: 1001;
    box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.3);
}

.ctx-item {
    padding: 4px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-primary);
}

.ctx-item:hover:not(.disabled) {
    background: var(--bg-row-hover);
}

.ctx-item.active {
    color: var(--accent);
}

.ctx-item.disabled {
    opacity: 0.4;
    cursor: default;
}

.ctx-icon {
    width: 12px;
    height: 12px;
}

.ctx-sep {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
}
</style>
