export interface SavedFtpConnectionDto {
    id: string
    name: string
    protocol: 'ftp' | 'ftps' | 'sftp'
    host: string
    port: number
    username: string
    hasPassword: boolean
    rejectUnauthorized?: boolean
    remotePath: string
}

export interface SaveConnectionInput {
    name?: string
    protocol: 'ftp' | 'ftps' | 'sftp'
    host: string
    port: number
    username: string
    password?: string
    rejectUnauthorized?: boolean
    remotePath?: string
}

export interface ConnectParams {
    protocol: 'ftp' | 'ftps' | 'sftp'
    host: string
    port: number
    username: string
    password?: string
    rejectUnauthorized?: boolean
    remotePath: string
}

export async function listConnections(): Promise<SavedFtpConnectionDto[]> {
    const res = await fetch('/api/ftp-connections')
    const data = await res.json()
    return data.connections ?? []
}

export async function createConnection(input: SaveConnectionInput): Promise<SavedFtpConnectionDto> {
    const res = await fetch('/api/ftp-connections', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error?.message ?? 'Failed to create connection')
    return data.connection
}

export async function updateConnection(id: string, input: SaveConnectionInput): Promise<SavedFtpConnectionDto> {
    const res = await fetch(`/api/ftp-connections/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error?.message ?? 'Failed to update connection')
    return data.connection
}

export async function deleteConnection(id: string): Promise<void> {
    const res = await fetch(`/api/ftp-connections/${id}`, {method: 'DELETE'})
    const data = await res.json()
    if (!data.ok) throw new Error(data.error?.message ?? 'Failed to delete connection')
}

export async function getConnectParams(id: string): Promise<ConnectParams> {
    const res = await fetch(`/api/ftp-connections/${id}/connect-params`)
    const data = await res.json()
    if (!data.ok) throw new Error(data.error?.message ?? 'Connection not found')
    return data.params
}
