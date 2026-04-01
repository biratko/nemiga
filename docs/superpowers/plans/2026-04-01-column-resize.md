# Column Separators & Resizable Columns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visible column separators in file panel headers and allow drag-resizing columns, persisting widths per-panel and for search mode via the Workspace API.

**Architecture:** A new `useColumnResize` composable manages column width state and mouse-drag logic. `FilePanel.vue` renders separator handles in the header and applies dynamic widths. Column widths are stored in the workspace state alongside panel tabs, flowing through `App.vue` → `TabPanel` → `FilePanel` via props, with changes emitted back up for persistence.

**Tech Stack:** Vue 3 Composition API, TypeScript, Express 5 REST API

---

### Task 1: Add ColumnWidths types to backend and frontend

**Files:**
- Modify: `backend/src/protocol/workspace-types.ts:1-28`
- Modify: `frontend/src/types/workspace.ts:1-11`

- [ ] **Step 1: Add ColumnWidths types to backend protocol**

In `backend/src/protocol/workspace-types.ts`, add after `PanelSort` interface (line 4):

```typescript
export interface ColumnWidths {
    name: number
    size: number
    date: number
}

export interface SearchColumnWidths extends ColumnWidths {
    path: number
}
```

Then extend `WorkspaceState` to include column widths (replace the existing interface at lines 23-28):

```typescript
export interface WorkspaceState {
    panels: {
        left: PanelTabsState
        right: PanelTabsState
    }
    columnWidths?: {
        left?: ColumnWidths
        right?: ColumnWidths
        search?: SearchColumnWidths
    }
}
```

- [ ] **Step 2: Add ColumnWidths types to frontend**

In `frontend/src/types/workspace.ts`, add after `PanelSort` interface (line 6):

```typescript
export interface ColumnWidths {
    name: number
    size: number
    date: number
}

export interface SearchColumnWidths extends ColumnWidths {
    path: number
}
```

Then extend `PanelState` to include column widths (replace existing interface at lines 8-11):

```typescript
export interface PanelState {
    left: PanelTabsState
    right: PanelTabsState
    columnWidths?: {
        left?: ColumnWidths
        right?: ColumnWidths
        search?: SearchColumnWidths
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/protocol/workspace-types.ts frontend/src/types/workspace.ts
git commit -m "feat: add ColumnWidths types for resizable columns"
```

---

### Task 2: Update backend workspace sanitization

**Files:**
- Modify: `backend/src/api/workspace.ts:1-67`

- [ ] **Step 1: Add column widths validation**

In `backend/src/api/workspace.ts`, add after `isValidPanel` function (after line 36):

```typescript
function isValidColumnWidths(v: unknown): v is import('../protocol/workspace-types.js').ColumnWidths {
    if (!v || typeof v !== 'object') return false
    const c = v as Record<string, unknown>
    return typeof c.name === 'number' && typeof c.size === 'number' && typeof c.date === 'number'
}

function isValidSearchColumnWidths(v: unknown): v is import('../protocol/workspace-types.js').SearchColumnWidths {
    if (!isValidColumnWidths(v)) return false
    const c = v as Record<string, unknown>
    return typeof c.path === 'number'
}
```

- [ ] **Step 2: Update sanitizeWorkspace to accept columnWidths**

Replace the `sanitizeWorkspace` function (lines 38-45):

```typescript
function sanitizeWorkspace(raw: unknown): WorkspaceState | null {
    if (!raw || typeof raw !== 'object') return null
    const w = raw as Record<string, unknown>
    if (!w.panels || typeof w.panels !== 'object') return null
    const panels = w.panels as Record<string, unknown>
    if (!isValidPanel(panels.left) || !isValidPanel(panels.right)) return null

    const result: WorkspaceState = {panels: {left: panels.left, right: panels.right}}

    if (w.columnWidths && typeof w.columnWidths === 'object') {
        const cw = w.columnWidths as Record<string, unknown>
        const columnWidths: WorkspaceState['columnWidths'] = {}
        if (isValidColumnWidths(cw.left)) columnWidths.left = cw.left
        if (isValidColumnWidths(cw.right)) columnWidths.right = cw.right
        if (isValidSearchColumnWidths(cw.search)) columnWidths.search = cw.search
        if (Object.keys(columnWidths).length > 0) result.columnWidths = columnWidths
    }

    return result
}
```

- [ ] **Step 3: Verify backend compiles**

```bash
cd backend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/workspace.ts
git commit -m "feat: extend workspace sanitization for column widths"
```

---

### Task 3: Create useColumnResize composable

**Files:**
- Create: `frontend/src/composables/useColumnResize.ts`

- [ ] **Step 1: Create the composable**

Create `frontend/src/composables/useColumnResize.ts`:

```typescript
import {ref, computed, type Ref} from 'vue'
import type {ColumnWidths, SearchColumnWidths} from '@/types/workspace'

const DEFAULT_WIDTHS: ColumnWidths = {name: 60, size: 20, date: 20}
const DEFAULT_SEARCH_WIDTHS: SearchColumnWidths = {name: 35, path: 30, size: 15, date: 20}
const MIN_COL_WIDTH = 5

type ColumnKey = keyof ColumnWidths
type SearchColumnKey = keyof SearchColumnWidths

export function useColumnResize(
    initialWidths: ColumnWidths | undefined,
    isSearchMode: Ref<boolean>,
    searchWidths: Ref<SearchColumnWidths | undefined>,
    onSave: (widths: ColumnWidths) => void,
    onSaveSearch: (widths: SearchColumnWidths) => void,
) {
    const widths = ref<ColumnWidths>({...(initialWidths ?? DEFAULT_WIDTHS)})

    const activeWidths = computed(() => {
        if (isSearchMode.value) {
            return searchWidths.value ?? {...DEFAULT_SEARCH_WIDTHS}
        }
        return widths.value
    })

    const columnOrder = computed<string[]>(() => {
        if (isSearchMode.value) return ['name', 'path', 'size', 'date']
        return ['name', 'size', 'date']
    })

    let dragging = false
    let dragLeftCol = ''
    let dragRightCol = ''
    let startX = 0
    let startLeftWidth = 0
    let startRightWidth = 0
    let tableWidth = 0

    function onSeparatorMouseDown(e: MouseEvent, leftCol: string, rightCol: string, tableEl: HTMLElement) {
        e.preventDefault()
        dragging = true
        dragLeftCol = leftCol
        dragRightCol = rightCol
        startX = e.clientX
        tableWidth = tableEl.offsetWidth

        const w = activeWidths.value as Record<string, number>
        startLeftWidth = w[leftCol]
        startRightWidth = w[rightCol]

        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }

    function onMouseMove(e: MouseEvent) {
        if (!dragging) return
        const dx = e.clientX - startX
        const deltaPercent = (dx / tableWidth) * 100

        let newLeft = startLeftWidth + deltaPercent
        let newRight = startRightWidth - deltaPercent

        if (newLeft < MIN_COL_WIDTH) {
            newLeft = MIN_COL_WIDTH
            newRight = startLeftWidth + startRightWidth - MIN_COL_WIDTH
        }
        if (newRight < MIN_COL_WIDTH) {
            newRight = MIN_COL_WIDTH
            newLeft = startLeftWidth + startRightWidth - MIN_COL_WIDTH
        }

        if (isSearchMode.value) {
            const current = searchWidths.value ?? {...DEFAULT_SEARCH_WIDTHS}
            const updated = {...current, [dragLeftCol]: newLeft, [dragRightCol]: newRight}
            searchWidths.value = updated
        } else {
            widths.value = {...widths.value, [dragLeftCol]: newLeft, [dragRightCol]: newRight}
        }
    }

    function onMouseUp() {
        if (!dragging) return
        dragging = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''

        if (isSearchMode.value) {
            onSaveSearch(searchWidths.value ?? {...DEFAULT_SEARCH_WIDTHS})
        } else {
            onSave({...widths.value})
        }
    }

    return {
        widths,
        activeWidths,
        columnOrder,
        onSeparatorMouseDown,
    }
}

export {DEFAULT_WIDTHS, DEFAULT_SEARCH_WIDTHS}
export type {ColumnKey, SearchColumnKey}
```

- [ ] **Step 2: Verify frontend compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors (composable is created but not yet used).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/composables/useColumnResize.ts
git commit -m "feat: create useColumnResize composable"
```

---

### Task 4: Wire column widths through App.vue → TabPanel → FilePanel

**Files:**
- Modify: `frontend/src/App.vue:260-333` (workspace load/save, TabPanel props)
- Modify: `frontend/src/App.vue:468-521` (template)
- Modify: `frontend/src/components/TabPanel.vue:12-28` (props/emits)
- Modify: `frontend/src/components/TabPanel.vue:231-268` (template)

- [ ] **Step 1: Add columnWidths state and persistence in App.vue**

In `App.vue`, import the default widths at the top (after line 24):

```typescript
import type {ColumnWidths, SearchColumnWidths} from '@/types/workspace'
import {DEFAULT_WIDTHS, DEFAULT_SEARCH_WIDTHS} from '@/composables/useColumnResize'
```

After the `panelState` ref (around line 38, find `const panelState`), add:

```typescript
const columnWidths = ref<{
    left: ColumnWidths
    right: ColumnWidths
    search: SearchColumnWidths
}>({
    left: {...DEFAULT_WIDTHS},
    right: {...DEFAULT_WIDTHS},
    search: {...DEFAULT_SEARCH_WIDTHS},
})
```

- [ ] **Step 2: Load columnWidths from workspace response**

In the `loadWorkspace` function, after restoring `panelState` from `ws.panels` (after line 286, inside `if (data.ok)`), add:

```typescript
            if (ws.columnWidths) {
                if (ws.columnWidths.left) columnWidths.value.left = {...DEFAULT_WIDTHS, ...ws.columnWidths.left}
                if (ws.columnWidths.right) columnWidths.value.right = {...DEFAULT_WIDTHS, ...ws.columnWidths.right}
                if (ws.columnWidths.search) columnWidths.value.search = {...DEFAULT_SEARCH_WIDTHS, ...ws.columnWidths.search}
            }
```

- [ ] **Step 3: Save columnWidths in saveWorkspace**

In the `saveWorkspace` function, extend the JSON body (line 306) to include columnWidths. Replace:

```typescript
                workspace: {panels: panelState.value},
```

with:

```typescript
                workspace: {panels: panelState.value, columnWidths: columnWidths.value},
```

- [ ] **Step 4: Add column width change handler in App.vue**

After the `onSortChange` function (after line 333), add:

```typescript
function onColumnWidthsChange(panel: 'left' | 'right', widths: ColumnWidths) {
    columnWidths.value[panel] = widths
    saveWorkspace()
}

function onSearchColumnWidthsChange(widths: SearchColumnWidths) {
    columnWidths.value.search = widths
    saveWorkspace()
}
```

- [ ] **Step 5: Pass columnWidths and searchColumnWidths as props to TabPanel in template**

For the left TabPanel (around line 468), add props and event handlers:

```vue
                    :column-widths="columnWidths.left"
                    :search-column-widths="columnWidths.search"
                    @column-widths-change="widths => onColumnWidthsChange('left', widths)"
                    @search-column-widths-change="onSearchColumnWidthsChange"
```

For the right TabPanel (around line 507), add the same:

```vue
                    :column-widths="columnWidths.right"
                    :search-column-widths="columnWidths.search"
                    @column-widths-change="widths => onColumnWidthsChange('right', widths)"
                    @search-column-widths-change="onSearchColumnWidthsChange"
```

- [ ] **Step 6: Extend TabPanel props and emits to pass through**

In `TabPanel.vue`, add to props (after line 17, before `}>`):

```typescript
    columnWidths: import('@/types/workspace').ColumnWidths
    searchColumnWidths: import('@/types/workspace').SearchColumnWidths
```

Add to emits (after line 27, before `}>`):

```typescript
    'column-widths-change': [widths: import('@/types/workspace').ColumnWidths]
    'search-column-widths-change': [widths: import('@/types/workspace').SearchColumnWidths]
```

- [ ] **Step 7: Forward props and events from TabPanel template to FilePanel**

In the `<FilePanel>` tag inside `TabPanel.vue` template (around line 245), add:

```vue
            :column-widths="columnWidths"
            :search-column-widths="searchColumnWidths"
            @column-widths-change="(w: any) => emit('column-widths-change', w)"
            @search-column-widths-change="(w: any) => emit('search-column-widths-change', w)"
```

- [ ] **Step 8: Verify frontend compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: errors about FilePanel not accepting new props (will be fixed in Task 5).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/App.vue frontend/src/components/TabPanel.vue
git commit -m "feat: wire column widths through App → TabPanel → FilePanel"
```

---

### Task 5: Integrate useColumnResize into FilePanel

**Files:**
- Modify: `frontend/src/components/FilePanel.vue:1-44` (imports, props, emits)
- Modify: `frontend/src/components/FilePanel.vue:534-547` (thead template)
- Modify: `frontend/src/components/FilePanel.vue:766-900` (styles)

- [ ] **Step 1: Add props, emits, and composable usage in FilePanel**

In `FilePanel.vue`, add import (after line 10):

```typescript
import { useColumnResize } from '@/composables/useColumnResize'
import type { ColumnWidths, SearchColumnWidths } from '@/types/workspace'
```

Add new props to the `defineProps` (after line 31, before `}>`):

```typescript
  columnWidths?: ColumnWidths
  searchColumnWidths?: SearchColumnWidths
```

Add new emits to `defineEmits` (after line 43, before `}>`):

```typescript
  'column-widths-change': [widths: ColumnWidths]
  'search-column-widths-change': [widths: SearchColumnWidths]
```

- [ ] **Step 2: Initialize the composable**

After the `panelContentRef` ref (after line 45), add:

```typescript
const searchColumnWidthsRef = ref(props.searchColumnWidths)
const tableRef = ref<HTMLTableElement | null>(null)

const { activeWidths, columnOrder, onSeparatorMouseDown } = useColumnResize(
    props.columnWidths,
    isSearchMode,
    searchColumnWidthsRef,
    (w) => emit('column-widths-change', w),
    (w) => emit('search-column-widths-change', w),
)
```

- [ ] **Step 3: Update the thead template**

Replace the entire `<thead>` block (lines 535-548) with:

```vue
        <thead>
          <tr>
            <th class="col-name sortable" :style="{ width: activeWidths.name + '%' }" @click="setSort('name')">
              Name <span class="sort-indicator">{{ sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}</span>
              <span class="col-separator" @mousedown.stop="onSeparatorMouseDown($event, 'name', columnOrder[1], tableRef!)"></span>
            </th>
            <th v-if="isSearchMode" class="col-path" :style="{ width: (activeWidths as any).path + '%' }">
              Path
              <span class="col-separator" @mousedown.stop="onSeparatorMouseDown($event, 'path', 'size', tableRef!)"></span>
            </th>
            <th class="col-size sortable" :style="{ width: activeWidths.size + '%' }" @click="setSort('size')">
              Size <span class="sort-indicator">{{ sortKey === 'size' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}</span>
              <span class="col-separator" @mousedown.stop="onSeparatorMouseDown($event, 'size', 'date', tableRef!)"></span>
            </th>
            <th class="col-date sortable" :style="{ width: activeWidths.date + '%' }" @click="setSort('modified')">
              Modified <span class="sort-indicator">{{ sortKey === 'modified' ? (sortDir === 'asc' ? '↑' : '↓') : '' }}</span>
            </th>
          </tr>
        </thead>
```

Note: No separator on the last column (date) — there is nothing to the right to resize against.

- [ ] **Step 4: Add ref="tableRef" to the table element**

On the `<table>` tag (line 534), add the ref:

```vue
      <table ref="tableRef" class="file-table" :class="{ 'search-table': isSearchMode }">
```

- [ ] **Step 5: Update styles — remove static column widths, add separator styles**

Remove the static column width rules (lines 766-768):

```css
/* DELETE these lines: */
.col-name { width: 60%; }
.col-size { width: 20%; text-align: right; }
.col-date { width: 20%; text-align: right; }
```

And replace with:

```css
.col-size { text-align: right; }
.col-date { text-align: right; }
```

Remove the search-specific width overrides (lines 896-899):

```css
/* DELETE these lines: */
.search-table .col-name { width: 35%; }
.search-table .col-path { width: 30%; }
.search-table .col-size { width: 15%; }
.search-table .col-date { width: 20%; }
```

Add separator styles at the end of the `<style>` block:

```css
.file-table th {
    position: relative;
}

.col-separator {
    position: absolute;
    right: -2px;
    top: 25%;
    height: 50%;
    width: 5px;
    cursor: col-resize;
    z-index: 1;
}

.col-separator::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--border);
}
```

- [ ] **Step 6: Verify frontend compiles**

```bash
cd frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/FilePanel.vue
git commit -m "feat: integrate column resize with separators into FilePanel"
```

---

### Task 6: Manual verification and polish

**Files:**
- Possibly tweak: `frontend/src/components/FilePanel.vue` (style adjustments)
- Possibly tweak: `frontend/src/composables/useColumnResize.ts` (min-width tuning)

- [ ] **Step 1: Start dev servers and test**

```bash
make dev-backend &
make dev-frontend &
```

Open the app in a browser and verify:

1. Short vertical separators are visible between column headers (Name|Size, Size|Date)
2. Cursor changes to `col-resize` when hovering a separator
3. Dragging a separator resizes the two adjacent columns live
4. Column widths respect minimum (header text not clipped)
5. Releasing the mouse saves the widths (refresh page — widths should persist)
6. Left panel and right panel have independent widths
7. Search mode shows its own column widths (with Path column)
8. Search column widths persist independently

- [ ] **Step 2: Fix any issues found**

Address any visual glitches or interaction bugs found during testing.

- [ ] **Step 3: Final commit (if changes were made)**

```bash
git add -u
git commit -m "fix: polish column resize behavior and styles"
```
