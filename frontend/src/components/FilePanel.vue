<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { FSEntry } from '@/types/fs'
import { useDirectoryLoader } from '@/composables/useDirectoryLoader'
import { useSorting } from '@/composables/useSorting'
import { useCursorSelection } from '@/composables/useCursorSelection'
import { useVirtualScroll } from '@/composables/useVirtualScroll'
import { useDragAndDrop } from '@/composables/useDragAndDrop'
import { useInlineRename } from '@/composables/useInlineRename'
import { useContextMenu } from '@/composables/useContextMenu'
import ContextMenu from '@/components/ContextMenu.vue'
import FileIcon from '@/components/FileIcon.vue'
import { formatSize, formatDate } from '@/utils/format'
import { joinPath } from '@/utils/path'

const props = defineProps<{
  panelId: string
  initialPath?: string
  initialSortKey?: 'name' | 'size' | 'modified'
  initialSortDir?: 'asc' | 'desc'
  initialCursorIndex?: number
  initialSelectedNames?: string[]
  isActive?: boolean
  showHidden?: boolean
  interceptNavigation?: boolean
}>()

const emit = defineEmits<{
  navigate: [path: string]
  'before-navigate': [path: string]
  'sort-change': [sort: {key: 'name' | 'size' | 'modified'; dir: 'asc' | 'desc'}]
  drop: [op: 'copy' | 'move', sources: string[], destination: string]
  extract: [archivePath: string, shiftKey: boolean]
  pack: [sourcePaths: string[], shiftKey: boolean]
}>()

const panelContentRef = ref<HTMLElement | null>(null)

const { currentPath, entries, error, loadDirectory: rawLoad } = useDirectoryLoader()

const visibleEntries = computed(() =>
  props.showHidden ? entries.value : entries.value.filter(e => !e.hidden)
)

const { sortKey, sortDir, setSort: rawSetSort, sortedEntries } = useSorting(visibleEntries, props.initialSortKey, props.initialSortDir)

const ROW_HEIGHT = 19
const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight, scrollToIndex } =
  useVirtualScroll(panelContentRef, computed(() => sortedEntries.value.length), ROW_HEIGHT)

const {
  cursorIndex, selectedNames, selectedEntries, keyboardActive, contextMenuSuppressed,
  moveCursorUp, moveCursorDown, setCursor,
  rightMouseDown, rightMouseEnter, rightMouseUp,
  toggleCursorSelection, resetCursorSelection, setKeyboardActive,
} = useCursorSelection(sortedEntries, scrollToIndex)

const cursorEntry = computed(() => {
  if (cursorIndex.value === 0) return null
  return sortedEntries.value[cursorIndex.value - 1] ?? null
})

const {
  dropTargetPanelId, dropTargetEntry,
  onMouseDown, onDragStart, onDragOver, onDragOverPanel, onDragLeaveEntry, onDragLeavePanel, onDrop,
} = useDragAndDrop(props.panelId, currentPath, selectedEntries, cursorEntry)

const {
  renamingEntry, renameValue,
  startRename, commitRename, cancelRename,
} = useInlineRename(
  () => currentPath.value,
  (restoreCursorName?: string) => {
    if (restoreCursorName) {
      loadDirectory(currentPath.value, { cursorName: restoreCursorName })
    } else {
      loadDirectory(currentPath.value)
    }
  },
)

const {
  menuState, onRightMouseDown, onMouseMove, onRightMouseUp, closeMenu,
} = useContextMenu(contextMenuSuppressed)

function handleContextMenuSelect(action: string, event: MouseEvent) {
  if (action === 'rename' && menuState.value.entry) {
    startRename(menuState.value.entry)
  } else if (action === 'extract' && menuState.value.entry) {
    const entry = menuState.value.entry
    const fullPath = joinPath(currentPath.value, entry.name)
    emit('extract', fullPath, event.shiftKey)
  } else if (action === 'pack') {
    const sources: string[] = []
    if (selectedNames.value.size > 0) {
      for (const name of selectedNames.value) {
        sources.push(joinPath(currentPath.value, name))
      }
    } else if (menuState.value.entry) {
      sources.push(joinPath(currentPath.value, menuState.value.entry.name))
    }
    if (sources.length > 0) {
      emit('pack', sources, event.shiftKey)
    }
  }
  closeMenu()
}

function onRowRightMouseDown(event: MouseEvent, entry: FSEntry) {
  const wasSelected = selectedNames.value.has(entry.name)
  rightMouseDown(entry)
  onRightMouseDown(event, entry, () => {
    if (wasSelected) {
      selectedNames.value.add(entry.name)
    } else {
      selectedNames.value.delete(entry.name)
    }
  })
}

function onPanelRightMouseUp() {
  rightMouseUp()
  onRightMouseUp()
}

function startRenameCurrent() {
  if (cursorIndex.value === 0) return
  if (currentPath.value.includes('::')) return
  const entry = sortedEntries.value[cursorIndex.value - 1]
  if (!entry || entry.name === '..') return
  startRename(entry)
}

function focusRenameInput(vnode: any) {
  const el = vnode.el as HTMLInputElement
  el.focus()
  const name = el.value
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex > 0) {
    el.setSelectionRange(0, dotIndex)
  } else {
    el.select()
  }
}

const visibleSlice = computed(() =>
  sortedEntries.value.slice(startIndex.value, endIndex.value)
    .map((entry, i) => ({ entry, globalIndex: startIndex.value + i }))
)

async function loadDirectory(path: string, restoreState?: {cursorIndex?: number; selectedNames?: string[]; cursorName?: string}) {
  const ok = await rawLoad(path)
  if (ok) {
    if (restoreState) {
      cursorIndex.value = restoreState.cursorIndex ?? 0
      selectedNames.value = new Set(restoreState.selectedNames ?? [])
    } else {
      resetCursorSelection()
    }
    if (restoreState?.cursorName) {
      const idx = sortedEntries.value.findIndex(e => e.name === restoreState.cursorName)
      if (idx >= 0) {
        cursorIndex.value = idx + 1
        scrollToIndex(cursorIndex.value)
      }
    }
    emit('navigate', currentPath.value)
  }
}

function setSort(key: 'name' | 'size' | 'modified') {
  rawSetSort(key)
  emit('sort-change', { key: sortKey.value, dir: sortDir.value })
}

function navigate(entry: FSEntry) {
  if (entry.type === 'directory') {
    const target = joinPath(currentPath.value, entry.name)
    if (props.interceptNavigation) {
      emit('before-navigate', target)
      return
    }
    loadDirectory(target)
  } else if (entry.isArchive) {
    const archivePath = joinPath(currentPath.value, entry.name)
    const target = archivePath + '::/'
    if (props.interceptNavigation) {
      emit('before-navigate', target)
      return
    }
    loadDirectory(target)
  }
}

async function goUp() {
  const cur = currentPath.value
  const lastSepIdx = cur.lastIndexOf('::')

  if (lastSepIdx === -1) {
    // Normal filesystem navigation
    const dirName = cur.split('/').pop() || ''
    const parent = cur.replace(/\/[^/]+$/, '') || '/'
    if (props.interceptNavigation) {
      emit('before-navigate', parent)
      return
    }
    await loadDirectory(parent)
    if (dirName) {
      const idx = sortedEntries.value.findIndex(e => e.name === dirName)
      if (idx >= 0) cursorIndex.value = idx + 1
    }
    return
  }

  const base = cur.slice(0, lastSepIdx)
  const innerPath = cur.slice(lastSepIdx + 2).replace(/^\/+|\/+$/g, '')

  if (innerPath) {
    // Inside archive subdirectory — go up within this archive level
    const parts = innerPath.split('/')
    const dirName = parts.pop() || ''
    const parentInner = parts.join('/')
    const target = base + '::/' + parentInner
    if (props.interceptNavigation) {
      emit('before-navigate', target)
      return
    }
    await loadDirectory(target)
    if (dirName) {
      const idx = sortedEntries.value.findIndex(e => e.name === dirName)
      if (idx >= 0) cursorIndex.value = idx + 1
    }
  } else {
    // At archive root — go to parent (filesystem dir or outer archive)
    const archiveName = base.split('/').pop() || ''
    const parent = base.replace(/\/[^/]+$/, '') || '/'
    if (props.interceptNavigation) {
      emit('before-navigate', parent)
      return
    }
    await loadDirectory(parent)
    if (archiveName) {
      const idx = sortedEntries.value.findIndex(e => e.name === archiveName)
      if (idx >= 0) cursorIndex.value = idx + 1
    }
  }
}

function enterCursor() {
  if (cursorIndex.value === 0) {
    goUp()
    return
  }
  const entry = sortedEntries.value[cursorIndex.value - 1]
  if (entry?.type === 'directory' || entry?.isArchive) {
    navigate(entry)
  }
}

function handleDrop(e: DragEvent, entry: FSEntry | 'parent' | null) {
  const result = onDrop(e, entry)
  if (result) emit('drop', result.op, result.sources, result.destination)
}

const selectedNamesArray = computed(() => [...selectedNames.value])

function copyPath() {
  navigator.clipboard.writeText(currentPath.value)
}

defineExpose({ currentPath, cursorIndex, cursorEntry, selectedNamesArray, selectedEntries, loadDirectory, moveCursorUp, moveCursorDown, enterCursor, goUp, toggleCursorSelection, setKeyboardActive, startRename: startRenameCurrent })

function onDocumentMouseUp(e: MouseEvent) {
  if (e.button === 2) onPanelRightMouseUp()
}

onMounted(() => {
  const restoreState = (props.initialCursorIndex || props.initialSelectedNames)
    ? {cursorIndex: props.initialCursorIndex, selectedNames: props.initialSelectedNames}
    : undefined
  loadDirectory(props.initialPath ?? '/', restoreState)
  document.addEventListener('mouseup', onDocumentMouseUp)
})

onBeforeUnmount(() => {
  document.removeEventListener('mouseup', onDocumentMouseUp)
})
</script>

<template>
  <div
    class="panel"
    :class="{ 'keyboard-active': keyboardActive, active: isActive, 'drop-zone-active': dropTargetPanelId === panelId && dropTargetEntry === null }"
    @mousemove="keyboardActive = false; onMouseMove($event)"
    @contextmenu.prevent
    @dragover="onDragOverPanel"
    @dragleave="onDragLeavePanel"
    @drop="handleDrop($event, null)"
  >
    <slot name="before-header" />
    <div class="panel-header">
      <span class="path">{{ currentPath }}</span>
      <button class="copy-path-btn" title="Copy path" @click.stop="copyPath">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
    </div>
    <div class="panel-content" ref="panelContentRef">
      <table class="file-table">
        <thead>
          <tr>
            <th class="col-name sortable" @click="setSort('name')">
              Name <span class="sort-indicator">{{ sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}</span>
            </th>
            <th class="col-size sortable" @click="setSort('size')">
              Size <span class="sort-indicator">{{ sortKey === 'size' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}</span>
            </th>
            <th class="col-date sortable" @click="setSort('modified')">
              Modified <span class="sort-indicator">{{ sortKey === 'modified' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            class="entry entry-up"
            :class="{ cursor: cursorIndex === 0, 'drop-target': dropTargetPanelId === panelId && dropTargetEntry === 'parent' }"
            @click="resetCursorSelection"
            @dblclick="goUp"
            @dragover="onDragOver($event, 'parent')"
            @dragleave="onDragLeaveEntry"
            @drop.stop="handleDrop($event, 'parent')"
          >
            <td class="col-name">[..]</td>
            <td class="col-size"></td>
            <td class="col-date"></td>
          </tr>
          <tr v-if="topSpacerHeight > 0" :style="{ height: topSpacerHeight + 'px' }"></tr>
          <tr
            v-for="{ entry, globalIndex } in visibleSlice"
            :key="entry.name"
            class="entry"
            :class="{
              'row-alt': globalIndex % 2 === 1,
              selected: selectedNames.has(entry.name),
              cursor: cursorIndex === globalIndex + 1,
              directory: entry.type === 'directory',
              archive: entry.isArchive,
              symlink: entry.type === 'symlink',
              'drop-target': dropTargetPanelId === panelId && dropTargetEntry !== null && dropTargetEntry !== 'parent' && (dropTargetEntry as any).name === entry.name,
            }"
            :draggable="true"
            @mousedown.left="onMouseDown"
            @dragstart="onDragStart($event, entry)"
            @dragover="onDragOver($event, entry)"
            @dragleave="onDragLeaveEntry"
            @drop.stop="handleDrop($event, entry)"
            @click="setCursor(globalIndex)"
            @dblclick="navigate(entry)"
            @mousedown.right.prevent="onRowRightMouseDown($event, entry)"
            @mouseenter="rightMouseEnter(entry)"
          >
            <td class="col-name">
              <span class="name-cell">
                <FileIcon :entry="entry" />
                <input v-if="renamingEntry === entry.name"
                       class="rename-input"
                       v-model="renameValue"
                       @keydown.stop
                       @keydown.enter.prevent="commitRename()"
                       @keydown.esc="cancelRename()"
                       @blur="cancelRename()"
                       @vue:mounted="focusRenameInput"
                       @click.stop
                       @dblclick.stop />
                <span v-else>{{ entry.name }}</span>
              </span>
            </td>
            <td class="col-size">{{ formatSize(entry) }}</td>
            <td class="col-date">{{ formatDate(entry.modified) }}</td>
          </tr>
          <tr v-if="bottomSpacerHeight > 0" :style="{ height: bottomSpacerHeight + 'px' }"></tr>
        </tbody>
      </table>
      <div v-if="error" class="error">{{ error }}</div>
    </div>
    <ContextMenu
      v-if="menuState.visible"
      :x="menuState.x"
      :y="menuState.y"
      :entry="menuState.entry"
      :has-multi-select="selectedNames.size > 0"
      @select="handleContextMenuSelect"
      @close="closeMenu"
    />
  </div>
</template>

<style scoped>
.panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  min-width: 0;
  min-height: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
}

.path {
  color: var(--accent);
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
}

.copy-path-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  color: var(--text-secondary);
  cursor: pointer;
  opacity: 0.5;
}

.copy-path-btn:hover {
  opacity: 1;
  background: var(--bg-row-hover);
  border-color: var(--border);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  cursor: default;
}

.file-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.file-table th {
  position: sticky;
  top: 0;
  background: var(--bg-header);
  padding: 3px 8px;
  text-align: left;
  font-weight: normal;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
  user-select: none;
}

.sortable {
  cursor: pointer;
}

.sortable:hover {
  color: var(--text-primary);
}

.sort-indicator {
  color: var(--accent);
}

.col-name { width: 60%; }
.col-size { width: 20%; text-align: right; }
.col-date { width: 20%; text-align: right; }

.name-cell {
  display: flex;
  align-items: center;
  gap: 3px;
  overflow: hidden;
}

.name-cell > span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry {
  height: 19px;
}

.entry td {
  padding: 2px 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry.row-alt {
  background: var(--bg-row-alt);
}

.entry:hover {
  background: var(--bg-row-hover);
}

.entry.directory .col-name {
  color: var(--text-dir);
}

.entry.symlink .col-name {
  color: var(--text-symlink);
}

.entry.archive .col-name {
  color: var(--text-archive);
}

.entry.selected {
  color: var(--text-selected);
  font-weight: bold;
}

.entry.selected .col-name,
.entry.selected .col-size,
.entry.selected .col-date {
  color: var(--text-selected);
}

.entry-up {
  color: var(--text-secondary);
}

.panel.active .entry.cursor {
  outline: var(--cursor-outline-width) var(--cursor-outline-style) var(--cursor-outline-color);
  outline-offset: -1px;
}

.panel.keyboard-active .entry:hover:not(.selected):not(.cursor) {
  background: transparent;
}

.col-size, .col-date {
  text-align: right;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.drop-target {
  background: var(--bg-row-hover) !important;
  outline: 1px dashed var(--accent);
  outline-offset: -1px;
}

.panel.drop-zone-active {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
}

.error {
  padding: 8px;
  color: var(--text-error);
}

.rename-input {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  font: inherit;
  padding: 0;
  margin: 0;
  outline: none;
  height: 100%;
}
</style>
