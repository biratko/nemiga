export interface SavedSshConnection {
    id: string
    name: string
    host: string
    port: number
    username: string
    password?: string
    remotePath: string
}

export interface SavedSshConnectionDto {
    id: string
    name: string
    host: string
    port: number
    username: string
    hasPassword: boolean
    remotePath: string
}
