export interface SshConnectParams {
    host: string
    port: number
    username: string
    password: string
}

export interface SshConnectResponse {
    ok: boolean
    sessionId?: string
    error?: {code: string; message: string}
}

export async function sshConnect(params: SshConnectParams): Promise<SshConnectResponse> {
    const res = await fetch('/api/ssh/connect', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(params),
    })
    return res.json()
}

export async function sshDisconnect(sessionId: string): Promise<void> {
    await fetch('/api/ssh/disconnect', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sessionId}),
    })
}

export async function sshOpenTerminal(params: {host: string; port: number; username: string; password?: string}): Promise<{ok: boolean; error?: {code: string; message: string}}> {
    const res = await fetch('/api/ssh/open-terminal', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(params),
    })
    return res.json()
}
