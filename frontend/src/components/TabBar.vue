<script setup lang="ts">
import {ref} from 'vue'
import type {TabState} from '@/types/tabs'
import type {TabMode} from '@/types/tabs'
import TabContextMenu from './TabContextMenu.vue'
import {useTabDragReorder} from '@/composables/useTabDragReorder'

const props = defineProps<{
    tabs: TabState[]
    activeTabIndex: number
}>()

const emit = defineEmits<{
    activate: [index: number]
    close: [index: number]
    'close-others': [index: number]
    reorder: [fromIndex: number, toIndex: number]
    'set-mode': [index: number, mode: TabMode]
}>()

const ctxMenu = ref<{x: number; y: number; tabIndex: number} | null>(null)

const {dragIndex, dropIndex, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd} =
    useTabDragReorder((from, to) => emit('reorder', from, to))

function tabLabel(tab: TabState): string {
    if (tab.path === '/') return '/'
    return tab.path.split('/').pop() || tab.path
}

function onContextMenu(e: MouseEvent, index: number) {
    e.preventDefault()
    ctxMenu.value = {x: e.clientX, y: e.clientY, tabIndex: index}
}

function onSetMode(mode: TabMode) {
    if (ctxMenu.value !== null) {
        emit('set-mode', ctxMenu.value.tabIndex, mode)
    }
    ctxMenu.value = null
}

function onCtxClose() {
    if (ctxMenu.value !== null) {
        emit('close', ctxMenu.value.tabIndex)
    }
    ctxMenu.value = null
}

function onCtxCloseOthers() {
    if (ctxMenu.value !== null) {
        emit('close-others', ctxMenu.value.tabIndex)
    }
    ctxMenu.value = null
}
</script>

<template>
    <div class="tab-bar">
        <div
            v-for="(tab, i) in tabs"
            :key="tab.id"
            class="tab"
            :class="{
                active: i === activeTabIndex,
                'drag-over': dropIndex === i && dragIndex !== i,
            }"
            draggable="true"
            @click="emit('activate', i)"
            @contextmenu="onContextMenu($event, i)"
            @dragstart="onDragStart($event, i)"
            @dragover="onDragOver($event, i)"
            @dragleave="onDragLeave"
            @drop="onDrop($event, i)"
            @dragend="onDragEnd"
        >
            <svg v-if="tab.mode === 'locked'" class="tab-mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <svg v-else-if="tab.mode === 'fixed'" class="tab-mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v8m-4-4 4 4 4-4M5 14h14l-1 8H6z"/>
            </svg>
            <span class="tab-label">{{ tabLabel(tab) }}</span>
            <span
                v-if="tabs.length > 1"
                class="tab-close"
                @click.stop="emit('close', i)"
            >&times;</span>
        </div>
    </div>
    <TabContextMenu
        v-if="ctxMenu !== null"
        :x="ctxMenu.x"
        :y="ctxMenu.y"
        :current-mode="tabs[ctxMenu.tabIndex].mode"
        :can-close="tabs.length > 1"
        @set-mode="onSetMode"
        @close="onCtxClose"
        @close-others="onCtxCloseOthers"
        @dismiss="ctxMenu = null"
    />
</template>

<style scoped>
.tab-bar {
    display: flex;
    background: var(--bg-header);
    border-bottom: 1px solid var(--border);
    overflow: hidden;
    min-height: 24px;
}

.tab {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary);
    border-right: 1px solid var(--border);
    white-space: nowrap;
    user-select: none;
    max-width: 160px;
}

.tab:hover {
    background: var(--bg-row-hover);
}

.tab.active {
    background: var(--bg-panel);
    color: var(--text-primary);
    border-bottom: 1px solid var(--bg-panel);
    margin-bottom: -1px;
}

.tab.drag-over {
    outline: 1px dashed var(--accent);
    outline-offset: -1px;
}

.tab-mode-icon {
    width: 10px;
    height: 10px;
    flex-shrink: 0;
    color: var(--accent);
}

.tab-label {
    overflow: hidden;
    text-overflow: ellipsis;
}

.tab-close {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    font-size: 14px;
    line-height: 1;
}

.tab-close:hover {
    background: var(--bg-row-hover);
    color: var(--text-primary);
}
</style>
