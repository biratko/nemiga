# Symlink Directory Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow symlinks to directories to be navigated the same way as regular directories in all panels.

**Architecture:** Add `symlink_target_type` field to `FSEntry` type. Each provider resolves symlink targets where the protocol allows. Frontend treats symlinks with `symlink_target_type === 'directory'` identically to directories for navigation purposes.

**Tech Stack:** TypeScript, Node.js fs APIs, SSH shell commands, ssh2-sftp-client

**Spec:** `docs/superpowers/specs/2026-04-06-symlink-navigation-design.md`

---

### Task 1: Add `symlink_target_type` to FSEntry types

**Files:**
- Modify: `backend/src/protocol/fs-types.ts:3-14`
- Modify: `frontend/src/types/fs.ts:1-12`

- [ ] **Step 1: Add field to backend FSEntry**

In `backend/src/protocol/fs-types.ts`, add `symlink_target_type` after `symlink_target`:

```typescript
export type FSEntry = {
    name: string
    type: 'file' | 'directory' | 'symlink'
    size: number
    modified: string
    permissions: string
    extension: string | null
    hidden: boolean
    symlink_target: string | null
    symlink_target_type: 'file' | 'directory' | null
    isArchive?: boolean
    searchPath?: string
}
```

- [ ] **Step 2: Add field to frontend FSEntry**

In `frontend/src/types/fs.ts`, add `symlink_target_type` after `symlink_target`:

```typescript
export interface FSEntry {
  name: string
  type: 'file' | 'directory' | 'symlink'
  size: number
  modified: string
  permissions: string
  extension: string | null
  hidden: boolean
  symlink_target: string | null
  symlink_target_type: 'file' | 'directory' | null
  isArchive?: boolean
  searchPath?: string
}
```

- [ ] **Step 3: Verify TypeScript catches missing field**

Run: `cd /home/alexanderb/workspace/fmanager/backend && npx tsc --noEmit 2>&1 | head -40`

Expected: Multiple errors where FSEntry objects are constructed without `symlink_target_type`. This confirms the type change propagated. We will fix these in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add backend/src/protocol/fs-types.ts frontend/src/types/fs.ts
git commit -m "feat(symlink): add symlink_target_type field to FSEntry type"
```

---

### Task 2: Resolve symlink target type in LocalProvider

**Files:**
- Modify: `backend/src/utils/fsEntry.ts:1-43`

- [ ] **Step 1: Add stat import and resolve target type**

In `backend/src/utils/fsEntry.ts`, add `stat` to the import and implement target type resolution:

```typescript
import {lstat, readlink, stat} from 'node:fs/promises'
import path from 'node:path'
import type {Dirent} from 'node:fs'
import type {FSEntry} from '../protocol/fs-types.js'

export async function toEntry(dir: string, de: Dirent): Promise<FSEntry> {
    const fullPath = path.join(dir, de.name)
    const info = await lstat(fullPath)

    let type: FSEntry['type'] = 'file'
    if (de.isDirectory()) type = 'directory'
    else if (de.isSymbolicLink()) type = 'symlink'

    let symlinkTarget: string | null = null
    let symlinkTargetType: FSEntry['symlink_target_type'] = null
    if (de.isSymbolicLink()) {
        try {
            symlinkTarget = await readlink(fullPath)
        } catch {
            // ignore
        }
        try {
            const targetStat = await stat(fullPath)
            symlinkTargetType = targetStat.isDirectory() ? 'directory' : 'file'
        } catch {
            // broken symlink — leave as null
        }
    }

    let extension: string | null = null
    if (type === 'file' || type === 'symlink') {
        const ext = path.extname(de.name).slice(1)
        if (ext) extension = ext
    }

    const size = type === 'directory' ? 0 : info.size
    const mode = info.mode & 0o777
    const permissions = formatPermissions(mode)

    return {
        name: de.name,
        type,
        size,
        modified: info.mtime.toISOString(),
        permissions,
        extension,
        hidden: de.name.startsWith('.'),
        symlink_target: symlinkTarget,
        symlink_target_type: symlinkTargetType,
    }
}
```

- [ ] **Step 2: Verify backend compiles**

Run: `cd /home/alexanderb/workspace/fmanager/backend && npx tsc --noEmit 2>&1 | head -40`

Expected: Errors reduced — `fsEntry.ts` no longer errors. Remaining errors are in other providers (SSH, SFTP, BasicFTP, archive adapters).

- [ ] **Step 3: Commit**

```bash
git add backend/src/utils/fsEntry.ts
git commit -m "feat(symlink): resolve symlink target type in LocalProvider"
```

---

### Task 3: Add `symlink_target_type: null` to all archive adapters and implicit dirs

**Files:**
- Modify: `backend/src/archive/adapters/TarAdapter.ts:143,156`
- Modify: `backend/src/archive/adapters/ZipAdapter.ts:46,58`
- Modify: `backend/src/archive/adapters/SevenZipAdapter.ts:102,115`
- Modify: `backend/src/archive/implicitDirs.ts:28`

- [ ] **Step 1: Add field to every FSEntry literal in archive code**

In each file, find every object literal that has `symlink_target: ...` and add `symlink_target_type: null` on the line after it.

**TarAdapter.ts** — two locations (lines ~143 and ~156):
```typescript
symlink_target: null,
symlink_target_type: null,
```
and:
```typescript
symlink_target: header.type === 'symlink' ? (header.linkname ?? null) : null,
symlink_target_type: null,
```

**ZipAdapter.ts** — two locations (lines ~46 and ~58):
```typescript
symlink_target: null,
symlink_target_type: null,
```

**SevenZipAdapter.ts** — two locations (lines ~102 and ~115):
```typescript
symlink_target: null,
symlink_target_type: null,
```

**implicitDirs.ts** — one location (line ~28):
```typescript
symlink_target: null,
symlink_target_type: null,
```

- [ ] **Step 2: Verify archive adapter compilation**

Run: `cd /home/alexanderb/workspace/fmanager/backend && npx tsc --noEmit 2>&1 | grep -c 'error TS'`

Expected: Error count reduced. Remaining errors only in SSH/SFTP/BasicFTP adapters.

- [ ] **Step 3: Commit**

```bash
git add backend/src/archive/
git commit -m "feat(symlink): add symlink_target_type: null to archive adapters"
```

---

### Task 4: Add `symlink_target_type: null` to BasicFTP adapter

**Files:**
- Modify: `backend/src/ftp/adapters/BasicFtpAdapter.ts:125-137`

- [ ] **Step 1: Add field to toFSEntry**

In `BasicFtpAdapter.ts`, add `symlink_target_type: null` after `symlink_target: null` in the `toFSEntry` method:

```typescript
private toFSEntry(info: FileInfo): FSEntry {
    const ext = info.type !== 2 ? (path.extname(info.name).slice(1) || null) : null
    return {
        name: info.name,
        type: info.type === 2 ? 'directory' : info.isSymbolicLink ? 'symlink' : 'file',
        size: info.size,
        modified: info.modifiedAt ? info.modifiedAt.toISOString() : new Date(0).toISOString(),
        permissions: info.permissions?.toString() ?? '',
        extension: ext,
        hidden: info.name.startsWith('.'),
        symlink_target: null,
        symlink_target_type: null,
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/ftp/adapters/BasicFtpAdapter.ts
git commit -m "feat(symlink): add symlink_target_type: null to BasicFTP adapter"
```

---

### Task 5: Resolve symlink target type in SFTP adapter

**Files:**
- Modify: `backend/src/ftp/adapters/SftpAdapter.ts:28-74`

- [ ] **Step 1: Make list() async-resolve symlinks and add field to toFSEntry**

Replace the `list` method and `toFSEntry` in `SftpAdapter.ts`:

```typescript
async list(remotePath: string): Promise<FSEntry[]> {
    const items = await this.client.list(remotePath)
    const entries: FSEntry[] = []
    for (const item of items) {
        const entry = this.toFSEntry(item)
        if (entry.type === 'symlink') {
            try {
                const targetStat = await this.client.stat(remotePath + '/' + item.name)
                entry.symlink_target_type = targetStat.isDirectory ? 'directory' : 'file'
            } catch {
                // broken symlink — leave as null
            }
        }
        entries.push(entry)
    }
    return entries
}
```

Update `toFSEntry` to include the new field:

```typescript
private toFSEntry(item: any): FSEntry {
    const isDir = item.type === 'd'
    const isSymlink = item.type === 'l'
    const ext = !isDir ? (path.extname(item.name).slice(1) || null) : null
    return {
        name: item.name,
        type: isDir ? 'directory' : isSymlink ? 'symlink' : 'file',
        size: item.size,
        modified: new Date(item.modifyTime).toISOString(),
        permissions: item.rights ? `${item.rights.user}${item.rights.group}${item.rights.other}` : '',
        extension: ext,
        hidden: item.name.startsWith('.'),
        symlink_target: null,
        symlink_target_type: null,
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/alexanderb/workspace/fmanager/backend && npx tsc --noEmit 2>&1 | grep -c 'error TS'`

Expected: Error count reduced further. Only SSH adapter remains.

- [ ] **Step 3: Commit**

```bash
git add backend/src/ftp/adapters/SftpAdapter.ts
git commit -m "feat(symlink): resolve symlink target type in SFTP adapter"
```

---

### Task 6: Resolve symlink target type in SSH adapter

**Files:**
- Modify: `backend/src/ssh/SshAdapter.ts:53-88`

- [ ] **Step 1: Add symlink resolution to list()**

Replace the `list` method in `SshAdapter.ts`. After the initial listing, collect symlink full paths and run a second `stat -L` command to resolve their target types:

```typescript
async list(remotePath: string): Promise<FSEntry[]> {
    const escaped = this.shellEscape(remotePath)
    const output = await this.exec(
        `LC_ALL=C stat --format='%F\t%A\t%s\t%Y\t%n' ${escaped}/* ${escaped}/.* 2>/dev/null || true`
    )
    if (!output.trim()) return []

    const entries: FSEntry[] = []
    const symlinkPaths: string[] = []

    for (const line of output.split('\n')) {
        if (!line.trim()) continue
        const parts = line.split('\t')
        if (parts.length < 5) continue

        const [typeStr, perms, sizeStr, mtimeStr, fullPath] = parts
        const name = path.basename(fullPath)
        if (name === '.' || name === '..') continue

        const isDir = typeStr === 'directory'
        const isSymlink = typeStr === 'symbolic link'
        const ext = !isDir ? (path.extname(name).slice(1) || null) : null

        if (isSymlink) symlinkPaths.push(fullPath)

        entries.push({
            name,
            type: isDir ? 'directory' : isSymlink ? 'symlink' : 'file',
            size: parseInt(sizeStr, 10) || 0,
            modified: new Date(parseInt(mtimeStr, 10) * 1000).toISOString(),
            permissions: perms,
            extension: ext,
            hidden: name.startsWith('.'),
            symlink_target: null,
            symlink_target_type: null,
        })
    }

    // Resolve symlink target types in one round-trip
    if (symlinkPaths.length > 0) {
        const escapedPaths = symlinkPaths.map(p => this.shellEscape(p)).join(' ')
        const resolveOutput = await this.exec(
            `LC_ALL=C stat -L --format='%F\t%n' ${escapedPaths} 2>/dev/null || true`
        )
        const targetTypes = new Map<string, 'file' | 'directory'>()
        for (const line of resolveOutput.split('\n')) {
            if (!line.trim()) continue
            const parts = line.split('\t')
            if (parts.length < 2) continue
            const [typeStr, fullPath] = parts
            const name = path.basename(fullPath)
            targetTypes.set(name, typeStr === 'directory' ? 'directory' : 'file')
        }
        for (const entry of entries) {
            if (entry.type === 'symlink' && targetTypes.has(entry.name)) {
                entry.symlink_target_type = targetTypes.get(entry.name)!
            }
        }
    }

    return entries
}
```

- [ ] **Step 2: Verify full backend compiles clean**

Run: `cd /home/alexanderb/workspace/fmanager/backend && npx tsc --noEmit`

Expected: No errors. All providers now include `symlink_target_type`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/ssh/SshAdapter.ts
git commit -m "feat(symlink): resolve symlink target type in SSH adapter"
```

---

### Task 7: Update frontend navigation to follow symlinks to directories

**Files:**
- Modify: `frontend/src/components/FilePanel.vue:271-301`

- [ ] **Step 1: Extend navigate() to handle symlinks to directories**

In `FilePanel.vue`, replace the `navigate` function:

```typescript
async function navigate(entry: FSEntry, event?: MouseEvent | KeyboardEvent) {
  const dir = entryDir(entry)
  const isNavigableDir = entry.type === 'directory' ||
      (entry.type === 'symlink' && entry.symlink_target_type === 'directory')

  if (isNavigableDir) {
    const target = joinPath(dir, entry.name)
    if (event?.ctrlKey || event?.metaKey) {
      emit('open-in-new-tab', target)
      return
    }
    if (props.interceptNavigation) {
      emit('before-navigate', target)
      return
    }
    await maybeCommitFtpArchive(target)
    loadDirectory(target)
  } else if (entry.isArchive) {
    const archivePath = joinPath(dir, entry.name)
    const target = archivePath + '::/'
    if (event?.ctrlKey || event?.metaKey) {
      emit('open-in-new-tab', target)
      return
    }
    if (props.interceptNavigation) {
      emit('before-navigate', target)
      return
    }
    await maybeCommitFtpArchive(target)
    loadDirectory(target)
  } else {
    emit('open-file', joinPath(dir, entry.name))
  }
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd /home/alexanderb/workspace/fmanager/frontend && npx vue-tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FilePanel.vue
git commit -m "feat(symlink): navigate symlinks to directories like regular directories"
```

---

### Task 8: Manual smoke test

- [ ] **Step 1: Create test symlinks**

```bash
mkdir -p /tmp/symlink-test/real-dir
echo "hello" > /tmp/symlink-test/real-dir/file.txt
ln -s /tmp/symlink-test/real-dir /tmp/symlink-test/link-to-dir
ln -s /tmp/symlink-test/real-dir/file.txt /tmp/symlink-test/link-to-file
ln -s /tmp/symlink-test/nonexistent /tmp/symlink-test/broken-link
```

- [ ] **Step 2: Start dev servers and verify**

Run both `make dev-backend` and `make dev-frontend`. Navigate to `/tmp/symlink-test/` in the file panel.

Verify:
- `link-to-dir` shows symlink icon and can be entered (double-click navigates into it, shows `file.txt`)
- `link-to-file` shows symlink icon and does NOT navigate (triggers open-file)
- `broken-link` shows symlink icon and does NOT navigate (triggers open-file)
- `real-dir` navigates normally as before

- [ ] **Step 3: Clean up test fixtures**

```bash
rm -rf /tmp/symlink-test
```
