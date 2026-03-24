import type { ListResponse, DriveEntry } from '@/types/fs'

export async function listDirectory(path: string): Promise<ListResponse> {
  const res = await fetch(`/api/fs/list?path=${encodeURIComponent(path)}`)
  if (!res.ok) {
    return {ok: false, error: {code: 'HTTP_ERROR', message: `Server returned ${res.status}`}}
  }
  return res.json()
}

export async function renameFile(filePath: string, newName: string): Promise<{ok: boolean; error?: {code: string; message: string}}> {
  const res = await fetch('/api/fs/rename', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({path: filePath, newName}),
  })
  return res.json()
}

export async function commitFtpArchive(ftpPath: string): Promise<{ok: boolean; error?: {code: string; message: string}}> {
    const res = await fetch('/api/ftp/archive/commit', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ftpPath}),
    })
    return res.json()
}

export async function discardFtpArchive(ftpPath: string): Promise<void> {
    await fetch('/api/ftp/archive/discard', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ftpPath}),
    })
}

export function downloadFtpArchiveTemp(ftpPath: string): void {
    const url = `/api/ftp/archive/download?ftpPath=${encodeURIComponent(ftpPath)}`
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    a.click()
}

export async function fetchRoots(): Promise<DriveEntry[]> {
    try {
        const res = await fetch('/api/fs/roots')
        if (!res.ok) {
            console.warn('Failed to fetch roots:', res.status)
            return []
        }
        const data = await res.json()
        if (data.ok) return data.roots
        console.warn('Failed to fetch roots:', data.error?.message)
        return []
    } catch (e) {
        console.warn('Failed to fetch roots:', e)
        return []
    }
}
