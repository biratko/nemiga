<script setup lang="ts">
import {ref, onMounted, onBeforeUnmount, watch, nextTick} from 'vue'
import type {TabState} from '@/types/tabs'
import type {TabMode} from '@/types/tabs'
import TabContextMenu from './TabContextMenu.vue'
import {useTabDragReorder} from '@/composables/useTabDragReorder'
import {getUiZoom} from '@/utils/zoom'

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

const scrollContainer = ref<HTMLElement | null>(null)
const showLeftArrow = ref(false)
const showRightArrow = ref(false)

function isFtpTab(tab: TabState): boolean {
    return tab.path.startsWith('ftp://')
}

function extractFtpHost(path: string): string | null {
    if (!path.startsWith('ftp://')) return null
    const rest = path.slice('ftp://'.length)
    const slashIndex = rest.indexOf('/')
    const authority = slashIndex === -1 ? rest : rest.slice(0, slashIndex)
    const atIndex = authority.indexOf('@')
    return atIndex === -1 ? null : authority.slice(atIndex + 1)
}

function tabLabel(tab: TabState): string {
    if (tab.path === '/') return '/'
    const lastSegment = tab.path.split('/').pop() || ''
    if (isFtpTab(tab) && !lastSegment) {
        return extractFtpHost(tab.path) ?? tab.path
    }
    return lastSegment || tab.path
}

function updateArrows() {
    const el = scrollContainer.value
    if (!el) return
    showLeftArrow.value = el.scrollLeft > 0
    showRightArrow.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

function scrollLeft() {
    scrollContainer.value?.scrollBy({left: -120, behavior: 'smooth'})
}

function scrollRight() {
    scrollContainer.value?.scrollBy({left: 120, behavior: 'smooth'})
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
    const el = scrollContainer.value
    if (!el) return
    el.addEventListener('scroll', updateArrows)
    resizeObserver = new ResizeObserver(updateArrows)
    resizeObserver.observe(el)
    updateArrows()
})

onBeforeUnmount(() => {
    scrollContainer.value?.removeEventListener('scroll', updateArrows)
    resizeObserver?.disconnect()
})

watch(() => props.tabs.length, () => nextTick(updateArrows))

function onContextMenu(e: MouseEvent, index: number) {
    e.preventDefault()
    const zoom = getUiZoom()
    ctxMenu.value = {x: e.clientX / zoom, y: e.clientY / zoom, tabIndex: index}
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
    <div class="tab-bar-wrapper">
        <button v-if="showLeftArrow" class="tab-scroll-btn left" @click="scrollLeft">&#9664;</button>
        <div class="tab-bar" ref="scrollContainer">
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
                <span v-else-if="isFtpTab(tab)" class="tab-ftp-badge">FTP:</span>
                <span class="tab-label">{{ tabLabel(tab) }}</span>
            </div>
        </div>
        <button v-if="showRightArrow" class="tab-scroll-btn right" @click="scrollRight">&#9654;</button>
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
.tab-bar-wrapper {
    display: flex;
    align-items: end;
    background: var(--bg-header);
    min-height: 26px;
    position: relative;
}

.tab-bar {
    display: flex;
    align-items: end;
    overflow: hidden;
    flex: 1;
    min-width: 0;
}

.tab-bar::after {
    content: '';
    flex: 1 0 0;
    align-self: stretch;
    border-bottom: 1px solid var(--border);
}

.tab-scroll-btn {
    flex-shrink: 0;
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    padding: 0;
    background: var(--bg-header);
    border: none;
    border-bottom: 1px solid var(--border);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 9px;
    z-index: 1;
}

.tab-scroll-btn.left {
    border-right: 1px solid var(--border);
}

.tab-scroll-btn.right {
    border-left: 1px solid var(--border);
}

.tab-scroll-btn:hover {
    background: var(--bg-row-hover);
    color: var(--text-primary);
}

.tab {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
    user-select: none;
    max-width: 160px;
    flex-shrink: 0;
    border: 1px solid transparent;
    border-bottom: 1px solid var(--border);
    border-radius: 6px 6px 0 0;
}

.tab:hover {
    background: var(--bg-row-hover);
    border-color: var(--border);
}

.tab.active {
    background: var(--bg-panel);
    color: var(--text-primary);
    border-color: var(--border);
    border-bottom-color: var(--bg-panel);
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

.tab-ftp-badge {
    font-size: 9px;
    font-weight: 600;
    color: #4caf50;
    flex-shrink: 0;
    letter-spacing: 0.03em;
}

.tab-label {
    overflow: hidden;
    text-overflow: ellipsis;
}

</style>