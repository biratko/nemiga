# Search Feature Design

## Overview

File search with support for filename masks, content search (text/regex), configurable directory scope and recursion depth. Results stream in real-time via WebSocket and can be sent to the file panel as a virtual directory.

Hotkey: **Alt+F7**

## Scope

- Local filesystem only (for now)
- Architecture supports future FTP extension via ProviderRouter
- "Search in archives" checkbox present but disabled

## UI: SearchDialog

Single modal dialog (`SearchDialog.vue`) with two visual states in one window.

### Input State

Fields:
- **File name mask** — text input, comma-separated globs (e.g. `*.ts, *.vue`). Default: `*`
- **Search in file content** — checkbox that enables/disables the content search block:
  - Text input for search query
  - Checkbox: Case sensitive (default: off)
  - Checkbox: Regex (default: off)
- **Search in** — text input with directory path. Default: active panel's current path
- **Max depth** — numeric input. Default: `∞` (unlimited). `0` = only the specified directory
- **Search in archives** — checkbox, disabled, greyed out (future feature)

Buttons: **Cancel** (closes dialog), **Search** (starts search)

### Results State

After pressing Search:
- Input fields collapse into a single clickable summary line showing the search parameters (e.g. `*.ts, *.vue — content: "createApp" — in /home/user/project`). Clicking expands back to full form (search must be stopped first to modify and re-run).
- Progress area appears: current scanning path + found count + thin progress bar
- Results table with columns: **Name**, **Path** (relative to search root), **Size**
- Results stream in real-time as files are found

Buttons:
- **To panel** — emits results to the active file panel as a virtual directory, closes dialog
- **Stop** — cancels the running search, keeps results found so far
- **Close** — closes dialog without sending results to panel

## Backend: SearchConnectionHandler

New WebSocket handler at `/ws/operations/search`, extending `BaseConnectionHandler`.

### Protocol

**Client → Server:**

```typescript
// Start search
{
  command: 'start'
  directory: string        // absolute path to search in
  fileMask: string         // comma-separated globs: "*.ts, *.vue"
  contentSearch?: string   // text or regex pattern to search in file content
  caseSensitive: boolean
  regex: boolean
  maxDepth: number         // -1 = unlimited, 0 = only directory, 1+ = levels
}

// Cancel running search
{ command: 'cancel' }
```

**Server → Client:**

```typescript
// Batch of found files (sent periodically, not per-file)
{
  event: 'found'
  files: Array<{ name: string; path: string; size: number }>
}

// Current scanning progress
{
  event: 'progress'
  current: string   // directory currently being scanned
  found: number     // total found so far
  scanned: number   // total files/dirs checked
}

// Search complete
{
  event: 'complete'
  found: number
  scanned: number
}

// Error
{
  event: 'error'
  error: { code: string; message: string }
}
```

### Implementation Details

- Recursive directory traversal using `fs.opendir` for memory efficiency
- Glob matching for file masks (use `picomatch` or similar, already may be in deps)
- Content search: read files as text, apply string search or regex
- Batch `found` events: accumulate matches and flush every 100ms or every 20 files (whichever comes first) to avoid flooding the WebSocket
- `progress` events sent every 200ms with current directory path
- Respect `PathGuard` restrictions
- Check `this.cancelled` flag between files to support cancellation
- Resolve directory through `ProviderRouter` — currently only LocalProvider handles it, but FTP support can be added later by implementing search in `FtpProvider`

## Frontend: WebSocket Client

Add to `frontend/src/api/ws.ts`:

```typescript
export type SearchEvents = {
  found: { event: 'found'; files: Array<{ name: string; path: string; size: number }> }
  progress: { event: 'progress'; current: string; found: number; scanned: number }
  complete: { event: 'complete'; found: number; scanned: number }
  error: { event: 'error'; error: OperationError }
}

export function connectSearchWs() {
  return connectOperationWs<SearchEvents>('/ws/operations/search')
}
```

## Virtual Directory in Panel

When user clicks "To panel":
- `SearchDialog` emits `to-panel` event with the array of `SearchResultEntry[]`
- `App.vue` receives it and sets `searchResults` on the active panel
- `FilePanel` enters "search results" mode:
  - Displays entries with Name, Path, Size columns
  - Breadcrumb shows `[Search Results]`
  - Enter/double-click on a file navigates to its real directory in the panel and highlights the file
  - Any normal navigation (breadcrumb click, drive change, `..`) exits search results mode

## Integration in App.vue

- Remove `disabled` from the Search button in top toolbar
- Add `@click` handler that sets `searchOp` ref (like `copyOp`, `deleteOp`, etc.)
- Add `Alt+F7` binding in `useActionMap` → triggers search
- Mount `SearchDialog` conditionally: `v-if="searchOp"`
- Handle `@close` and `@to-panel` events

## Types

Add to `backend/src/protocol/ws-types.ts`:

```typescript
export interface WsSearchStart {
  command: 'start'
  directory: string
  fileMask: string
  contentSearch?: string
  caseSensitive: boolean
  regex: boolean
  maxDepth: number
}

export interface SearchResultEntry {
  name: string
  path: string
  size: number
}
```

Add to `frontend/src/types/`:

```typescript
export interface SearchResultEntry {
  name: string
  path: string
  size: number
}
```
