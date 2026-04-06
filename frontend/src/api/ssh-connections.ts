export interface SavedSshConnectionDto {
    id: string
    name: string
    host: string
    port: number
    username: string
    hasPassword: boolean
    remotePath: string
}

export interface SaveSshConnectionInput {
    name?: string
    host: string
    port: number
    username: string
    password?: string
    remotePath?: string
}

export interface SshConnectParams {
    host: string
    port: number
    username: string
    password?: string
    remotePath: string
}

export async function listSshConnections(): Promise<SavedSshConnectionDto[]> {
    const res = await fetch('/api/ssh-connections')
    const data = await res.json()
    return data.connections ?? []
}

export async function createSshConnection(input: SaveSshConnectionInput): Promise<SavedSshConnectionDto> {
    const res = await fetch('/api/ssh-connections', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error?.message ?? 'Failed to create connection')
    return data.connection
}

export async function updateSshConnection(id: string, input: SaveSshConnectionInput): Promise<SavedSshConnectionDto> {
    const res = await fetch(`/api/ssh-connections/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error?.message ?? 'Failed to update connection')
    return data.connection
}

export async function deleteSshConnection(id: string): Promise<void> {
    const res = await fetch(`/api/ssh-connections/${id}`, {method: 'DELETE'})
    const data = await res.json()
    if (!data.ok) throw new Error(data.error?.message ?? 'Failed to delete connection')
}

export async function getSshConnectParams(id: string): Promise<SshConnectParams> {
    const res = await fetch(`/api/ssh-connections/${id}/connect-params`)
    const data = await res.json()
    if (!data.ok) throw new Error(data.error?.message ?? 'Connection not found')
    return data.params
}
