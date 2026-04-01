<script setup lang="ts">
import {ref, computed} from 'vue'
import {ftpDisconnect} from '@/api/ftp'
import {commitFtpArchive} from '@/api/fs'
import type {TabState, TabMode, PanelTabsState} from '@/types/tabs'
import type {PanelSort, ColumnWidths, SearchColumnWidths} from '@/types/workspace'
import type {PanelAPI} from '@/types/panel'
import type {FSEntry} from '@/types/fs'
import FilePanel from './FilePanel.vue'
import TabBar from './TabBar.vue'

const props = defineProps<{
    panelId: string
    tabsState: PanelTabsState
    isActive: boolean
    showHidden: boolean
    columnWidths: ColumnWidths
    searchColumnWidths: SearchColumnWidths
}>()

const emit = defineEmits<{
    'tabs-change': [state: PanelTabsState]
    navigate: [path: string]
    'sort-change': [sort: PanelSort]
    'column-widths-change': [widths: ColumnWidths]
    'search-column-widths-change': [widths: SearchColumnWidths]
    drop: [op: 'copy' | 'move', sources: string[], destination: string]
    extract: [archivePath: string, shiftKey: boolean]
    pack: [sourcePaths: string[], shiftKey: boolean]
    'open-ftp': []
    'open-file': [path: string]
}>()

const tabs = ref<TabState[]>([...props.tabsState.tabs])
const activeTabIndex = ref(props.tabsState.activeTabIndex)
const filePanelRef = ref<PanelAPI>()

const activeTab = computed(() => tabs.value[activeTabIndex.value])

function emitTabsChange() {
    emit('tabs-change', {tabs: tabs.value, activeTabIndex: activeTabIndex.value})
}

function snapshotCurrentTab() {
    const panel = filePanelRef.value
    if (!panel) return
    const tab = activeTab.value
    if (!tab) return
    tab.path = panel.currentPath
    tab.cursorIndex = panel.cursorIndex
    tab.selectedNames = panel.selectedNamesArray
}

function createTab(path?: string) {
    const current = activeTab.value
    const newTab: TabState = {
        id: crypto.randomUUID(),
        path: path ?? current?.path ?? '/',
        sort: current ? {...current.sort} : {key: 'name', dir: 'asc'},
        cursorIndex: 0,
        selectedNames: [],
        mode: 'normal',
    }
    snapshotCurrentTab()
    tabs.value.splice(activeTabIndex.value + 1, 0, newTab)
    activeTabIndex.value = activeTabIndex.value + 1
    emitTabsChange()
}

function extractFtpSessionId(path: string): string | null {
    if (!path.startsWith('ftp://')) return null
    const rest = path.slice('ftp://'.length)
    const slashIndex = rest.indexOf('/')
    const authority = slashIndex === -1 ? rest : rest.slice(0, slashIndex)
    const atIndex = authority.indexOf('@')
    return atIndex === -1 ? authority : authority.slice(0, atIndex)
}

function getFtpArchiveFilePart(path: string): string | null {
    if (!path.startsWith('ftp://')) return null
    const sepIdx = path.indexOf('::')
    if (sepIdx === -1) return null
    return path.slice(0, sepIdx)
}

async function closeTab(index: number) {
    if (tabs.value.length <= 1) return
    snapshotCurrentTab()
    const closingTab = tabs.value[index]
    const archivePart = getFtpArchiveFilePart(closingTab.path)
    if (archivePart) {
        await commitFtpArchive(archivePart).catch(() => {})
    }
    const sessionId = extractFtpSessionId(closingTab.path)
    if (sessionId) {
        ftpDisconnect(sessionId).catch(() => {})
    }
    tabs.value.splice(index, 1)
    if (activeTabIndex.value >= tabs.value.length) {
        activeTabIndex.value = tabs.value.length - 1
    } else if (index < activeTabIndex.value) {
        activeTabIndex.value--
    }
    emitTabsChange()
}

async function closeOtherTabs(keepIndex: number) {
    snapshotCurrentTab()
    const kept = tabs.value[keepIndex]
    for (const tab of tabs.value) {
        if (tab === kept) continue
        const archivePart = getFtpArchiveFilePart(tab.path)
        if (archivePart) {
            await commitFtpArchive(archivePart).catch(() => {})
        }
        const sid = extractFtpSessionId(tab.path)
        if (sid) ftpDisconnect(sid).catch(() => {})
    }
    tabs.value = [kept]
    activeTabIndex.value = 0
    emitTabsChange()
}

function activateTab(index: number) {
    if (index === activeTabIndex.value) return
    snapshotCurrentTab()
    const target = tabs.value[index]
    if (target.mode === 'fixed' && target.fixedPath) {
        target.path = target.fixedPath
        target.cursorIndex = 0
        target.selectedNames = []
    }
    activeTabIndex.value = index
    emitTabsChange()
}

function reorderTabs(from: number, to: number) {
    const tab = tabs.value.splice(from, 1)[0]
    tabs.value.splice(to, 0, tab)
    // Adjust active index to follow the active tab
    if (activeTabIndex.value === from) {
        activeTabIndex.value = to
    } else if (from < activeTabIndex.value && to >= activeTabIndex.value) {
        activeTabIndex.value--
    } else if (from > activeTabIndex.value && to <= activeTabIndex.value) {
        activeTabIndex.value++
    }
    emitTabsChange()
}

function setTabMode(index: number, mode: TabMode) {
    const tab = tabs.value[index]
    tab.mode = mode
    if (mode === 'fixed') {
        const panel = filePanelRef.value
        tab.fixedPath = (index === activeTabIndex.value && panel) ? panel.currentPath : tab.path
    } else {
        tab.fixedPath = undefined
    }
    emitTabsChange()
}

function onBeforeNavigate(path: string) {
    const tab = activeTab.value
    if (tab?.mode === 'locked') {
        createTab(path)
    }
}

function onNavigate(path: string) {
    const tab = activeTab.value
    if (tab) {
        tab.path = path
        tab.searchResults = undefined
    }
    emit('navigate', path)
    emitTabsChange()
}

function onSortChange(sort: PanelSort) {
    const tab = activeTab.value
    if (tab) tab.sort = sort
    emit('sort-change', sort)
    emitTabsChange()
}

function onDrop(op: 'copy' | 'move', sources: string[], destination: string) {
    emit('drop', op, sources, destination)
}

function onExtract(archivePath: string, shiftKey: boolean) {
    emit('extract', archivePath, shiftKey)
}

function onPack(sources: string[], shiftKey: boolean) {
    emit('pack', sources, shiftKey)
}

defineExpose({
    get currentPath() { return filePanelRef.value?.currentPath ?? activeTab.value?.path ?? '/' },
    get cursorIndex() { return filePanelRef.value?.cursorIndex ?? 0 },
    get cursorEntry() { return filePanelRef.value?.cursorEntry ?? null },
    get selectedNamesArray() { return filePanelRef.value?.selectedNamesArray ?? [] },
    get selectedEntries() { return filePanelRef.value?.selectedEntries ?? [] },
    loadDirectory(path: string, restoreState?: {cursorIndex?: number; selectedNames?: string[]}) { return filePanelRef.value?.loadDirectory(path, restoreState) },
    moveCursorUp() { filePanelRef.value?.moveCursorUp() },
    moveCursorDown() { filePanelRef.value?.moveCursorDown() },
    enterCursor() { filePanelRef.value?.enterCursor() },
    goUp() { filePanelRef.value?.goUp() },
    toggleCursorSelection() { filePanelRef.value?.toggleCursorSelection() },
    setKeyboardActive(val: boolean) { filePanelRef.value?.setKeyboardActive(val) },
    startRename() { filePanelRef.value?.startRename() },
    calcDirSize() { filePanelRef.value?.calcDirSize() },
    setSearchResults(results: FSEntry[], directory: string) {
        snapshotCurrentTab()
        const current = activeTab.value
        const newTab: TabState = {
            id: crypto.randomUUID(),
            path: directory,
            sort: current ? {...current.sort} : {key: 'name', dir: 'asc'},
            cursorIndex: 0,
            selectedNames: [],
            mode: 'normal',
            searchResults: results,
        }
        tabs.value.splice(activeTabIndex.value + 1, 0, newTab)
        activeTabIndex.value = activeTabIndex.value + 1
        emitTabsChange()
    },
    createTab,
    closeTab() { closeTab(activeTabIndex.value) },
})
</script>

<template>
    <div class="tab-panel">
        <FilePanel
            v-if="activeTab"
            :key="activeTab.id"
            ref="filePanelRef"
            :panel-id="panelId"
            :initial-path="activeTab.path"
            :initial-sort-key="activeTab.sort.key"
            :initial-sort-dir="activeTab.sort.dir"
            :initial-cursor-index="activeTab.cursorIndex"
            :initial-selected-names="activeTab.selectedNames"
            :is-active="isActive"
            :show-hidden="showHidden"
            :search-results="activeTab.searchResults"
            :intercept-navigation="activeTab.mode === 'locked'"
            @before-navigate="onBeforeNavigate"
            @navigate="onNavigate"
            @sort-change="onSortChange"
            :column-widths="columnWidths"
            :search-column-widths="searchColumnWidths"
            @column-widths-change="(w: any) => emit('column-widths-change', w)"
            @search-column-widths-change="(w: any) => emit('search-column-widths-change', w)"
            @drop="onDrop"
            @extract="onExtract"
            @pack="onPack"
            @open-ftp="emit('open-ftp')"
            @open-file="(path: string) => emit('open-file', path)"
        >
            <template #before-header>
                <TabBar
                    :tabs="tabs"
                    :active-tab-index="activeTabIndex"
                    @activate="activateTab"
                    @close="closeTab"
                    @close-others="closeOtherTabs"
                    @reorder="reorderTabs"
                    @set-mode="setTabMode"
                />
            </template>
        </FilePanel>
    </div>
</template>

<style scoped>
.tab-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
}
</style>
