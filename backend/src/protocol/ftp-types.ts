export interface FtpConnectionParams {
    protocol: 'ftp' | 'ftps' | 'sftp'
    host: string
    port: number
    username: string
    password: string
    rejectUnauthorized?: boolean
}

export interface FtpConnectRequest extends FtpConnectionParams {}

export interface FtpConnectResult {
    ok: true
    sessionId: string
}

export interface FtpDisconnectRequest {
    sessionId: string
}
