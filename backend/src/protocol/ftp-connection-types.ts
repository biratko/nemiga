export interface SavedFtpConnection {
    id: string
    name: string
    protocol: 'ftp' | 'ftps' | 'sftp'
    host: string
    port: number
    username: string
    password?: string
    rejectUnauthorized?: boolean
    remotePath: string
}

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
