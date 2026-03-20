export interface FSEntry {
  name: string
  type: 'file' | 'directory' | 'symlink'
  size: number
  modified: string
  permissions: string
  extension: string | null
  hidden: boolean
  symlink_target: string | null
  isArchive?: boolean
}

export interface ListResponse {
  ok: boolean
  path?: string
  entries?: FSEntry[]
  error?: {
    code: string
    message: string
  }
}

export interface DriveEntry {
    name: string
    path: string
}
