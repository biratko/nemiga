<script setup lang="ts">
import {ref, onMounted, onUnmounted, type ComponentPublicInstance} from 'vue'
import TabPanel from './components/TabPanel.vue'
import CopyDialog from './components/CopyDialog.vue'
import MoveDialog from './components/MoveDialog.vue'
import DeleteDialog from './components/DeleteDialog.vue'
import MkdirDialog from './components/MkdirDialog.vue'
import ExtractDialog from './components/ExtractDialog.vue'
import PackDialog from './components/PackDialog.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import type {KeyBindings, SettingsState} from '@/types/settings'
import type {PanelAPI} from '@/types/panel'
import type {PanelSort, PanelState} from '@/types/workspace'
import type {TabState, PanelTabsState} from '@/types/tabs'
import {loadSettings} from '@/api/settings'
import {useFileOperations, type CopyOp, type MoveOp} from '@/composables/useFileOperations'
import {usePanelResize} from '@/composables/usePanelResize'
import {useTheme} from '@/composables/useTheme'
import {joinPath} from '@/utils/path'

interface TabPanelAPI extends PanelAPI {
    createTab(path?: string): void
    closeTab(): void
}

const leftPanel = ref<TabPanelAPI>()
const rightPanel = ref<TabPanelAPI>()
const activePanel = ref<'left' | 'right'>('left')
const panelsRef = ref<HTMLElement>()

const {
    splitPercent, isDragging, showInput, inputValue,
    tooltipX, tooltipY,
    onMouseDown: onSplitterMouseDown,
    onDblClick: onSplitterDblClick,
    applyInput: applySplitInput,
    cancelInput: cancelSplitInput,
    setContainer: setSplitContainer,
    setInputRef: setSplitInputRef,
} = usePanelResize()

const keyBindings = ref<KeyBindings>({
    cursorUp: 'ArrowUp',
    cursorDown: 'ArrowDown',
    navigateIn: 'ArrowRight',
    navigateUp: 'ArrowLeft',
    switchPanel: 'Tab',
})

const showSettings = ref(false)
const currentSettings = ref<SettingsState>({})


const {initTheme, applyTheme} = useTheme()
const {copyOp, moveOp, deleteOp, mkdirOp, startCopy, startMove, startDelete, startMkdir} = useFileOperations(activePanel, leftPanel, rightPanel)

const extractOp = ref<{archivePath: string; destination: string; archiveName: string; subfolder: string; skipInput: boolean} | null>(null)
const packOp = ref<{defaultName: string; sourcePaths: string[]; destination: string} | null>(null)

const ARCHIVE_SUFFIXES = ['.tar.gz', '.tar.bz2', '.tar.xz', '.tar', '.zip', '.7z', '.gz', '.bz2']

function archiveSubfolder(filename: string): string {
    const lower = filename.toLowerCase()
    for (const suffix of ARCHIVE_SUFFIXES) {
        if (lower.endsWith(suffix)) return filename.slice(0, -suffix.length)
    }
    const dot = filename.lastIndexOf('.')
    return dot > 0 ? filename.slice(0, dot) : filename
}

function startExtract(archivePath: string, shiftKey: boolean) {
    const opposite = activePanel.value === 'left' ? rightPanel.value : leftPanel.value
    const destination = opposite?.currentPath ?? '/'
    const archiveName = archivePath.split('/').pop() ?? 'archive'
    const subfolder = archiveSubfolder(archiveName)

    extractOp.value = {
        archivePath,
        destination,
        archiveName,
        subfolder,
        skipInput: shiftKey,
    }
}

function startPack(sourcePaths: string[]) {
    const opposite = activePanel.value === 'left' ? rightPanel.value : leftPanel.value
    const destination = opposite?.currentPath ?? '/'

    // Default archive name: single item = item name, multiple = parent folder name
    let defaultName: string
    if (sourcePaths.length === 1) {
        defaultName = sourcePaths[0].split('/').pop() ?? 'archive'
    } else {
        const active = activePanel.value === 'left' ? leftPanel.value : rightPanel.value
        const dir = active?.currentPath ?? '/'
        defaultName = dir.split('/').pop() || 'archive'
    }

    packOp.value = {defaultName, sourcePaths, destination}
}

function onPackClose(packed: boolean) {
    packOp.value = null
    if (packed) {
        leftPanel.value?.loadDirectory(leftPanel.value.currentPath)
        rightPanel.value?.loadDirectory(rightPanel.value.currentPath)
    }
}

function onExtractClose(extracted: boolean) {
    extractOp.value = null
    if (extracted) {
        leftPanel.value?.loadDirectory(leftPanel.value.currentPath)
        rightPanel.value?.loadDirectory(rightPanel.value.currentPath)
    }
}

function onDrop(op: 'copy' | 'move', sources: string[], destination: string) {
    if (op === 'copy') {
        copyOp.value = { sources, destination }
    } else {
        moveOp.value = { sources, destination }
    }
}

async function launchExternal(endpoint: string) {
    const panel = activePanel.value === 'left' ? leftPanel.value : rightPanel.value
    if (!panel) return

    const entry = panel.cursorEntry
    if (!entry || entry.type === 'directory') return

    const basePath: string = panel.currentPath
    const fullPath = joinPath(basePath, entry.name)

    try {
        await fetch(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({path: fullPath}),
        })
    } catch {
        // best-effort
    }
}

function openInEditor() { launchExternal('/api/fs/open') }
function openInViewer() { launchExternal('/api/fs/view') }

function onCopyClose(copied: boolean) {
    const destination = copyOp.value?.destination
    copyOp.value = null
    if (copied && destination) {
        // Refresh both panels — destination may be in either panel (drag-drop or F5)
        leftPanel.value?.loadDirectory(leftPanel.value.currentPath)
        rightPanel.value?.loadDirectory(rightPanel.value.currentPath)
    }
}

function onMoveClose(moved: boolean) {
    moveOp.value = null
    if (moved) {
        // Refresh both panels — source/destination may be in either panel (drag-drop or F6)
        leftPanel.value?.loadDirectory(leftPanel.value.currentPath)
        rightPanel.value?.loadDirectory(rightPanel.value.currentPath)
    }
}

function onMkdirClose(created: boolean) {
    const basePath = mkdirOp.value?.basePath
    mkdirOp.value = null
    if (created && basePath) {
        const source = activePanel.value === 'left' ? leftPanel.value : rightPanel.value
        source?.loadDirectory(basePath)
    }
}

function onDeleteClose(deleted: boolean) {
    const basePath = deleteOp.value?.basePath
    deleteOp.value = null
    if (deleted && basePath) {
        const source = activePanel.value === 'left' ? leftPanel.value : rightPanel.value
        source?.loadDirectory(basePath)
    }
}

function onSettingsClose(settings?: SettingsState) {
    showSettings.value = false
    if (settings) {
        currentSettings.value = settings
        if (settings.keyBindings) {
            keyBindings.value = settings.keyBindings
        }
        if (settings.theme) {
            applyTheme(settings.theme)
        }
    }
}

const DEFAULT_SORT: PanelSort = {key: 'name', dir: 'asc'}
const panelState = ref<PanelState | null>(null)

function defaultTab(path: string): TabState {
    return {id: crypto.randomUUID(), path, sort: {...DEFAULT_SORT}, cursorIndex: 0, selectedNames: [], mode: 'normal'}
}

async function loadWorkspace() {
    try {
        const res = await fetch('/api/workspace')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (data.ok) {
            const ws = data.workspace
            panelState.value = {
                left: {
                    tabs: ws.panels.left.tabs.map((t: TabState) => ({
                        ...t,
                        sort: t.sort ?? {...DEFAULT_SORT},
                        cursorIndex: t.cursorIndex ?? 0,
                        selectedNames: t.selectedNames ?? [],
                    })),
                    activeTabIndex: ws.panels.left.activeTabIndex ?? 0,
                },
                right: {
                    tabs: ws.panels.right.tabs.map((t: TabState) => ({
                        ...t,
                        sort: t.sort ?? {...DEFAULT_SORT},
                        cursorIndex: t.cursorIndex ?? 0,
                        selectedNames: t.selectedNames ?? [],
                    })),
                    activeTabIndex: ws.panels.right.activeTabIndex ?? 0,
                },
            }
        }
    } catch {
        // ignore, panels will use default path
    }
    if (!panelState.value) {
        panelState.value = {
            left: {tabs: [defaultTab('/')], activeTabIndex: 0},
            right: {tabs: [defaultTab('/')], activeTabIndex: 0},
        }
    }
}

async function saveWorkspace() {
    if (!panelState.value) return
    try {
        const res = await fetch('/api/workspace', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                workspace: {panels: panelState.value},
            }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch {
        // best-effort save
    }
}

function onTabsChange(side: 'left' | 'right', state: PanelTabsState) {
    if (!panelState.value) return
    panelState.value[side] = state
    saveWorkspace()
}

async function onNavigate(_panel: 'left' | 'right', _path: string) {
    await saveWorkspace()
}

function onSortChange(_panel: 'left' | 'right', _sort: PanelSort) {
    saveWorkspace()
}

function handleMousedown(e: MouseEvent) {
    const leftEl = (leftPanel.value as unknown as ComponentPublicInstance)?.$el
    const rightEl = (rightPanel.value as unknown as ComponentPublicInstance)?.$el
    if (leftEl?.contains(e.target as Node)) activePanel.value = 'left'
    else if (rightEl?.contains(e.target as Node)) activePanel.value = 'right'
}

function handleKeydown(e: KeyboardEvent) {
    if (showSettings.value || copyOp.value || moveOp.value || deleteOp.value || mkdirOp.value || extractOp.value || packOp.value || showInput.value) return

    const b = keyBindings.value
    const panel = activePanel.value === 'left' ? leftPanel.value : rightPanel.value

    if (e.altKey && e.code === 'KeyT') {
        e.preventDefault()
        panel?.createTab()
        return
    }
    if (e.altKey && e.code === 'KeyW') {
        e.preventDefault()
        panel?.closeTab()
        return
    }

    if (e.key === b.switchPanel) {
        e.preventDefault()
        activePanel.value = activePanel.value === 'left' ? 'right' : 'left'
        return
    }
    if (e.key === b.cursorUp) {
        e.preventDefault()
        panel?.setKeyboardActive(true)
        panel?.moveCursorUp()
        return
    }
    if (e.key === b.cursorDown) {
        e.preventDefault()
        panel?.setKeyboardActive(true)
        panel?.moveCursorDown()
        return
    }
    if (e.ctrlKey && (e.key === b.navigateIn || e.key === b.navigateUp)) {
        e.preventDefault()
        const entry = panel?.cursorEntry
        if (entry?.type === 'directory') {
            const opposite = activePanel.value === 'left' ? rightPanel.value : leftPanel.value
            const dirPath = joinPath(panel!.currentPath, entry.name)
            opposite?.loadDirectory(dirPath)
        }
        return
    }
    if (e.key === b.navigateIn || e.key === 'Enter') {
        e.preventDefault()
        panel?.enterCursor()
        return
    }
    if (e.key === b.navigateUp || e.key === 'Backspace') {
        e.preventDefault()
        panel?.goUp()
        return
    }
    if (e.key === 'Insert') {
        e.preventDefault()
        panel?.setKeyboardActive(true)
        panel?.toggleCursorSelection()
        return
    }
    if (e.key === 'F2') {
        e.preventDefault()
        if (panel?.currentPath.includes('::')) return
        panel?.startRename()
        return
    }
    if (e.key === 'F3') {
        e.preventDefault()
        openInViewer()
        return
    }
    if (e.key === 'F4') {
        e.preventDefault()
        openInEditor()
        return
    }
    if (e.key === 'F5') {
        e.preventDefault()
        startCopy()
        return
    }
    if (e.key === 'F6') {
        e.preventDefault()
        startMove()
        return
    }
    if (e.key === 'F7') {
        e.preventDefault()
        startMkdir()
        return
    }
    if (e.key === 'F8' || e.key === 'Delete') {
        e.preventDefault()
        startDelete()
        return
    }
}

onMounted(async () => {
    await loadWorkspace()
    try {
        currentSettings.value = await loadSettings()
        if (currentSettings.value.keyBindings) {
            keyBindings.value = currentSettings.value.keyBindings
        }
        initTheme(currentSettings.value.theme)
    } catch {
        initTheme()
    }
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('mousedown', handleMousedown)
    if (panelsRef.value) setSplitContainer(panelsRef.value)
})

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('mousedown', handleMousedown)
})
</script>

<template>
    <div class="app">
        <div class="top-toolbar">
            <button class="top-toolbar-btn" disabled>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Search
            </button>
            <button class="top-toolbar-btn" @click="showSettings = true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Settings
            </button>
        </div>
        <div class="panels" ref="panelsRef">
            <template v-if="panelState !== null">
                <TabPanel
                    ref="leftPanel"
                    panel-id="left"
                    :tabs-state="panelState.left"
                    :is-active="activePanel === 'left'"
                    :show-hidden="currentSettings.showHidden ?? false"
                    :style="{ flex: '0 0 ' + splitPercent + '%' }"
                    @tabs-change="state => onTabsChange('left', state)"
                    @navigate="path => onNavigate('left', path)"
                    @sort-change="sort => onSortChange('left', sort)"
                    @drop="onDrop"
                    @extract="startExtract"
                    @pack="startPack"
                />
                <div
                    class="panel-splitter"
                    :class="{ dragging: isDragging }"
                    @mousedown="onSplitterMouseDown"
                    @dblclick="onSplitterDblClick"
                >
                    <div v-if="showInput" class="splitter-input-wrap" @click.stop @mousedown.stop>
                        <input
                            :ref="(el: any) => setSplitInputRef(el as HTMLInputElement)"
                            class="splitter-input"
                            v-model="inputValue"
                            @keydown.stop
                            @keydown.enter="applySplitInput"
                            @keydown.escape="cancelSplitInput"
                            @blur="cancelSplitInput"
                        />
                    </div>
                </div>
                <div
                    v-if="isDragging"
                    class="splitter-tooltip"
                    :style="{ left: tooltipX + 12 + 'px', top: tooltipY - 10 + 'px' }"
                >{{ Math.round(splitPercent) }}%</div>
                <TabPanel
                    ref="rightPanel"
                    panel-id="right"
                    :tabs-state="panelState.right"
                    :is-active="activePanel === 'right'"
                    :show-hidden="currentSettings.showHidden ?? false"
                    @tabs-change="state => onTabsChange('right', state)"
                    @navigate="path => onNavigate('right', path)"
                    @sort-change="sort => onSortChange('right', sort)"
                    @drop="onDrop"
                    @extract="startExtract"
                    @pack="startPack"
                />
            </template>
        </div>
        <div v-if="currentSettings.showToolbar !== false" class="toolbar">
            <button class="toolbar-btn" @click="openInViewer">F3 View</button>
            <button class="toolbar-btn" @click="openInEditor">F4 Edit</button>
            <button class="toolbar-btn" @click="startCopy">F5 Copy</button>
            <button class="toolbar-btn" @click="startMove">F6 Move</button>
            <button class="toolbar-btn" @click="startMkdir">F7 Mkdir</button>
            <button class="toolbar-btn" @click="startDelete">F8 Delete</button>
        </div>
        <CopyDialog
            v-if="copyOp"
            :sources="copyOp.sources"
            :destination="copyOp.destination"
            @close="onCopyClose"
        />
        <MoveDialog
            v-if="moveOp"
            :sources="moveOp.sources"
            :destination="moveOp.destination"
            @close="onMoveClose"
        />
        <MkdirDialog
            v-if="mkdirOp"
            :base-path="mkdirOp.basePath"
            @close="onMkdirClose"
        />
        <DeleteDialog
            v-if="deleteOp"
            :names="deleteOp.names"
            :paths="deleteOp.paths"
            @close="onDeleteClose"
        />
        <ExtractDialog
            v-if="extractOp"
            :archive-path="extractOp.archivePath"
            :destination="extractOp.destination"
            :archive-name="extractOp.archiveName"
            :subfolder="extractOp.subfolder"
            :skip-input="extractOp.skipInput"
            @close="onExtractClose"
        />
        <PackDialog
            v-if="packOp"
            :default-name="packOp.defaultName"
            :source-paths="packOp.sourcePaths"
            :destination="packOp.destination"
            @close="onPackClose"
        />
        <SettingsDialog
            v-if="showSettings"
            :initial-settings="currentSettings"
            @close="onSettingsClose"
        />
    </div>
</template>

<style scoped>
.app {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.top-toolbar {
    display: flex;
    background: var(--bg-header);
    border-bottom: 1px solid var(--border);
    padding: 4px 8px;
    gap: 4px;
}

.top-toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
}

.top-toolbar-btn:hover:not(:disabled) {
    background: var(--bg-row-hover);
    color: var(--text-primary);
    border-color: var(--border);
}

.top-toolbar-btn:disabled {
    opacity: 0.5;
    cursor: default;
}

.panels {
    display: flex;
    flex: 1;
    min-height: 0;
    position: relative;
}

.panel-splitter {
    flex-shrink: 0;
    width: 4px;
    cursor: col-resize;
    background: var(--border);
    position: relative;
    z-index: 10;
}

.panel-splitter:hover,
.panel-splitter.dragging {
    background: var(--accent);
}

.splitter-tooltip {
    position: fixed;
    z-index: 1000;
    padding: 2px 6px;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 11px;
    color: var(--text-primary);
    pointer-events: none;
    white-space: nowrap;
}

.splitter-input-wrap {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1001;
}

.splitter-input {
    width: 48px;
    padding: 2px 4px;
    font-size: 11px;
    text-align: center;
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--accent);
    border-radius: 3px;
    outline: none;
}

.toolbar {
    display: flex;
    background: var(--bg-header);
    border-top: 1px solid var(--border);
    padding: 4px;
    gap: 2px;
}

.toolbar-btn {
    flex: 1;
    padding: 6px 0;
    background: var(--bg-panel);
    color: var(--text-primary);
    border: 1px solid var(--border);
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
}

.toolbar-btn:hover:not(:disabled) {
    background: var(--bg-row-hover);
}

.toolbar-btn:disabled {
    opacity: 0.5;
    cursor: default;
}
</style>
