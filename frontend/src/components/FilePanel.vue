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
import { useNotifyWs } from '@/composables/useNotifyWs'
import { useDirectoryWatcher } from '@/composables/useDirectoryWatcher'
import { commitFtpArchive, fetchDirSize } from '@/api/fs'
import ContextMenu from '@/components/ContextMenu.vue'
import DriveSelector from '@/components/DriveSelector.vue'
import FileIcon from '@/components/FileIcon.vue'
import FtpArchiveCommitErrorDialog from '@/components/FtpArchiveCommitErrorDialog.vue'
import { formatSize, formatBytes, formatDate } from '@/utils/format'
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
  searchResults?: Array<{name: string; path: string; size: number}>

}>()

const emit = defineEmits<{
  navigate: [path: string]
  'before-navigate': [path: string]
  'sort-change': [sort: {key: 'name' | 'size' | 'modified'; dir: 'asc' | 'desc'}]
  drop: [op: 'copy' | 'move', sources: string[], destination: string]
  extract: [archivePath: string, shiftKey: boolean]
  pack: [sourcePaths: string[], shiftKey: boolean]
  'open-ftp': []
  'open-file': [path: string]
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

// FTP archive commit-on-exit
interface CommitErrorState {
  visible: boolean
  ftpPath: string
  sessionDead: boolean
  resolve: (() => void) | null
}

const commitErrorState = ref<CommitErrorState>({visible: false, ftpPath: '', sessionDead: false, resolve: null})

function getFtpArchiveFilePart(path: string): string | null {
  if (!path.startsWith('ftp://')) return null
  const sepIdx = path.indexOf('::')
  if (sepIdx === -1) return null
  return path.slice(0, sepIdx)
}

async function maybeCommitFtpArchive(targetPath: string): Promise<void> {
  const current = getFtpArchiveFilePart(currentPath.value)
  if (!current) return
  if (current === getFtpArchiveFilePart(targetPath)) return

  const result = await commitFtpArchive(current)
  if (result.ok) return

  await new Promise<void>((resolve) => {
    commitErrorState.value = {visible: true, ftpPath: current, sessionDead: false, resolve}
  })
}

function onCommitErrorResolved() {
  const resolve = commitErrorState.value.resolve
  commitErrorState.value = {visible: false, ftpPath: '', sessionDead: false, resolve: null}
  resolve?.()
}

const {on: onNotify} = useNotifyWs()
const {watch: watchDir, unwatch: unwatchDir, onChange: onDirChange} = useDirectoryWatcher()
onNotify('ftp-archive-lost', (data: any) => {
  const ftpPath = data?.ftpPath as string | undefined
  if (!ftpPath || !currentPath.value.startsWith(ftpPath)) return
  commitErrorState.value = {visible: true, ftpPath, sessionDead: true, resolve: null}
})

function handleContextMenuSelect(action: string, event: MouseEvent) {
  if (action === 'rename' && menuState.value.entry) {
    startRename(menuState.value.entry)
  } else if (action === 'extract' && menuState.value.entry) {
    const entry = menuState.value.entry
    const fullPath = joinPath(currentPath.value, entry.name)
    emit('extract', fullPath, event.shiftKey)
  } else if (action === 'copy-path' && menuState.value.entry) {
    const fullPath = joinPath(currentPath.value, menuState.value.entry.name)
    navigator.clipboard.writeText(fullPath)
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

let watchedPath: string | null = null

async function loadDirectory(path: string, restoreState?: {cursorIndex?: number; selectedNames?: string[]; cursorName?: string}) {
  const ok = await rawLoad(path)
  if (ok) {
    dirSizes.value = new Map()
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
    // Update directory watcher
    const newPath = currentPath.value
    if (watchedPath !== newPath) {
      if (watchedPath) unwatchDir(watchedPath)
      watchDir(newPath)
      watchedPath = newPath
    }
    emit('navigate', currentPath.value)
  }
}

const offDirChange = onDirChange((changedPath) => {
  if (changedPath === currentPath.value) {
    rawLoad(currentPath.value)
  }
})

function setSort(key: 'name' | 'size' | 'modified') {
  rawSetSort(key)
  emit('sort-change', { key: sortKey.value, dir: sortDir.value })
}

async function navigate(entry: FSEntry) {
  if (entry.type === 'directory') {
    const target = joinPath(currentPath.value, entry.name)
    if (props.interceptNavigation) {
      emit('before-navigate', target)
      return
    }
    await maybeCommitFtpArchive(target)
    loadDirectory(target)
  } else if (entry.isArchive) {
    const archivePath = joinPath(currentPath.value, entry.name)
    const target = archivePath + '::/'
    if (props.interceptNavigation) {
      emit('before-navigate', target)
      return
    }
    await maybeCommitFtpArchive(target)
    loadDirectory(target)
  } else {
    emit('open-file', joinPath(currentPath.value, entry.name))
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
    await maybeCommitFtpArchive(parent)
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
  if (entry) navigate(entry)
}

// Directory size calculation
const dirSizes = ref<Map<string, number | 'loading'>>(new Map())

async function calcDirSize() {
  const entry = cursorEntry.value
  if (!entry || entry.type !== 'directory') return
  const fullPath = joinPath(currentPath.value, entry.name)
  if (dirSizes.value.has(entry.name)) return
  dirSizes.value.set(entry.name, 'loading')
  dirSizes.value = new Map(dirSizes.value) // trigger reactivity
  const size = await fetchDirSize(fullPath)
  if (size !== null) {
    dirSizes.value.set(entry.name, size)
  } else {
    dirSizes.value.delete(entry.name)
  }
  dirSizes.value = new Map(dirSizes.value)
}

function handleDrop(e: DragEvent, entry: FSEntry | 'parent' | null) {
  const result = onDrop(e, entry)
  if (result) emit('drop', result.op, result.sources, result.destination)
}

const selectedNamesArray = computed(() => [...selectedNames.value])

function copyPath() {
  navigator.clipboard.writeText(currentPath.value)
}

const isFtpPath = computed(() => currentPath.value.startsWith('ftp://'))

async function openTerminal() {
  try {
    const res = await fetch('/api/fs/terminal', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({path: currentPath.value}),
    })
    const data = await res.json()
    if (!data.ok) {
      console.warn('Failed to open terminal:', data.error?.message)
    }
  } catch {
    // best-effort
  }
}

const isWindowsPath = computed(() => /^[A-Za-z]:/.test(currentPath.value.replace(/^\//, '')))

const pathSegments = computed(() => {
  const full = currentPath.value
  if (full.startsWith('ftp://')) {
    const rest = full.slice('ftp://'.length)
    const slashIndex = rest.indexOf('/')
    const authority = slashIndex === -1 ? rest : rest.slice(0, slashIndex)
    const atIndex = authority.indexOf('@')
    const host = atIndex === -1 ? authority : authority.slice(atIndex + 1)
    const ftpPrefix = 'ftp://' + authority
    const remotePath = slashIndex === -1 ? '' : rest.slice(slashIndex)
    const remoteParts = remotePath.split('/').filter(Boolean)
    const segments = [{name: host, path: ftpPrefix + '/'}]
    for (let i = 0; i < remoteParts.length; i++) {
      segments.push({
        name: remoteParts[i],
        path: ftpPrefix + '/' + remoteParts.slice(0, i + 1).join('/'),
      })
    }
    return segments
  }
  const parts = full.split('/').filter(Boolean)
  const isWindows = parts.length > 0 && /^[A-Za-z]:$/.test(parts[0])
  const prefix = isWindows ? parts[0] + '/' : '/'
  return parts.map((name, i) => ({
    name,
    path: i === 0 && isWindows
      ? prefix
      : prefix + parts.slice(isWindows ? 1 : 0, i + 1).join('/'),
  }))
})

// Status bar stats
const statusBarStats = computed(() => {
  const all = sortedEntries.value
  const total = all.length
  const selectedCount = selectedNames.value.size

  let totalSize = 0
  let selectedSize = 0

  for (const entry of all) {
    const size = entry.type === 'directory'
      ? (typeof dirSizes.value.get(entry.name) === 'number' ? dirSizes.value.get(entry.name) as number : 0)
      : entry.size
    totalSize += size
    if (selectedNames.value.has(entry.name)) {
      selectedSize += size
    }
  }

  return { selectedCount, total, selectedSize, totalSize }
})

function navigateToSearchResult(result: {name: string; path: string; size: number}) {
    const dir = result.path === '.' ? currentPath.value : joinPath(currentPath.value, result.path)
    loadDirectory(dir)
}

defineExpose({ currentPath, cursorIndex, cursorEntry, selectedNamesArray, selectedEntries, loadDirectory, moveCursorUp, moveCursorDown, enterCursor, goUp, toggleCursorSelection, setKeyboardActive, startRename: startRenameCurrent, calcDirSize })

function onDocumentMouseUp(e: MouseEvent) {
  if (e.button === 2) onPanelRightMouseUp()
}

onMounted(() => {
  if (!props.searchResults) {
    const restoreState = (props.initialCursorIndex || props.initialSelectedNames)
      ? {cursorIndex: props.initialCursorIndex, selectedNames: props.initialSelectedNames}
      : undefined
    loadDirectory(props.initialPath ?? '/', restoreState)
  } else {
    currentPath.value = props.initialPath ?? '/'
  }
  document.addEventListener('mouseup', onDocumentMouseUp)
})

onBeforeUnmount(() => {
  document.removeEventListener('mouseup', onDocumentMouseUp)
  if (watchedPath) unwatchDir(watchedPath)
  offDirChange()
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
      <DriveSelector :currentPath="currentPath" @navigate="loadDirectory" @open-ftp="emit('open-ftp')" />
      <span class="path"><span v-if="!isWindowsPath" class="path-sep">/</span><template v-for="(seg, i) in pathSegments" :key="seg.path"><span class="path-segment" @click.stop="loadDirectory(seg.path)">{{ seg.name }}</span><span v-if="i < pathSegments.length - 1" class="path-sep">/</span></template></span>
      <button class="copy-path-btn" title="Copy path" @click.stop="copyPath">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
      <button class="open-terminal-btn" title="Open terminal" :disabled="isFtpPath" @click.stop="openTerminal">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"/>
          <line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
      </button>
    </div>
    <!-- Search results mode -->
    <div v-if="searchResults" class="panel-content">
      <table class="file-table">
        <thead>
          <tr>
            <th class="sr-col-name">Name</th>
            <th class="sr-col-path">Path</th>
            <th class="sr-col-size">Size</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(r, i) in searchResults"
            :key="i"
            class="entry"
            :class="{ 'row-alt': i % 2 === 1 }"
            @dblclick="navigateToSearchResult(r)"
          >
            <td class="sr-col-name">{{ r.name }}</td>
            <td class="sr-col-path">{{ r.path }}</td>
            <td class="sr-col-size">{{ formatBytes(r.size) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- Normal file listing mode -->
    <div v-else class="panel-content" ref="panelContentRef">
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
              hidden: entry.hidden,
              'drop-target': dropTargetPanelId === panelId && dropTargetEntry !== null && dropTargetEntry !== 'parent' && (dropTargetEntry as any).name === entry.name,
            }"
            :draggable="renamingEntry !== entry.name"
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
            <td class="col-size">{{ entry.type === 'directory' ? (dirSizes.get(entry.name) === 'loading' ? '...' : typeof dirSizes.get(entry.name) === 'number' ? formatBytes(dirSizes.get(entry.name) as number) : '&lt;DIR&gt;') : formatSize(entry) }}</td>
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
    <FtpArchiveCommitErrorDialog
      v-if="commitErrorState.visible"
      :ftp-path="commitErrorState.ftpPath"
      :session-dead="commitErrorState.sessionDead"
      @resolved="onCommitErrorResolved"
    />
    <div class="panel-statusbar">
      <template v-if="searchResults">
        <span class="status-files">{{ searchResults.length }} found</span>
      </template>
      <template v-else>
        <span class="status-files">{{ statusBarStats.selectedCount }}/{{ statusBarStats.total }}</span>
        <span class="status-size">{{ formatBytes(statusBarStats.selectedSize) }}/{{ formatBytes(statusBarStats.totalSize) }}</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.panel {
  position: relative;
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
  gap: 8px;
  padding: 1px 8px 1px 0;
  background: var(--bg-panel);
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

.path-segment {
  cursor: pointer;
}

.path-segment:hover {
  text-decoration: underline;
}

.path-sep {
  opacity: 0.5;
}

.copy-path-btn {
  margin-left: auto;
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

.open-terminal-btn {
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

.open-terminal-btn:hover:not(:disabled) {
  opacity: 1;
  background: var(--bg-row-hover);
  border-color: var(--border);
}

.open-terminal-btn:disabled {
  opacity: 0.2;
  cursor: default;
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

.entry.hidden {
  opacity: 0.5;
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

.panel-statusbar {
  display: flex;
  justify-content: space-between;
  padding: 1px 8px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  border-top: 1px solid var(--border);
  background: var(--bg-header);
  white-space: nowrap;
  user-select: none;
}

.sr-col-name { width: 35%; }
.sr-col-path { width: 50%; text-align: left; color: var(--text-secondary); }
.sr-col-size { width: 15%; text-align: right; color: var(--text-secondary); }

td.sr-col-path { color: var(--text-secondary); }
td.sr-col-size { text-align: right; color: var(--text-secondary); }
</style>
