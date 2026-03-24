export interface FtpConnectParams {
    protocol: 'ftp' | 'ftps' | 'sftp'
    host: string
    port: number
    username: string
    password: string
}

export interface FtpConnectResponse {
    ok: boolean
    sessionId?: string
    error?: {code: string; message: string}
}

export async function ftpConnect(params: FtpConnectParams): Promise<FtpConnectResponse> {
    const res = await fetch('/api/ftp/connect', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(params),
    })
    return res.json()
}

export async function ftpDisconnect(sessionId: string): Promise<void> {
    await fetch('/api/ftp/disconnect', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({sessionId}),
    })
}
