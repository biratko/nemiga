# Symlink Directory Navigation

## Problem

Symlinks to directories cannot be navigated like regular directories. The frontend checks `entry.type === 'directory'` to decide whether to enter a path. Symlinks have `type: 'symlink'`, so they fall through to the "open file" handler.

## Solution

Add `symlink_target_type: 'file' | 'directory' | null` to `FSEntry`. Providers resolve the target type for symlinks where possible. The frontend uses this field to navigate symlinks to directories the same way as regular directories.

## Backend Changes

### FSEntry type (`backend/src/protocol/fs-types.ts`)

Add field:

```typescript
symlink_target_type: 'file' | 'directory' | null
```

All non-symlink entries set this to `null`. Symlink entries set it to the resolved target type, or `null` if resolution is unavailable/fails.

### LocalProvider (`backend/src/utils/fsEntry.ts`)

For symlinks, call `stat()` (follows symlinks) after `lstat()` to determine target type:

```typescript
if (de.isSymbolicLink()) {
    try {
        const targetStat = await stat(fullPath)
        symlinkTargetType = targetStat.isDirectory() ? 'directory' : 'file'
    } catch {
        // broken symlink — leave as null
    }
}
```

### SSH (`backend/src/ssh/SshAdapter.ts`)

After listing, collect symlink names. Run a single `stat -L --format='%F\t%n'` command for all symlinks to resolve target types in one round-trip:

```
stat -L --format='%F\t%n' /path/link1 /path/link2 2>/dev/null || true
```

Parse output to map each symlink name to `'directory'` or `'file'`. Broken symlinks (missing from output) get `null`.

### SFTP (`backend/src/ftp/adapters/SftpAdapter.ts`)

For symlink entries, call `this.client.stat(fullPath)` which follows symlinks (unlike the listing which uses lstat). Check if result indicates directory.

Change `list()` from sync `.map()` to async resolution so stat calls can be awaited.

### BasicFTP (`backend/src/ftp/adapters/BasicFtpAdapter.ts`)

Set `symlink_target_type: null`. FTP protocol does not provide symlink resolution.

### Archive adapters

Set `symlink_target_type: null`. Archive symlinks are internal references — navigation does not apply.

## Frontend Changes

### FSEntry type (`frontend/src/types/fs.ts`)

Add field:

```typescript
symlink_target_type: 'file' | 'directory' | null
```

### FilePanel navigate (`frontend/src/components/FilePanel.vue`)

Extend the directory navigation condition to include symlinks to directories:

```typescript
const isNavigable = entry.type === 'directory' ||
    (entry.type === 'symlink' && entry.symlink_target_type === 'directory')

if (isNavigable) {
    // existing directory navigation logic
}
```

## What Does NOT Change

- **Symlink icon** — `FileIcon.vue` still shows symlink icon for `type === 'symlink'`
- **Archive detection** — symlinks to archives are not auto-detected as archives (future work)
- **Sorting** — symlinks to directories are not grouped with directories
- **Copy/move behavior** — unchanged, already handles symlinks via `followSymlinks` option
