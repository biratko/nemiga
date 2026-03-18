import type { ListResponse } from '@/types/fs'

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
