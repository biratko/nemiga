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
